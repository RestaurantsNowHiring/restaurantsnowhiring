import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "runScheduledAtsSyncs.ts");
function loadWorker() {
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n\n', "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    if (name === "./runEmployerAtsSync") return { runEmployerAtsSync: async () => ({ status: "completed" }) };
    if (name === "./atsSyncFailureNotifications") return { handleAtsSyncFailureNotification: async () => ({ status: "skipped" }) };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
const { runScheduledAtsSyncs, ATS_SYNC_WORKER_CONCURRENCY, ATS_SYNC_WORKER_PAGE_SIZE, ATS_SYNC_WORKER_MAX_RUNTIME_MS } = loadWorker();

function db(pages) {
  const calls = [];
  return { calls, database: { async listEligibleConnections(input) { calls.push(input); const page = pages.shift(); return page instanceof Error ? { data: null, error: page } : { data: page ?? [], error: null }; } } };
}

test("exports conservative worker constants", () => {
  assert.equal(ATS_SYNC_WORKER_CONCURRENCY, 3);
  assert.equal(ATS_SYNC_WORKER_PAGE_SIZE, 100);
  assert.equal(ATS_SYNC_WORKER_MAX_RUNTIME_MS, 45_000);
});

test("query is paginated for enabled active/error connections in deterministic phases", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }], [], [{ id: "b", last_sync_started_at: "2026-08-04T00:00:00.000Z" }], []]);
  const calls = [];
  const result = await runScheduledAtsSyncs({ database: context.database, pageSize: 1, runner: async (input) => { calls.push(input); return { status: "completed" }; } });
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, [{ connectionId: "a" }, { connectionId: "b" }]);
  assert.deepEqual(context.calls.map((call) => call.cursor), [
    { phase: "null-started", id: null },
    { phase: "null-started", id: "a" },
    { phase: "started", startedAt: null, id: null },
    { phase: "started", startedAt: "2026-08-04T00:00:00.000Z", id: "b" },
  ]);
});

test("runner is called once per returned connection and duplicates are skipped", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }, { id: "a", last_sync_started_at: null }], []]);
  const calls = [];
  const result = await runScheduledAtsSyncs({ database: context.database, runner: async (input) => { calls.push(input); return { status: "completed" }; } });
  assert.equal(result.summary.attempted, 1);
  assert.deepEqual(calls, [{ connectionId: "a" }]);
});

test("bounded concurrency is respected", async () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, last_sync_started_at: null }));
  const context = db([rows, []]);
  let active = 0;
  let maxActive = 0;
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  const resultPromise = runScheduledAtsSyncs({ database: context.database, concurrency: 3, runner: async () => { active += 1; maxActive = Math.max(maxActive, active); await gate; active -= 1; return { status: "completed" }; } });
  await new Promise((resolveTick) => setTimeout(resolveTick, 20));
  assert.equal(maxActive, 3);
  release();
  const result = await resultPromise;
  assert.equal(result.summary.completed, 8);
});

test("aggregate runner result mapping is safe", async () => {
  const statuses = ["completed", "completed-with-warning", "already-running", "disabled", "disconnected", "retrieval-failed", "unsupported-provider", "database-failed", "connection-unavailable"];
  const context = db([statuses.map((_, i) => ({ id: `c${i}`, last_sync_started_at: null })), []]);
  let index = 0;
  const result = await runScheduledAtsSyncs({ database: context.database, runner: async () => ({ status: statuses[index++], message: "raw https://secret/jobs/1", connectionId: "secret" }) });
  assert.deepEqual(result.summary, { attempted: 9, completed: 1, completedWithWarning: 1, alreadyRunning: 1, skipped: 2, failed: 4 });
  assert.doesNotMatch(JSON.stringify(result), /secret|https|jobs|connectionId/);
});

test("initial query failure returns safe 500 payload and runs nothing", async () => {
  const context = db([new Error("database url secret")]);
  const calls = [];
  const result = await runScheduledAtsSyncs({ database: context.database, runner: async (input) => { calls.push(input); return { status: "completed" }; } });
  assert.deepEqual(result, { status: "failed", message: "Scheduled job synchronization could not start." });
  assert.equal(calls.length, 0);
});

test("later page failure returns completed-with-warning with prior counts", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }], new Error("private")]);
  const result = await runScheduledAtsSyncs({ database: context.database, runner: async () => ({ status: "completed" }) });
  assert.deepEqual(result, { status: "completed-with-warning", summary: { attempted: 1, completed: 1, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 0 }, hasMore: true, message: "Some job sources could not be scheduled during this run." });
});

test("runtime budget stops new claims and reports hasMore", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }, { id: "b", last_sync_started_at: null }]]);
  let tick = 0;
  const calls = [];
  const result = await runScheduledAtsSyncs({ database: context.database, maxRuntimeMs: 5, now: () => tick++ * 10, runner: async (input) => { calls.push(input); return { status: "completed" }; } });
  assert.equal(result.hasMore, true);
  assert.equal(result.summary.attempted, 0);
  assert.deepEqual(calls, []);
});

test("overlapping invocations remain safe because runner controls claiming", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }], []]);
  const result = await runScheduledAtsSyncs({ database: context.database, runner: async () => ({ status: "already-running", message: "safe" }) });
  assert.equal(result.summary.alreadyRunning, 1);
  assert.equal(result.summary.failed, 0);
});

test("default query filters only enabled active/error connections and does not duplicate sync logic", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.match(source, /\.eq\("enabled", true\)/);
  assert.match(source, /\.in\("connection_status", \["active", "error"\]\)/);
  assert.doesNotMatch(source, /\.update\(|\.insert\(|markStarted|syncEmployerAtsConnection|previewJobImport|importPreparedJobs/);
});


test("notifier runs after each completed connection and cannot stop scheduler", async () => {
  const context = db([[{ id: "a", last_sync_started_at: null }, { id: "b", last_sync_started_at: null }], []]);
  const notices = [];
  const result = await runScheduledAtsSyncs({
    database: context.database,
    runner: async ({ connectionId }) => ({ status: connectionId === "a" ? "retrieval-failed" : "completed", message: "safe" }),
    notifier: async (connectionId, syncResult) => { notices.push({ connectionId, status: syncResult.status }); if (connectionId === "a") throw new Error("smtp secret"); },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.summary, { attempted: 2, completed: 1, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 1 });
  assert.deepEqual(notices, [{ connectionId: "a", status: "retrieval-failed" }, { connectionId: "b", status: "completed" }]);
});

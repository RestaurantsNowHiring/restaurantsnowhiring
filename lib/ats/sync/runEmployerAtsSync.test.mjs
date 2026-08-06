import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "runEmployerAtsSync.ts");
function loadRunner() {
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n\n', "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    if (name === "./syncEmployerAtsConnection") return { syncEmployerAtsConnection: () => { throw new Error("uninjected engine"); } };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
const { runEmployerAtsSync, ATS_SYNC_STALE_AFTER_MS } = loadRunner();
const completed = { status: "completed", connectionId: "connection-1", summary: { updated: 2, closed: 1, reopened: 1, needsReview: 1, newAvailable: 3, failed: 0 }, Updated: [], Closed: [], Reopened: [], NeedsReview: [], NewAvailable: [], Unchanged: [], Failed: [] };

function setup({ connection = {}, startError = false, startConflict = false, finalError = false, engine = completed, engineThrows = false } = {}) {
  const calls = { starts: [], updates: [], sync: [], historyStarts: [], historyUpdates: [] };
  const row = { id: "connection-1", enabled: true, connection_status: "active", consecutive_failure_count: 2, last_sync_started_at: null, last_successful_sync_at: null, last_failed_sync_at: "2026-07-01T00:00:00.000Z", ...connection };
  const database = {
    async getConnection() { return { data: connection === null ? null : row, error: null }; },
    async markStarted(id, previous, payload) { calls.starts.push({ id, previous, payload }); return { data: startConflict ? null : { id }, error: startError ? { message: "raw start secret" } : null }; },
    async updateConnection(id, payload) { calls.updates.push({ id, payload }); return { data: finalError ? null : { id }, error: finalError ? { message: "raw final secret" } : null }; },
    async createHistory(payload) { calls.historyStarts.push(payload); return { data: { id: "history-1" }, error: null }; },
    async updateHistory(id, payload) { calls.historyUpdates.push({ id, payload }); return { data: { id }, error: null }; },
  };
  const times = [new Date("2026-08-04T10:00:00.000Z"), new Date("2026-08-04T10:05:00.000Z")];
  return { calls, dependencies: { database, now: () => times.shift(), sync: async (input) => { calls.sync.push(input); if (engineThrows) throw new Error("provider url stack secret"); return engine; } } };
}

test("missing, disabled, and disconnected connections do not write or invoke the engine", async () => {
  for (const [connection, status] of [[null, "connection-unavailable"], [{ enabled: false }, "disabled"], [{ connection_status: "disconnected" }, "disconnected"]]) {
    const context = setup({ connection }); assert.equal((await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies)).status, status);
    assert.equal(context.calls.starts.length, 0); assert.equal(context.calls.updates.length, 0); assert.equal(context.calls.sync.length, 0);
  }
});
test("recent runs are blocked and the 30-minute stale boundary permits retry", async () => {
  assert.equal(ATS_SYNC_STALE_AFTER_MS, 1_800_000);
  const recent = setup({ connection: { last_sync_started_at: "2026-08-04T09:31:00.000Z" } }); assert.equal((await runEmployerAtsSync({ connectionId: "connection-1" }, recent.dependencies)).status, "already-running"); assert.equal(recent.calls.sync.length, 0);
  const stale = setup({ connection: { last_sync_started_at: "2026-08-04T09:30:00.000Z" } }); assert.equal((await runEmployerAtsSync({ connectionId: "connection-1" }, stale.dependencies)).status, "completed"); assert.equal(stale.calls.sync.length, 1);
});
test("start failures prevent the engine and conditional conflicts are already-running", async () => {
  for (const [options, status] of [[{ startError: true }, "database-failed"], [{ startConflict: true }, "already-running"]]) {
    const context = setup(options); const result = await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies); assert.equal(result.status, status); assert.equal(context.calls.sync.length, 0); assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});
test("completion uses injected timestamps, invokes once, resets state, and preserves failure history", async () => {
  const context = setup(); const result = await runEmployerAtsSync({ connectionId: " connection-1 " }, context.dependencies);
  assert.equal(result.status, "completed"); assert.deepEqual(context.calls.sync, [{ connectionId: "connection-1" }]);
  assert.deepEqual(context.calls.starts[0].payload, { last_sync_started_at: "2026-08-04T10:00:00.000Z", updated_at: "2026-08-04T10:00:00.000Z" });
  assert.deepEqual(context.calls.historyStarts[0], { connection_id: "connection-1", started_at: "2026-08-04T10:00:00.000Z", status: "running" });
  assert.deepEqual(context.calls.updates[0].payload, { last_successful_sync_at: "2026-08-04T10:05:00.000Z", connection_status: "active", consecutive_failure_count: 0, last_failure_code: null, updated_at: "2026-08-04T10:05:00.000Z" }); assert.equal("last_failed_sync_at" in context.calls.updates[0].payload, false);
  assert.deepEqual(context.calls.historyUpdates[0].payload, { completed_at: "2026-08-04T10:05:00.000Z", status: "completed", completed: 1, updated: 2, closed: 1, reopened: 1, new_available: 3, needs_review: 1, failed: 0, warning_message: null });
});
test("bounded failures increment prior count and store fixed safe codes", async () => {
  for (const [status, code] of [["retrieval-failed", "retrieval_failed"], ["unsupported-provider", "unsupported_provider"], ["database-failed", "database_failed"], ["connection-unavailable", "connection_unavailable"]]) {
    const context = setup({ engine: { status, message: "raw secret https://private" } }); const result = await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies);
    assert.equal(result.status, status); assert.equal(result.consecutiveFailureCount, 3); assert.equal(context.calls.sync.length, 1);
    assert.equal(context.calls.updates[0].payload.last_failure_code, code); assert.equal(context.calls.updates[0].payload.consecutive_failure_count, 3); assert.equal(context.calls.historyUpdates[0].payload.status, "failed"); assert.doesNotMatch(JSON.stringify({ result, writes: context.calls.updates, history: context.calls.historyUpdates }), /secret|private/);
  }
});
test("engine disabled and disconnected results do not increment failures", async () => {
  for (const status of ["disabled", "disconnected"]) { const context = setup({ engine: { status, message: "ignored" } }); assert.equal((await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies)).status, status); assert.equal(context.calls.updates.length, 0); assert.equal(context.calls.sync.length, 1); }
});
test("unexpected throws record unexpected_failure without exposing exceptions", async () => {
  const context = setup({ engineThrows: true }); const result = await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies); assert.equal(result.status, "database-failed"); assert.equal(context.calls.updates[0].payload.last_failure_code, "unexpected_failure"); assert.doesNotMatch(JSON.stringify(result), /provider|stack|secret/);
});
test("failure-state write errors return a safe wrapper without retry", async () => {
  const context = setup({ engine: { status: "retrieval-failed", message: "raw" }, finalError: true }); assert.deepEqual(await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies), { status: "database-failed", message: "The synchronization service is temporarily unavailable." }); assert.equal(context.calls.sync.length, 1);
});
test("success-state write errors preserve completed sync as a warning without retry", async () => {
  const context = setup({ finalError: true }); const result = await runEmployerAtsSync({ connectionId: "connection-1" }, context.dependencies); assert.equal(result.status, "completed-with-warning"); assert.equal(result.sync, completed); assert.equal(context.calls.sync.length, 1); assert.doesNotMatch(JSON.stringify(result), /secret/);
});

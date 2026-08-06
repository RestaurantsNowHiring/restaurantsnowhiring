import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");
function loadRoute() {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (name.endsWith("/lib/billing")) return { getAuthUserFromRequest: async () => null };
    if (name.endsWith("/lib/employerAccounts")) return { getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true }), getSelectedEmployerAccountIdFromRequest: () => null, assertEmployerPermission: () => {} };
    if (name.endsWith("/lib/supabaseAdmin")) return { getSupabaseAdminClient: () => null };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
const { handleEmployerAtsSyncHistoryGet } = loadRoute();
function request(query = "connectionId=connection-1&page=2&pageSize=250") { return new Request(`https://example.com/api/employer/ats/sync-history?${query}`); }
function dependencies(overrides = {}) {
  const calls = { list: [] };
  return { calls, deps: {
    getAuthUserFromRequest: async () => ({ id: "user-1" }),
    getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true }),
    getSelectedEmployerAccountIdFromRequest: () => null,
    assertEmployerPermission: (context, permission) => { calls.permission = permission; if (!context.canManageJobs) { const error = new Error("nope"); error.name = "EmployerPermissionError"; throw error; } },
    database: {
      connectionBelongsToAccount: async (connectionId, accountId) => ({ data: connectionId === "missing" ? null : { id: connectionId, accountId }, error: null }),
      listHistory: async (connectionId, from, to) => { calls.list.push({ connectionId, from, to }); return { count: 1, error: null, data: [{ id: "history-1", connection_id: connectionId, started_at: "2026-08-04T10:00:00.000Z", completed_at: "2026-08-04T10:01:05.000Z", status: "completed", completed: 1, updated: 2, closed: 3, reopened: 4, new_available: 5, needs_review: 6, failed: 7, warning_message: null }] }; },
    },
    ...overrides,
  } };
}
async function json(response) { return { status: response.status, body: await response.json() }; }

test("sync history requires auth, permission, connection id, and ownership", async () => {
  assert.equal((await json(await handleEmployerAtsSyncHistoryGet(request(), { ...dependencies().deps, getAuthUserFromRequest: async () => null }))).status, 401);
  assert.equal((await json(await handleEmployerAtsSyncHistoryGet(request(""), dependencies().deps))).status, 400);
  assert.equal((await json(await handleEmployerAtsSyncHistoryGet(request("connectionId=missing"), dependencies().deps))).status, 404);
  assert.equal((await json(await handleEmployerAtsSyncHistoryGet(request(), { ...dependencies().deps, getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: false }) }))).status, 403);
});

test("sync history returns newest-first paginated rows with capped page size", async () => {
  const context = dependencies();
  const response = await json(await handleEmployerAtsSyncHistoryGet(request(), context.deps));
  assert.equal(response.status, 200);
  assert.deepEqual(context.calls.list, [{ connectionId: "connection-1", from: 100, to: 199 }]);
  assert.equal(response.body.pageSize, 100);
  assert.equal(response.body.history[0].newAvailable, 5);
  assert.equal(response.body.history[0].warningMessage, null);
  assert.equal(context.calls.permission, "canManageJobs");
});

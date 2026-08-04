import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");
const validId = "123e4567-e89b-12d3-a456-426614174000";

function loadRoute() {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json(body, init = {}) { return Response.json(body, init); } } };
    if (specifier.endsWith("/lib/ats/sync/runEmployerAtsSync")) return { runEmployerAtsSync: async () => ({ status: "completed" }) };
    if (specifier.endsWith("/lib/billing")) return { getAuthUserFromRequest: async () => null };
    if (specifier.endsWith("/lib/employerAccounts")) return { getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true }), getSelectedEmployerAccountIdFromRequest: () => null, assertEmployerPermission: () => {} };
    if (specifier.endsWith("/lib/supabaseAdmin")) return { getSupabaseAdminClient: () => null };
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

function jsonRequest(body, headers = {}) {
  return new Request("https://example.com/api/employer/ats/sync", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function dependencies(overrides = {}) {
  const calls = overrides.calls ?? { runner: [], ownership: [] };
  return {
    getAuthUserFromRequest: async () => ({ id: "user_1", email: "owner@example.com" }),
    getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true, role: "account_owner" }),
    getSelectedEmployerAccountIdFromRequest: () => null,
    assertEmployerPermission: (context, permission) => { assert.equal(permission, "canManageJobs"); if (!context.canManageJobs) { const error = new Error("forbidden secret"); error.name = "EmployerPermissionError"; throw error; } },
    database: { connectionBelongsToEmployer: async (connectionId, employerAccountId) => { calls.ownership.push({ connectionId, employerAccountId }); return { found: true }; } },
    runEmployerAtsSync: async (input) => { calls.runner.push(input); return { status: "completed", sync: { status: "completed", summary: { updated: 1 } } }; },
    ...overrides,
  };
}

async function responseJson(response) { return { status: response.status, body: await response.json() }; }
const { handleEmployerAtsSyncPost } = loadRoute();

test("authentication is required and runner is not called", async () => {
  const calls = { runner: [], ownership: [] };
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ calls, getAuthUserFromRequest: async () => null })));
  assert.deepEqual(result, { status: 401, body: { error: "Unauthorized." } });
  assert.equal(calls.runner.length, 0);
});

test("account access failure returns 403", async () => {
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ getEmployerAccountContext: async () => ({ accountId: null }) })));
  assert.deepEqual(result, { status: 403, body: { error: "Employer account not found." } });
});

test("missing permission returns 403 and does not call runner", async () => {
  const calls = { runner: [], ownership: [] };
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ calls, getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: false }) })));
  assert.deepEqual(result, { status: 403, body: { error: "Could not synchronize ATS connection." } });
  assert.equal(calls.runner.length, 0);
});

test("rejects bad JSON", async () => {
  assert.deepEqual(await responseJson(await handleEmployerAtsSyncPost(jsonRequest("{"), dependencies())), { status: 400, body: { error: "Request body must be valid JSON." } });
});

test("rejects oversized request by content-length", async () => {
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }, { "content-length": String(64 * 1024 + 1) }), dependencies()));
  assert.deepEqual(result, { status: 400, body: { error: "Request body is too large." } });
});

test("rejects oversized streamed request", async () => {
  const body = JSON.stringify({ connectionId: validId, padding: "x".repeat(64 * 1024) });
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest(body), dependencies()));
  assert.deepEqual(result, { status: 400, body: { error: "Request body is too large." } });
});

test("validates schema and UUID", async () => {
  for (const body of [{}, { connectionId: "" }, { connectionId: "not-a-uuid" }, { connectionId: validId, provider: "greenhouse" }, { provider: "greenhouse" }, { employerAccountId: "acct_2", connectionId: validId }, { jobIds: [], connectionId: validId }]) {
    const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest(body), dependencies()));
    assert.equal(result.status, 400);
  }
});

test("verifies connection ownership with trimmed UUID before runner", async () => {
  const calls = { runner: [], ownership: [] };
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: ` ${validId} ` }), dependencies({ calls })));
  assert.equal(result.status, 200);
  assert.deepEqual(calls.ownership, [{ connectionId: validId, employerAccountId: "acct_1" }]);
  assert.deepEqual(calls.runner, [{ connectionId: validId }]);
});

test("cross-account connection returns 404 and runner is not called", async () => {
  const calls = { runner: [], ownership: [] };
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ calls, database: { connectionBelongsToEmployer: async () => ({ found: false }) } })));
  assert.deepEqual(result, { status: 404, body: { error: "ATS connection not found." } });
  assert.equal(calls.runner.length, 0);
});

test("ownership database failure returns safe 500", async () => {
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ database: { connectionBelongsToEmployer: async () => ({ found: false, error: true }) } })));
  assert.deepEqual(result, { status: 500, body: { error: "Could not synchronize ATS connection." } });
});

for (const status of ["completed", "completed-with-warning", "already-running", "disabled", "disconnected", "unsupported-provider", "retrieval-failed"]) {
  test(`runner status ${status} returns 200`, async () => {
    const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ runEmployerAtsSync: async () => ({ status, message: "safe" }) })));
    assert.deepEqual(result, { status: 200, body: { status, message: "safe" } });
  });
}

test("unexpected route exception returns safe 500", async () => {
  const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ runEmployerAtsSync: async () => { throw new Error("database url stack secret"); } })));
  assert.deepEqual(result, { status: 500, body: { error: "Could not synchronize ATS connection." } });
});

test("hiring manager may still use Sync Now", async () => { const calls = { runner: [], ownership: [] }; const result = await responseJson(await handleEmployerAtsSyncPost(jsonRequest({ connectionId: validId }), dependencies({ calls, getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true, role: "hiring_manager" }) }))); assert.deepEqual(result, { status: 200, body: { status: "completed", sync: { status: "completed", summary: { updated: 1 } } } }); assert.deepEqual(calls.runner, [{ connectionId: validId }]); });

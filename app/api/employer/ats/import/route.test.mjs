import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");

function loadRoute() {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (specifier.endsWith("/importPreparedJobs")) return { importPreparedJobs: async () => emptyResult };
    if (specifier.endsWith("/prepareJobImport")) return { prepareJobImport: async () => prepared };
    if (specifier.endsWith("/lib/ats/types")) return {};
    if (specifier.endsWith("/lib/billing")) return { getAuthUserFromRequest: async () => null };
    if (specifier.endsWith("/lib/employerAccounts")) return { getEmployerAccountContext: async () => ({}), getSelectedEmployerAccountIdFromRequest: () => null, assertEmployerPermission: () => {} };
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

const emptyResult = { Imported: [], Updated: [], Skipped: [], Failed: [] };
const preparedItems = [{ status: "ready", providerKey: "greenhouse", externalId: "12345", job: { title: "Server title" } }];
const prepared = { status: "prepared", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example", items: preparedItems, summary: { requested: 1, ready: 1, needsReview: 0, unavailable: 0 } };
const validBody = { careersPageUrl: "https://example.com/careers", selectedJobKeys: [{ providerKey: "greenhouse", externalId: "12345" }], reviewCorrections: [] };

function dependencies(overrides = {}) {
  return {
    getAuthUserFromRequest: async () => ({ id: "user_1" }),
    getEmployerAccountContext: async () => ({ accountId: "server_account", canManageJobs: true }),
    getSelectedEmployerAccountIdFromRequest: () => "selected_account",
    assertEmployerPermission: (context, permission) => { assert.equal(permission, "canManageJobs"); if (!context.canManageJobs) { const error = new Error("secret forbidden"); error.name = "EmployerPermissionError"; throw error; } },
    prepareJobImport: async () => prepared,
    importPreparedJobs: async () => emptyResult,
    ...overrides,
  };
}

function request(body, headers = {}) {
  return new Request("https://example.com/api/employer/ats/import", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

const { handleAtsImportPost } = loadRoute();
async function call(body, overrides = {}, headers = {}) {
  const response = await handleAtsImportPost(request(body, headers), dependencies(overrides));
  return { status: response.status, body: await response.json() };
}

test("unauthenticated requests return 401", async () => assert.deepEqual(await call(validBody, { getAuthUserFromRequest: async () => null }), { status: 401, body: { error: "Unauthorized." } }));

test("missing account access returns 403", async () => assert.deepEqual(await call(validBody, { getEmployerAccountContext: async () => ({ accountId: null }) }), { status: 403, body: { error: "Employer account not found." } }));

test("users without canManageJobs return a sanitized 403", async () => {
  const original = console.error; console.error = () => {};
  try { assert.deepEqual(await call(validBody, { getEmployerAccountContext: async () => ({ accountId: "a", canManageJobs: false }) }), { status: 403, body: { error: "We couldn’t import your jobs right now. Please try again." } }); }
  finally { console.error = original; }
});

test("malformed JSON returns 400", async () => assert.deepEqual(await call("{"), { status: 400, body: { error: "Request body must be valid JSON." } }));

test("Content-Length precheck rejects oversized bodies", async () => {
  let called = false;
  const result = await call(validBody, { prepareJobImport: async () => { called = true; return prepared; } }, { "content-length": String(5 * 1024 * 1024 + 1) });
  assert.equal(called, false); assert.deepEqual(result, { status: 400, body: { error: "Request body is too large." } });
});

test("streamed byte counting rejects oversized bodies", async () => {
  let called = false;
  const result = await call({ ...validBody, reviewCorrections: [{ providerKey: "g", externalId: "1", description: "x".repeat(5 * 1024 * 1024) }] }, { prepareJobImport: async () => { called = true; return prepared; } });
  assert.equal(called, false); assert.deepEqual(result, { status: 400, body: { error: "Request body is too large." } });
});

const invalidCases = [
  ["missing careersPageUrl", { selectedJobKeys: validBody.selectedJobKeys, reviewCorrections: [] }, "careersPageUrl is required."],
  ["empty selectedJobKeys", { ...validBody, selectedJobKeys: [] }, "selectedJobKeys must contain between 1 and 500 items."],
  ["501 selectedJobKeys", { ...validBody, selectedJobKeys: Array.from({ length: 501 }, (_, i) => ({ providerKey: "greenhouse", externalId: String(i) })) }, "selectedJobKeys must contain between 1 and 500 items."],
  ["malformed selected identity", { ...validBody, selectedJobKeys: [{ providerKey: " ", externalId: "1" }] }, "Each providerKey must be a non-empty string."],
  ["malformed correction", { ...validBody, reviewCorrections: [{ providerKey: "greenhouse", externalId: "1", city: 4 }] }, "Correction city must be a string."],
  ["unsupported correction field", { ...validBody, reviewCorrections: [{ providerKey: "greenhouse", externalId: "1", title: "Client title" }] }, "Review corrections contain an unsupported field."],
  ["unexpected top-level ownership field", { ...validBody, employerAccountId: "client_account" }, "Request body contains unexpected fields."],
];
for (const [name, body, message] of invalidCases) test(`${name} returns 400`, async () => assert.deepEqual(await call(body), { status: 400, body: { error: message } }));

test("exactly 500 selections are accepted", async () => {
  const selectedJobKeys = Array.from({ length: 500 }, (_, i) => ({ providerKey: "greenhouse", externalId: `job-${i}` }));
  let count = 0;
  const result = await call({ ...validBody, selectedJobKeys }, { prepareJobImport: async (input) => { count = input.selectedJobKeys.length; return prepared; } });
  assert.equal(count, 500); assert.equal(result.status, 200);
});

for (const status of ["invalid-request", "discovery-failed", "no-job-links", "unsupported", "retrieval-failed"]) test(`${status} is handled without importing`, async () => {
  let imported = false;
  const serviceResult = { status, message: `Safe ${status}.` };
  const result = await call(validBody, { prepareJobImport: async () => serviceResult, importPreparedJobs: async () => { imported = true; return emptyResult; } });
  assert.equal(imported, false);
  assert.deepEqual(result, { status: status === "invalid-request" ? 400 : 200, body: serviceResult });
});

test("prepared items, corrections, and server-resolved account are passed to import", async () => {
  let input;
  const reviewCorrections = [{ providerKey: " greenhouse ", externalId: " 12345 ", city: "Baltimore", state: "MD", roleCategory: "Manager", employmentType: "Full time", description: "<p>Reviewed</p>" }];
  const result = await call({ ...validBody, careersPageUrl: " https://example.com/careers ", selectedJobKeys: [{ providerKey: " greenhouse ", externalId: " 12345 " }], reviewCorrections }, { importPreparedJobs: async (value) => { input = value; return emptyResult; } });
  assert.equal(result.status, 200);
  assert.deepEqual(input, { employerAccountId: "server_account", preparedJobs: preparedItems, reviewCorrections: [{ ...reviewCorrections[0], providerKey: "greenhouse", externalId: "12345" }] });
});

test("client job objects, URLs, status, and account data are rejected before services", async () => {
  for (const field of ["jobs", "sourceUrl", "applyUrl", "status", "active", "employerAccountId"]) {
    let called = false;
    const result = await call({ ...validBody, [field]: "untrusted" }, { prepareJobImport: async () => { called = true; return prepared; } });
    assert.equal(called, false); assert.equal(result.status, 400);
  }
});

const outcomes = [
  ["full success", { Imported: [{ providerKey: "g", externalId: "1", message: "ok" }], Updated: [], Skipped: [], Failed: [] }, { imported: 1, updated: 0, skipped: 0, failed: 0 }],
  ["partial success", { Imported: [{ providerKey: "g", externalId: "1", message: "ok" }], Updated: [{ providerKey: "g", externalId: "2", message: "ok" }], Skipped: [{ providerKey: "g", externalId: "3", message: "skip" }], Failed: [{ providerKey: "g", externalId: "4", message: "fail" }] }, { imported: 1, updated: 1, skipped: 1, failed: 1 }],
  ["all failures", { Imported: [], Updated: [], Skipped: [], Failed: [{ providerKey: "g", externalId: "1", message: "safe fail" }, { providerKey: "g", externalId: "2", message: "safe fail" }] }, { imported: 0, updated: 0, skipped: 0, failed: 2 }],
];
for (const [name, serviceResult, summary] of outcomes) test(`${name} returns completed HTTP 200 with counts`, async () => {
  const result = await call(validBody, { importPreparedJobs: async () => serviceResult });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { status: "completed", summary, ...serviceResult });
});

test("unexpected errors return sanitized 500 without raw text", async () => {
  const original = console.error; console.error = () => {};
  try { const result = await call(validBody, { importPreparedJobs: async () => { throw new Error("raw Supabase secret"); } }); assert.equal(result.status, 500); assert.deepEqual(result.body, { error: "We couldn’t import your jobs right now. Please try again." }); assert.equal(JSON.stringify(result.body).includes("Supabase"), false); }
  finally { console.error = original; }
});

test("route exposes no direct database or persistence dependency", () => {
  const source = readFileSync(routePath, "utf8");
  assert.doesNotMatch(source, /supabase|\.from\(|database\.(?:insert|update)|billing quantity|stripe/i);
  assert.equal(Object.keys(dependencies()).some((name) => /database|insert|update|billing|audit|sync/i.test(name)), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");

function loadRoute() {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (specifier.endsWith("/lib/ats/import/prepareJobImport")) return { prepareJobImport: async () => ({ status: "unsupported", message: "unused" }) };
    if (specifier.endsWith("/lib/ats/types")) return {};
    if (specifier.endsWith("/lib/billing")) return { getAuthUserFromRequest: async () => null };
    if (specifier.endsWith("/lib/employerAccounts")) return {
      getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true }),
      getSelectedEmployerAccountIdFromRequest: () => null,
      assertEmployerPermission: () => {},
    };
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

function jsonRequest(body, headers = {}) {
  return new Request("https://example.com/api/employer/ats/prepare-import", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = { careersPageUrl: "https://example.com/careers", selectedJobKeys: [{ providerKey: "greenhouse", externalId: "12345" }] };
const prepared = {
  status: "prepared", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example",
  items: [{ status: "ready", providerKey: "greenhouse", externalId: "12345", job: { title: "Server job" } }],
  summary: { requested: 1, ready: 1, needsReview: 0, unavailable: 0 },
};

function dependencies(overrides = {}) {
  return {
    getAuthUserFromRequest: async () => ({ id: "user_1", email: "owner@example.com" }),
    getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true, role: "account_owner" }),
    getSelectedEmployerAccountIdFromRequest: (request) => request.headers.get("x-employer-account-id")?.trim() || null,
    assertEmployerPermission: (context) => {
      if (!context.canManageJobs) { const error = new Error("forbidden"); error.name = "EmployerPermissionError"; throw error; }
    },
    prepareJobImport: async () => prepared,
    ...overrides,
  };
}

async function call(body, overrides = {}, headers = {}) {
  const response = await handleAtsPrepareImportPost(jsonRequest(body, headers), dependencies(overrides));
  return { status: response.status, body: await response.json() };
}

const { handleAtsPrepareImportPost } = loadRoute();

test("unauthenticated requests return 401", async () => {
  assert.deepEqual(await call(validBody, { getAuthUserFromRequest: async () => null }), { status: 401, body: { error: "Unauthorized." } });
});

test("users without canManageJobs return 403", async () => {
  const original = console.error; console.error = () => {};
  try {
    assert.deepEqual(await call(validBody, { getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: false }) }), { status: 403, body: { error: "Could not prepare ATS job import." } });
  } finally { console.error = original; }
});

test("malformed JSON returns 400", async () => {
  assert.deepEqual(await call("{"), { status: 400, body: { error: "Request body must be valid JSON." } });
});

const invalidCases = [
  ["missing careersPageUrl", { selectedJobKeys: validBody.selectedJobKeys }, "careersPageUrl is required."],
  ["careersPageUrl longer than 2,048 characters", { ...validBody, careersPageUrl: "x".repeat(2049) }, "careersPageUrl is too long."],
  ["missing selectedJobKeys", { careersPageUrl: validBody.careersPageUrl }, "selectedJobKeys must be an array."],
  ["empty selectedJobKeys", { ...validBody, selectedJobKeys: [] }, "selectedJobKeys must contain between 1 and 500 items."],
  ["501 selectedJobKeys", { ...validBody, selectedJobKeys: Array.from({ length: 501 }, (_, index) => ({ providerKey: "greenhouse", externalId: String(index) })) }, "selectedJobKeys must contain between 1 and 500 items."],
  ["non-object selected key", { ...validBody, selectedJobKeys: ["greenhouse:123"] }, "Each selected job key must be an object."],
  ["blank providerKey", { ...validBody, selectedJobKeys: [{ providerKey: "  ", externalId: "123" }] }, "Each providerKey must be a non-empty string."],
  ["blank externalId", { ...validBody, selectedJobKeys: [{ providerKey: "greenhouse", externalId: "  " }] }, "Each externalId must be a non-empty string."],
];
for (const [name, body, message] of invalidCases) test(`${name} returns 400`, async () => {
  assert.deepEqual(await call(body), { status: 400, body: { error: message } });
});

test("valid input is trimmed before prepareJobImport is called", async () => {
  let received;
  const result = await call({ careersPageUrl: "  https://example.com/careers  ", selectedJobKeys: [{ providerKey: " greenhouse ", externalId: " 12345 " }] }, { prepareJobImport: async (input) => { received = input; return prepared; } });
  assert.deepEqual(received, validBody);
  assert.equal(result.status, 200);
});

test("prepared results return 200 unchanged", async () => {
  assert.deepEqual(await call(validBody), { status: 200, body: prepared });
});

for (const status of ["discovery-failed", "no-job-links", "unsupported", "retrieval-failed"]) test(`${status} returns 200`, async () => {
  const serviceResult = { status, message: `Safe ${status} message.` };
  assert.deepEqual(await call(validBody, { prepareJobImport: async () => serviceResult }), { status: 200, body: serviceResult });
});

test("preparation invalid-request returns 400", async () => {
  const serviceResult = { status: "invalid-request", message: "Safe invalid request." };
  assert.deepEqual(await call(validBody, { prepareJobImport: async () => serviceResult }), { status: 400, body: serviceResult });
});

test("unexpected errors return a sanitized 500", async () => {
  const original = console.error; console.error = () => {};
  try {
    assert.deepEqual(await call(validBody, { prepareJobImport: async () => { throw new Error("secret details"); } }), { status: 500, body: { error: "Could not prepare ATS job import." } });
  } finally { console.error = original; }
});

test("extra client job fields are rejected and cannot override prepared data", async () => {
  let called = false;
  const body = { ...validBody, selectedJobKeys: [{ ...validBody.selectedJobKeys[0], title: "Client title", description: "Client description" }] };
  const result = await call(body, { prepareJobImport: async () => { called = true; return prepared; } });
  assert.equal(called, false);
  assert.deepEqual(result, { status: 400, body: { error: "Selected job keys may only contain providerKey and externalId." } });
});

test("exactly 500 selected keys are accepted", async () => {
  const selectedJobKeys = Array.from({ length: 500 }, (_, index) => ({ providerKey: "greenhouse", externalId: `job-${index}` }));
  let receivedCount = 0;
  const result = await call({ ...validBody, selectedJobKeys }, { prepareJobImport: async (input) => { receivedCount = input.selectedJobKeys.length; return prepared; } });
  assert.equal(receivedCount, 500);
  assert.equal(result.status, 200);
});

test("oversized streamed bodies return 400 without calling the service", async () => {
  let called = false;
  const result = await call({ ...validBody, padding: "x".repeat(1024 * 1024) }, { prepareJobImport: async () => { called = true; return prepared; } });
  assert.equal(called, false);
  assert.deepEqual(result, { status: 400, body: { error: "Request body is too large." } });
});

test("route uses only injected preparation service and no database write helper", async () => {
  const calls = [];
  await call(validBody, { prepareJobImport: async (input) => { calls.push(input); return prepared; } });
  assert.equal(calls.length, 1);
  assert.equal(Object.keys(dependencies()).some((name) => /insert|update|database|billing|audit|sync/i.test(name)), false);
});

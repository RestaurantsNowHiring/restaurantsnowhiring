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
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });

  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") {
      return {
        NextResponse: {
          json(body, init = {}) {
            return Response.json(body, init);
          },
        },
      };
    }
    if (specifier.endsWith("/lib/ats/import/previewJobImport")) return { previewJobImport: async () => ({ status: "unsupported", message: "unused" }) };
    if (specifier.endsWith("/lib/billing")) return { getAuthUserFromRequest: async () => null };
    if (specifier.endsWith("/lib/employerAccounts")) {
      return {
        getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true }),
        getSelectedEmployerAccountIdFromRequest: () => null,
        assertEmployerPermission: (context) => {
          if (!context.canManageJobs) {
            const error = new Error("forbidden");
            error.name = "EmployerPermissionError";
            throw error;
          }
        },
      };
    }
    throw new Error(`Unexpected test require: ${specifier}`);
  };

  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

function jsonRequest(body, headers = {}) {
  return new Request("https://example.com/api/employer/ats/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  return {
    getAuthUserFromRequest: async () => ({ id: "user_1", email: "owner@example.com" }),
    getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: true, role: "account_owner" }),
    getSelectedEmployerAccountIdFromRequest: (request) => request.headers.get("x-employer-account-id")?.trim() || null,
    assertEmployerPermission: (context) => {
      if (!context.canManageJobs) {
        const error = new Error("forbidden");
        error.name = "EmployerPermissionError";
        throw error;
      }
    },
    previewJobImport: async () => ({ status: "unsupported", message: "unsupported" }),
    ...overrides,
  };
}

async function responseJson(response) {
  return { status: response.status, body: await response.json() };
}

const { handleAtsPreviewPost } = loadRoute();

test("unauthenticated requests return 401", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://jobs.example.com" }), dependencies({ getAuthUserFromRequest: async () => null })));
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized." });
});

test("malformed JSON returns 400", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest("{"), dependencies()));
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "Request body must be valid JSON." });
});

test("missing careersPageUrl returns 400", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ providerKey: "greenhouse" }), dependencies()));
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "careersPageUrl is required." });
});

test("unauthorized employer account access returns 403", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://jobs.example.com" }), dependencies({ getEmployerAccountContext: async () => ({ accountId: "acct_1", canManageJobs: false, role: "viewer" }) })));
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "Could not preview ATS job import." });
});

test("ready result returns jobs without truncation", async () => {
  const jobs = Array.from({ length: 501 }, (_, index) => ({ title: `Job ${index}` }));
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: " https://jobs.example.com " }), dependencies({ previewJobImport: async (url) => {
    assert.equal(url, "https://jobs.example.com");
    return { status: "ready", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example", jobs };
  } })));
  assert.equal(result.status, 200);
  assert.equal(result.body.jobs.length, 501);
  assert.equal(result.body.providerKey, "greenhouse");
  assert.equal(result.body.sourceUrl, "https://boards.greenhouse.io/example");
});

test("no-job-links returns handled 200", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://example.com" }), dependencies({ previewJobImport: async () => ({ status: "no-job-links", message: "No job links found." }) })));
  assert.deepEqual(result, { status: 200, body: { status: "no-job-links", message: "No job links found." } });
});

test("unsupported returns handled 200", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://example.com" }), dependencies({ previewJobImport: async () => ({ status: "unsupported", message: "Unsupported ATS." }) })));
  assert.deepEqual(result, { status: 200, body: { status: "unsupported", message: "Unsupported ATS." } });
});

test("retrieval-failed returns handled 200", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://example.com" }), dependencies({ previewJobImport: async () => ({ status: "retrieval-failed", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example", message: "Try again." }) })));
  assert.deepEqual(result, { status: 200, body: { status: "retrieval-failed", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example", message: "Try again." } });
});

test("unexpected route-level errors return safe 500", async () => {
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://example.com" }), dependencies({ previewJobImport: async () => { throw new Error("secret internal details"); } })));
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Could not preview ATS job import." });
});

test("client-supplied providerKey and sourceUrl are ignored", async () => {
  let receivedUrl = "";
  const result = await responseJson(await handleAtsPreviewPost(jsonRequest({ careersPageUrl: "https://example.com", providerKey: "evil", sourceUrl: "https://evil.example" }), dependencies({ previewJobImport: async (url) => {
    receivedUrl = url;
    return { status: "ready", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/example", jobs: [{ title: "Server job" }] };
  } })));
  assert.equal(receivedUrl, "https://example.com");
  assert.equal(result.status, 200);
  assert.equal(result.body.providerKey, "greenhouse");
  assert.equal(result.body.sourceUrl, "https://boards.greenhouse.io/example");
});

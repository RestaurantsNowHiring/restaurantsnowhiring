import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");
function loadRoute(runScheduledAtsSyncs = async () => ({ status: "completed", summary: { attempted: 0, completed: 0, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 0 }, hasMore: false })) {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "crypto") return crypto;
    if (name === "next/server") return { NextResponse: { json(body, init = {}) { return Response.json(body, init); } } };
    if (name.endsWith("/lib/ats/sync/runScheduledAtsSyncs")) return { runScheduledAtsSyncs };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
async function json(response) { return { status: response.status, body: await response.json() }; }
function request(token) { return new Request("https://example.com/api/cron/ats-sync", { headers: token ? { authorization: `Bearer ${token}` } : {} }); }

test("missing authorization returns 401", async () => {
  process.env.CRON_SECRET = "secret";
  const { GET } = loadRoute();
  assert.deepEqual(await json(await GET(request())), { status: 401, body: { error: "Unauthorized." } });
});

test("incorrect secret returns 401", async () => {
  process.env.CRON_SECRET = "secret";
  const { GET } = loadRoute();
  assert.deepEqual(await json(await GET(request("wrong"))), { status: 401, body: { error: "Unauthorized." } });
});

test("missing server secret fails closed", async () => {
  delete process.env.CRON_SECRET;
  const { GET } = loadRoute();
  assert.deepEqual(await json(await GET(request("secret"))), { status: 401, body: { error: "Unauthorized." } });
});

test("correct bearer secret runs worker", async () => {
  process.env.CRON_SECRET = "secret";
  let called = 0;
  const { GET } = loadRoute(async () => { called += 1; return { status: "completed", summary: { attempted: 1, completed: 1, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 0 }, hasMore: false }; });
  assert.deepEqual(await json(await GET(request("secret"))), { status: 200, body: { status: "completed", summary: { attempted: 1, completed: 1, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 0 }, hasMore: false } });
  assert.equal(called, 1);
});

test("route-level worker failure returns safe 500", async () => {
  process.env.CRON_SECRET = "secret";
  const { GET } = loadRoute(async () => ({ status: "failed", message: "Scheduled job synchronization could not start." }));
  assert.deepEqual(await json(await GET(request("secret"))), { status: 500, body: { status: "failed", message: "Scheduled job synchronization could not start." } });
});

test("safe response excludes IDs URLs and job details", async () => {
  process.env.CRON_SECRET = "secret";
  const { GET } = loadRoute(async () => ({ status: "completed", summary: { attempted: 1, completed: 0, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 1 }, hasMore: false }));
  const result = await json(await GET(request("secret")));
  assert.doesNotMatch(JSON.stringify(result.body), /connection|account|https|job|description|provider/i);
});

test("cron schedule is exactly once daily at 12:00 UTC", () => {
  const vercel = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../vercel.json"), "utf8"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/cron/ats-sync" && cron.schedule === "0 12 * * *"));
});

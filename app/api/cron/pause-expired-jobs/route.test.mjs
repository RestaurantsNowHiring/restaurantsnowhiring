import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");
function loadRoute(rpc = async () => ({ data: [{ renewed_count: 0 }], error: null })) {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (name.endsWith("/lib/supabaseAdmin")) return { getSupabaseAdminClient: () => ({ rpc }) };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
const request = (token = "secret") => new Request("https://example.com/api/cron/pause-expired-jobs", { headers: { authorization: `Bearer ${token}` } });

test("cron invokes only the renewal RPC and returns its count", async () => {
  process.env.CRON_SECRET = "secret";
  const calls = [];
  const { GET } = loadRoute(async (name) => { calls.push(name); return { data: [{ renewed_count: 3 }], error: null }; });
  const response = await GET(request());
  assert.deepEqual(await response.json(), { ok: true, jobs_auto_renewed: 3, renewed_count: 3 });
  assert.deepEqual(calls, ["renew_expired_job_ads"]);
});

test("old auto-pause emails and Stripe quantity synchronization are not called", () => {
  const source = readFileSync(routePath, "utf8");
  assert.doesNotMatch(source, /sendExpirationReminderBatch|jobExpirationEmails|five_day|one_day|auto_paused/);
  assert.doesNotMatch(source, /syncSubscriptionQuantityForEmployer|stripe|billing/i);
});

test("cron remains secret-protected and keeps its scheduler cadence", async () => {
  process.env.CRON_SECRET = "secret";
  assert.equal((await loadRoute().GET(request("wrong"))).status, 401);
  const vercel = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../vercel.json"), "utf8"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/cron/pause-expired-jobs" && cron.schedule === "30 19 * * *"));
});

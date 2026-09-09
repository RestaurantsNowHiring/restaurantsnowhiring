import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

function loadRoute(action, initialJob) {
  const source = readFileSync(resolve(here, action, "route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  let job = structuredClone(initialJob);
  const updates = [], billingLookups = [], syncs = [];
  function query() {
    let operation = "select", payload;
    const filters = [];
    const builder = {
      select() { return builder; }, update(value) { operation = "update"; payload = value; updates.push(value); return builder; },
      eq(key, value) { filters.push([key, value]); return builder; }, is(key, value) { filters.push([key, value]); return builder; },
      maybeSingle: execute, single: execute, then(resolvePromise, rejectPromise) { return execute().then(resolvePromise, rejectPromise); },
    };
    async function execute() { const matches = job && filters.every(([key, value]) => job[key] === value); if (operation === "update" && matches) job = { ...job, ...payload }; return { data: matches ? structuredClone(job) : null, error: null }; }
    return builder;
  }
  const admin = { from(table) { assert.equal(table, "jobs"); return query(); } };
  const mod = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (specifier === "next/headers") return { cookies: async () => ({ get: () => ({ value: "admin-token" }) }) };
    if (specifier.endsWith("/adminAuth")) return { ADMIN_SESSION_COOKIE: "admin", getAdminUserFromAccessToken: async () => ({ ok: true }) };
    if (specifier.endsWith("/supabaseAdmin")) return { getSupabaseAdminClient: () => admin };
    if (specifier.endsWith("/jobStatus")) return { isMissingApprovedAtColumnError: () => false, isMissingStatusColumnError: () => false, normalizePersistedStatus: (value) => value };
    if (specifier.endsWith("/jobListingDuration")) return { getDefaultJobExpirationIso: (date) => new Date(date.getTime() + 30 * 86_400_000).toISOString() };
    if (specifier.endsWith("/billing")) return { getBillingRecord: async (id) => { billingLookups.push(id); return {}; }, evaluateBillingAccess: () => ({ allowed: true }), syncSubscriptionQuantityForEmployer: async (id) => syncs.push(id) };
    throw new Error(`Unexpected require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return { POST: mod.exports.POST, updates, billingLookups, syncs, get job() { return job; } };
}

const pendingPromotion = () => ({ id: "free-job", source_type: "outreach_free", active: false, status: "pending", approved_at: null, expires_at: null, employer_user_id: null, employer_email: "owner@example.com" });

test("pending outreach_free approval starts one billing-free 30-day window", async () => {
  const route = loadRoute("approve", pendingPromotion());
  const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "free-job" }) });
  assert.equal(response.status, 200); assert.equal(route.job.source_type, "outreach_free");
  assert.deepEqual({ active: route.job.active, status: route.job.status }, { active: true, status: "active" });
  assert.equal(new Date(route.job.expires_at).getTime() - new Date(route.job.approved_at).getTime(), 30 * 86_400_000);
  assert.deepEqual(route.billingLookups, []); assert.deepEqual(route.syncs, []);
});

test("repeated outreach_free approval preserves the first approval and expiration", async () => {
  const approved = { ...pendingPromotion(), active: true, status: "active", approved_at: "2026-09-09T10:00:00.000Z", expires_at: "2026-10-09T10:00:00.000Z" };
  const route = loadRoute("approve", approved);
  const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "free-job" }) });
  assert.equal(response.status, 200); assert.deepEqual(route.updates, []); assert.deepEqual(route.job, approved);
});

test("rejected and malformed outreach_free records cannot bypass approval safety", async () => {
  for (const invalid of [{ ...pendingPromotion(), status: "rejected" }, { ...pendingPromotion(), expires_at: "2026-10-09T10:00:00.000Z" }]) {
    const route = loadRoute("approve", invalid);
    const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "free-job" }) });
    assert.equal(response.status, 409); assert.deepEqual(route.updates, []);
  }
});

test("outreach_free rejection is private and has no billing side effects", async () => {
  const route = loadRoute("reject", pendingPromotion());
  const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "free-job" }) });
  assert.equal(response.status, 200);
  assert.deepEqual({ active: route.job.active, status: route.job.status, approved_at: route.job.approved_at, expires_at: route.job.expires_at }, { active: false, status: "rejected", approved_at: null, expires_at: null });
  assert.deepEqual(route.syncs, []);
});

test("normal employer approval retains billing validation and quantity sync", async () => {
  const route = loadRoute("approve", { ...pendingPromotion(), id: "employer-job", source_type: "employer", employer_user_id: "owner-id" });
  const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "employer-job" }) });
  assert.equal(response.status, 200); assert.deepEqual(route.billingLookups, ["owner-id"]); assert.deepEqual(route.syncs, ["owner-id"]); assert.equal(route.job.status, "active");
});

test("ATS rejection retains its inactive reason and quantity sync", async () => {
  const route = loadRoute("reject", { ...pendingPromotion(), id: "ats-job", source_type: "ats", employer_user_id: "owner-id" });
  const response = await route.POST(new Request("https://example.com"), { params: Promise.resolve({ id: "ats-job" }) });
  assert.equal(response.status, 200); assert.equal(route.job.ats_inactive_reason, "admin_rejected"); assert.deepEqual(route.syncs, ["owner-id"]);
});

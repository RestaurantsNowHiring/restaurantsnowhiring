import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "currentPeriodJobViews.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const mod = { exports: {} };
new Function("exports", "require", "module", outputText)(mod.exports, () => ({}), mod);
const { applyCurrentPeriodEmployerViews, getCurrentPaidPeriodStart } = mod.exports;

function adminWith(events) {
  return { from(table) {
    assert.equal(table, "job_events");
    return { select() { return this; }, in() { return this; }, eq() { return this; }, gte() { return Promise.resolve({ data: events, error: null }); } };
  } };
}

const firstPeriod = { id: "first", source_type: "employer", ats_provider: null, approved_at: "2026-09-01T00:00:00Z", expires_at: "2026-10-01T00:00:00Z", views: 99 };

test("first paid period starts at approval and counts only current events", async () => {
  assert.equal(getCurrentPaidPeriodStart(firstPeriod).toISOString(), "2026-09-01T00:00:00.000Z");
  const jobs = await applyCurrentPeriodEmployerViews(adminWith([{ job_id: "first", created_at: "2026-08-31T23:59:59Z" }, { job_id: "first", created_at: "2026-09-01T00:00:00Z" }]), [firstPeriod]);
  assert.equal(jobs[0].views, 1);
});

test("approval wins for a shortened first-period edge case", () => {
  const job = { ...firstPeriod, expires_at: "2026-09-20T00:00:00Z" };
  assert.equal(getCurrentPaidPeriodStart(job).toISOString(), new Date(job.approved_at).toISOString());
});

test("one renewal excludes the prior period, is initially zero, then increments", async () => {
  const renewed = { ...firstPeriod, id: "once", expires_at: "2026-10-31T00:00:00Z" };
  assert.equal((await applyCurrentPeriodEmployerViews(adminWith([{ job_id: "once", created_at: "2026-09-30T23:59:59Z" }]), [renewed]))[0].views, 0);
  assert.equal((await applyCurrentPeriodEmployerViews(adminWith([{ job_id: "once", created_at: "2026-10-01T00:00:01Z" }]), [renewed]))[0].views, 1);
});

test("multiple renewals derive the latest period from expiration", async () => {
  const renewed = { ...firstPeriod, id: "many", expires_at: "2026-12-30T00:00:00Z" };
  assert.equal(getCurrentPaidPeriodStart(renewed).toISOString(), "2026-11-30T00:00:00.000Z");
  const events = [{ job_id: "many", created_at: "2026-11-29T23:59:59Z" }, { job_id: "many", created_at: "2026-11-30T00:00:00Z" }, { job_id: "many", created_at: "2026-12-01T00:00:00Z" }];
  assert.equal((await applyCurrentPeriodEmployerViews(adminWith(events), [renewed]))[0].views, 2);
  assert.equal(events.length, 3, "analytics hydration does not remove historical events");
});

test("outreach-free, RNH-sourced, and ATS view values are unchanged", async () => {
  const jobs = [{ ...firstPeriod, id: "promo", source_type: "outreach_free", views: 12 }, { ...firstPeriod, id: "rnh", source_type: "rnh_sourced", views: 13 }, { ...firstPeriod, id: "ats", ats_provider: "workday", views: 14 }];
  assert.deepEqual(await applyCurrentPeriodEmployerViews(adminWith([]), jobs), jobs);
});

test("event migration preserves rows and period-scopes only manual employer view deduplication", () => {
  const migration = readFileSync(resolve(here, "../supabase/migrations/202609090002_employer_period_view_events.sql"), "utf8");
  assert.doesNotMatch(migration, /delete\s+from\s+public\.job_events|truncate\s+public\.job_events/i);
  assert.match(migration, /source_type <> 'employer'/);
  assert.match(migration, /j\.ats_provider is null/);
  assert.match(migration, /greatest\(j\.expires_at - interval '30 days', j\.approved_at\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
function loadHelpers() {
  const source = readFileSync(resolve(here, "jobAutoRenewal.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  new Function("exports", "require", "module", outputText)(mod.exports, () => {}, mod);
  return mod.exports;
}
const { getNextAutoRenewalDate, isEligibleForAutoRenewal } = loadHelpers();
const now = new Date("2026-08-06T12:00:00.000Z");
const eligible = { active: true, status: "active", approved_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-08-01T12:00:00.000Z" };

test("eligible active approved jobs renew exactly 30 days from their prior expiration", () => {
  assert.equal(isEligibleForAutoRenewal(eligible, now), true);
  assert.equal(getNextAutoRenewalDate(new Date(eligible.expires_at), now).toISOString(), "2026-08-31T12:00:00.000Z");
});

test("jobs overdue by multiple periods advance to the first future boundary", () => {
  assert.equal(getNextAutoRenewalDate(new Date("2026-05-01T12:00:00.000Z"), now).toISOString(), "2026-08-29T12:00:00.000Z");
});

test("paused, inactive, rejected, unapproved, and archived jobs do not renew", () => {
  for (const overrides of [{ status: "paused" }, { active: false }, { status: "rejected" }, { status: "pending", approved_at: null }, { status: "archived" }, { approved_at: null }]) {
    assert.equal(isEligibleForAutoRenewal({ ...eligible, ...overrides }, now), false);
  }
});

test("a renewed period is idempotent when evaluated again at the same cron time", () => {
  const expires_at = getNextAutoRenewalDate(new Date(eligible.expires_at), now).toISOString();
  assert.equal(isEligibleForAutoRenewal({ ...eligible, expires_at }, now), false);
});

test("ATS provenance does not alter eligibility", () => {
  assert.equal(isEligibleForAutoRenewal({ ...eligible, source_type: "ats", ats_inactive_reason: null }, now), true);
});

test("migration preserves lifecycle, ownership, billing, and ATS fields while updating only expires_at", () => {
  const sql = readFileSync(resolve(here, "../supabase/migrations/202608060001_auto_renew_job_ads.sql"), "utf8").toLowerCase();
  assert.match(sql, /set expires_at\s*=/);
  assert.match(sql, /status = 'active'[\s\S]*active = true[\s\S]*approved_at is not null/);
  assert.match(sql, /2592000[\s\S]*interval '30 days'/);
  assert.match(sql, /expires_at <= now\(\)/);
  assert.doesNotMatch(sql, /set\s+(status|active|approved_at|employer_[a-z_]+|billing_[a-z_]+|stripe_[a-z_]+|ats_[a-z_]+)\s*=/);
});

test("public visibility remains independent of expires_at", () => {
  const source = readFileSync(resolve(here, "jobStatus.ts"), "utf8");
  const visibleFunction = source.match(/export function isPubliclyVisibleJob[\s\S]*?\n}/)?.[0] ?? "";
  assert.doesNotMatch(visibleFunction, /expires_at|expiresAt/);
});

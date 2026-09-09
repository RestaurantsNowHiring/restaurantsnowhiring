import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync(new URL("./202609020001_outreach_free_foundation.sql", import.meta.url), "utf8").toLowerCase();
const productionRenewalSql = readFileSync(new URL("./202608060001_auto_renew_job_ads.sql", import.meta.url), "utf8").toLowerCase();
const billing = readFileSync(new URL("../../lib/billing.ts", import.meta.url), "utf8");
test("billing counts only employer-owned jobs in every lookup path", () => { assert.equal((billing.match(/\.eq\("source_type", "employer"\)/g) ?? []).length, 3); });
test("employer and RNH remain supported while only employer renews", () => { assert.match(sql, /source_type in \('employer', 'rnh_sourced', 'outreach_free'\)/); assert.match(sql, /where source_type = 'employer'\s+and status = 'active'/); });
test("renewal preserves every production predicate and adds only employer isolation", () => {
  const predicates = (text) => text.match(/create or replace function public\.renew_expired_job_ads\(\)[\s\S]*?where ([\s\S]*?expires_at <= now\(\);)/)?.[1].split(/\s+and\s+/).map((part) => part.replace(/\s+/g, " ").trim()) ?? [];
  const before = predicates(productionRenewalSql);
  const after = predicates(sql);
  assert.deepEqual(after, ["source_type = 'employer'", ...before]);
  assert.deepEqual(before, ["status = 'active'", "active = true", "approved_at is not null", "expires_at is not null", "expires_at <= now();"]);
});
test("an employer job failing any existing production eligibility condition still cannot renew", () => {
  const eligible = (job) => job.source_type === "employer" && job.status === "active" && job.active === true && job.approved_at != null && job.expires_at != null && job.expires_at <= 100;
  const base = { source_type: "employer", status: "active", active: true, approved_at: 1, expires_at: 99 };
  for (const changes of [{ status: "paused" }, { active: false }, { approved_at: null }, { expires_at: null }, { expires_at: 101 }]) assert.equal(eligible({ ...base, ...changes }), false);
});
test("one invitation cannot create multiple promotional jobs", () => { assert.match(sql, /unique index jobs_promotional_invitation_unique_idx/); assert.match(sql, /redeemed_job_unique unique \(redeemed_job_id\)/); assert.match(sql, /\(source_type = 'outreach_free'\) = \(promotional_invitation_id is not null\)/); });
test("tokens are digest-only and lifecycle is constrained", () => { assert.match(sql, /token_digest bytea not null unique check \(octet_length\(token_digest\) = 32\)/); assert.doesNotMatch(sql, /(^|\s)(invitation_token|verification_token)\s+text/m); assert.match(sql, /promotional_invitations_redemption_check/); });
test("promotional tables have RLS and no browser mutations", () => { for (const table of ["promotional_invitations", "promotional_email_deliveries"]) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`)); assert.match(sql, /revoke all on public\.promotional_invitations, public\.promotional_email_deliveries from anon, authenticated/); assert.doesNotMatch(sql, /grant (insert|update|delete)[\s\S]*promotional_/); });
test("outbox has delivery identity, retries, and states", () => { assert.match(sql, /email_type in \('verification', 'expiration_results'\)/); assert.match(sql, /state in \('pending', 'sending', 'sent', 'failed'\)/); assert.match(sql, /retry_count integer not null default 0/); assert.match(sql, /promotional_email_job_type_unique_idx/); });

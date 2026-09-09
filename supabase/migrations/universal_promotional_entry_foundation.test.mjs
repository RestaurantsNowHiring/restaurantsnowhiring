import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./202609020002_universal_promotional_entry_foundation.sql", import.meta.url), "utf8").toLowerCase();

test("public and private entry paths share the existing invitation system", () => {
  assert.match(sql, /alter table public\.promotional_invitations/);
  assert.match(sql, /entry_source in \('admin_invitation', 'public_request'\)/);
  assert.doesNotMatch(sql, /create table public\.promotional_invitations/);
});

test("redemption is unique for both normalized contact and company identity", () => {
  assert.match(sql, /unique index promotional_redeemed_contact_unique_idx[\s\S]*\(contact_email\)[\s\S]*where redeemed_job_id is not null/);
  assert.match(sql, /unique index promotional_redeemed_company_unique_idx[\s\S]*\(company_id\)[\s\S]*where redeemed_job_id is not null/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(invitation\.contact_email/);
  assert.match(sql, /existing_invitation\.contact_email = invitation\.contact_email[\s\S]*existing_invitation\.company_id = invitation\.company_id/);
});

test("promotion redemption requires verification, eligibility, validity, and Admin review", () => {
  for (const requirement of ["email_verified_at is null", "eligibility_status <> 'eligible'", "offer_expires_at <= now()", "revoked_at is not null"]) assert.match(sql, new RegExp(requirement.replace(/[()]/g, "\\$&")));
  assert.match(sql, /tg_op = 'insert'[\s\S]*new\.active is distinct from false[\s\S]*status, ''\) <> 'pending'[\s\S]*approved_at is not null/);
});

test("rate-limit ledger is indexed, digest-only, and unavailable to browser roles", () => {
  assert.match(sql, /ip_digest bytea not null check \(octet_length\(ip_digest\) = 32\)/);
  assert.match(sql, /promotional_entry_attempts \(ip_digest, attempted_at desc\)/);
  assert.match(sql, /promotional_entry_attempts \(contact_email, attempted_at desc\)/);
  assert.match(sql, /alter table public\.promotional_entry_attempts enable row level security/);
  assert.match(sql, /revoke all on public\.promotional_entry_attempts from anon, authenticated/);
});

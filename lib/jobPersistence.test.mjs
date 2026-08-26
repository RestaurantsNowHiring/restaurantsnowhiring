import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "jobPersistence.ts"), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const loaded = { exports: {} };
new Function("exports", "require", "module", outputText)(loaded.exports, () => { throw new Error("Unexpected require"); }, loaded);
const { buildCanonicalJobInsertPayload, getNewJobApprovalFields, shouldAutoApproveJob } = loaded.exports;

test("canonical job inserts carry the Post Job ownership, posting, routing, and nullable defaults", () => {
  const payload = buildCanonicalJobInsertPayload({
    restaurantName: "Example Restaurant", title: "Line Cook", roleCategory: "Line",
    city: "Baltimore", state: "MD", applyEmail: "owner@example.com",
    employmentType: "Full time", description: "Cook food.",
    employerEmail: "owner@example.com", employerUserId: "owner-1",
    employerAccountId: "account-1", postedByUserId: "poster-1", postedByEmail: "poster@example.com",
  });
  assert.deepEqual(payload, {
    restaurant_name: "Example Restaurant", title: "Line Cook", role_category: "Line",
    city: "Baltimore", state: "MD", apply_email: "owner@example.com",
    country: "United States", postal_code: null,
    company_website: null, employment_type: "Full time", pay_range: null, address: null,
    how_to_apply: null, description: "Cook food.", active: false, status: "pending",
    employer_email: "owner@example.com", employer_user_id: "owner-1", employer_account_id: "account-1",
    posted_by_user_id: "poster-1", posted_by_email: "poster@example.com",
    candidate_notification_email: null, candidate_notification_emails: null,
    candidate_notification_routing: "job_poster", employer_store_id: null, employer_job_template_id: null,
  });
});

test("only the configured MISSION BBQ employer account receives normal approved fields", () => {
  const ids = new Set(["mission-account"]);
  const now = new Date("2026-08-12T12:00:00.000Z");
  assert.equal(shouldAutoApproveJob("mission-account", ids), true);
  assert.equal(shouldAutoApproveJob("lookalike-account", ids), false);
  assert.deepEqual(getNewJobApprovalFields("mission-account", now, ids), {
    active: true,
    status: "active",
    approved_at: "2026-08-12T12:00:00.000Z",
    expires_at: "2026-09-11T12:00:00.000Z",
  });
  assert.deepEqual(getNewJobApprovalFields("lookalike-account", now, ids), {
    active: false,
    status: "pending",
  });
});

test("the server-only environment allowlist controls auto-approval", () => {
  const previous = process.env.MISSION_BBQ_AUTO_APPROVE_ACCOUNT_IDS;
  process.env.MISSION_BBQ_AUTO_APPROVE_ACCOUNT_IDS = "mission-account, historical-account";
  try {
    assert.equal(shouldAutoApproveJob("mission-account"), true);
    assert.equal(shouldAutoApproveJob("ordinary-account"), false);
  } finally {
    if (previous === undefined) delete process.env.MISSION_BBQ_AUTO_APPROVE_ACCOUNT_IDS;
    else process.env.MISSION_BBQ_AUTO_APPROVE_ACCOUNT_IDS = previous;
  }
});

test("a MISSION BBQ display name cannot grant approval to another account", () => {
  const payload = buildCanonicalJobInsertPayload({
    restaurantName: "MISSION BBQ", title: "Cook", roleCategory: "Line", city: "Baltimore", state: "MD",
    applyEmail: "owner@example.com", employmentType: "Full time", description: "Cook food.",
    employerEmail: "owner@example.com", employerUserId: "owner-2", employerAccountId: "lookalike-account",
    postedByUserId: "owner-2", postedByEmail: "owner@example.com",
  });
  assert.equal(payload.active, false);
  assert.equal(payload.status, "pending");
  assert.equal("approved_at" in payload, false);
});

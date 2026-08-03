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
const { buildCanonicalJobInsertPayload } = loaded.exports;

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
    company_website: null, employment_type: "Full time", pay_range: null, address: null,
    how_to_apply: null, description: "Cook food.", active: false, status: "pending",
    employer_email: "owner@example.com", employer_user_id: "owner-1", employer_account_id: "account-1",
    posted_by_user_id: "poster-1", posted_by_email: "poster@example.com",
    candidate_notification_email: null, candidate_notification_emails: null,
    candidate_notification_routing: "job_poster", employer_store_id: null, employer_job_template_id: null,
  });
});

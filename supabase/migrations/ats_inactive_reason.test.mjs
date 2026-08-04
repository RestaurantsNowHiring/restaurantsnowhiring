import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./202608040001_add_ats_inactive_reason.sql", import.meta.url), "utf8").toLowerCase();

test("adds nullable ATS inactive reason with only reserved values and no backfill", () => {
  assert.match(sql, /add column if not exists ats_inactive_reason text null/);
  for (const reason of ["closed_in_ats", "employer_deactivated", "admin_rejected", "connection_unavailable", "review_required"]) assert.match(sql, new RegExp(`'${reason}'`));
  assert.match(sql, /ats_inactive_reason is null\s+or ats_inactive_reason in/);
  assert.doesNotMatch(sql, /update\s+public\.jobs|set\s+ats_inactive_reason/);
});

test("focused employer and admin paths distinguish ATS jobs from manual jobs", () => {
  const employer = readFileSync(new URL("../../app/api/employer/jobs/[id]/actions.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../../app/api/admin/jobs/[id]/reject/route.ts", import.meta.url), "utf8");
  assert.match(employer, /job\.source_type === "ats" \? \{ ats_inactive_reason: "employer_deactivated" \} : \{\}/);
  assert.match(admin, /loadedJob\.data\.source_type === "ats" \? \{ ats_inactive_reason: "admin_rejected" \} : \{\}/);
});

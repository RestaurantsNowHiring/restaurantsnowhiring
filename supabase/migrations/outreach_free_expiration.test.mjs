import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./202609090001_expire_outreach_free_jobs.sql", import.meta.url), "utf8");

test("expiration archives only due active outreach_free jobs", () => {
  assert.match(sql, /set active = false,\s*status = 'archived'/);
  assert.match(sql, /where source_type = 'outreach_free'[\s\S]*status = 'active'[\s\S]*active = true[\s\S]*expires_at <= now\(\)/);
});

test("expiration preserves the original approval window and has no billing effects", () => {
  assert.doesNotMatch(sql, /set\s+approved_at\s*=/);
  assert.doesNotMatch(sql, /set\s+expires_at\s*=/);
  assert.doesNotMatch(sql, /stripe|subscription|billing/i);
});

test("expiration is idempotent and service-only", () => {
  assert.match(sql, /status = 'active'[\s\S]*active = true/);
  assert.match(sql, /revoke all on function public\.expire_outreach_free_job_ads\(\) from anon/);
  assert.match(sql, /revoke all on function public\.expire_outreach_free_job_ads\(\) from authenticated/);
});

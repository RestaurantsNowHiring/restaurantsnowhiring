import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./202608040002_employer_ats_sync_history.sql", import.meta.url), "utf8").toLowerCase();

test("employer ats sync history migration creates safe rls-protected history table", () => {
  assert.match(sql, /create table public\.employer_ats_sync_history/);
  assert.match(sql, /connection_id uuid not null\s+references public\.employer_ats_connections\(id\) on delete cascade/);
  for (const status of ["running", "completed", "completed_with_warning", "failed"]) assert.match(sql, new RegExp(`'${status}'`));
  for (const column of ["completed", "updated", "closed", "reopened", "new_available", "needs_review", "failed"]) assert.match(sql, new RegExp(`${column} integer not null default 0`));
  assert.match(sql, /execute function public\.touch_updated_at\(\)/);
  assert.match(sql, /alter table public\.employer_ats_sync_history enable row level security/);
  assert.doesNotMatch(sql, /create policy|alter policy/);
});

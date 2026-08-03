import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "202608030003_employer_ats_connections.sql",
);
const sql = readFileSync(migrationPath, "utf8");

test("creates the service-managed ATS connection table with durable identity", () => {
  assert.match(sql, /create table public\.employer_ats_connections/);
  assert.match(sql, /employer_account_id uuid not null\s+references public\.employer_accounts\(id\) on delete cascade/);
  assert.match(sql, /connected_by_user_id uuid\s+references auth\.users\(id\) on delete set null/);
  assert.match(sql, /provider_key = lower\(btrim\(provider_key\)\) and provider_key <> ''/);
  assert.match(sql, /check \(btrim\(input_url\) <> ''\)/);
  assert.match(sql, /check \(btrim\(source_url\) <> ''\)/);
  assert.match(sql, /connection_status in \('active', 'disconnected', 'error'\)/);
  assert.match(sql, /check \(consecutive_failure_count >= 0\)/);
  assert.match(sql, /\(employer_account_id, provider_key, source_url_key\)/);
});

test("adds scheduler lookup, updated-at trigger, and restrictive RLS", () => {
  assert.match(sql, /create index employer_ats_connections_sync_lookup_idx/);
  assert.match(sql, /where enabled = true and connection_status in \('active', 'error'\)/);
  assert.match(sql, /execute function public\.touch_updated_at\(\)/);
  assert.match(sql, /alter table public\.employer_ats_connections enable row level security/);
  assert.doesNotMatch(sql, /create policy/i);
});

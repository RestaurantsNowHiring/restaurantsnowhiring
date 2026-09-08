import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./202609030002_promotional_location_identity.sql", import.meta.url), "utf8").toLowerCase();
const route = readFileSync(new URL("../../app/api/promotional-entry/route.ts", import.meta.url), "utf8");

test("location identity is exact and normalizes harmless formatting", () => {
  assert.match(sql, /normalize_promotional_location_component[\s\S]*lower\(regexp_replace\(btrim\(value\), '\\s\+', ' ', 'g'\)\)/);
  assert.match(sql, /promotional_location_identity[\s\S]*company_name[\s\S]*city[\s\S]*state_province[\s\S]*country/);
  assert.doesNotMatch(sql, /levenshtein|similarity|soundex/);
});

test("email, company alone, and title do not define promotion uniqueness", () => {
  assert.match(sql, /drop index public\.promotional_redeemed_contact_unique_idx/);
  assert.match(sql, /drop index public\.promotional_redeemed_company_unique_idx/);
  for (const index of ["promotional_active_location_unique_idx", "promotional_redeemed_location_unique_idx"])
    assert.match(sql, new RegExp(`unique index ${index}[\\s\\S]*location_identity_key`));
  const indexes = [...sql.matchAll(/create unique index[^;]+;/g)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(indexes, /\(contact_email\)|\(company_id\)|requested_job_title/);
});

test("public request admission is atomic and concurrency-safe per location", () => {
  const functionStart = sql.indexOf("create or replace function public.create_public_promotional_request");
  const lock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(location_identity, 73))", functionStart);
  const insert = sql.indexOf("insert into public.promotional_invitations", lock);
  assert.ok(functionStart > 0 && lock > functionStart && insert > lock);
  assert.match(sql.slice(functionStart), /then return null/);
  assert.match(route, /rpc\("create_public_promotional_request"/);
  assert.doesNotMatch(route, /redeemedEmail|redeemedCompany|\.from\("promotional_invitations"\)\.insert/);
});

test("redemption derives an admin invitation location and permanently checks redeemed locations", () => {
  assert.match(sql, /coalesce\(invitation\.location_identity_key[\s\S]*new\.city, new\.state, new\.country/);
  assert.match(sql, /public\.jobs existing_job[\s\S]*existing\.location_identity_key = location_identity/);
  assert.match(sql, /where redeemed_job_id is not null and location_identity_key is not null/);
});

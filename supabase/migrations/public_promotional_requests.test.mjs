import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const sql=readFileSync(new URL("./202609020003_public_promotional_requests.sql",import.meta.url),"utf8").toLowerCase();
test("public request payload lives on the server-only invitation record",()=>{assert.match(sql,/alter table public\.promotional_invitations/); for(const field of ["contact_name","requested_company_website","requested_job_title","requested_city","requested_state","requested_country","requested_employment_type","requested_description","requested_application_url"]) assert.match(sql,new RegExp(`add column ${field}`));});
test("company matching uses a normalized exact identity, not fuzzy matching",()=>{assert.match(sql,/identity_key/); assert.match(sql,/lower\(regexp_replace\(btrim\(name\), '\\s\+', ' ', 'g'\)\)/); assert.match(sql,/unique index companies_identity_key_unique_idx/); assert.doesNotMatch(sql,/similarity|levenshtein|soundex/);});
test("fresh installs stop with an intentional diagnostic instead of merging normalized collisions",()=>{assert.match(sql,/having count\(\*\) > 1/); assert.match(sql,/normalized duplicate identities require manual review/); assert.doesNotMatch(sql,/delete from public\.companies|update public\.jobs set company_id/);});
test("migration adds no jobs, billing, Stripe, email delivery, or account creation",()=>{assert.doesNotMatch(sql,/insert into public\.jobs|stripe|billing|promotional_email_deliveries|auth\.users/);});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "importPreparedJobs.ts");

function canonicalPayload(input) {
  return {
    restaurant_name: input.restaurantName, title: input.title, role_category: input.roleCategory,
    city: input.city, state: input.state, apply_email: input.applyEmail,
    company_website: input.companyWebsite ?? null, employment_type: input.employmentType,
    pay_range: input.payRange ?? null, address: input.address ?? null,
    how_to_apply: input.howToApply ?? null, description: input.description,
    active: false, status: "pending", employer_email: input.employerEmail,
    employer_user_id: input.employerUserId, employer_account_id: input.employerAccountId,
    posted_by_user_id: input.postedByUserId, posted_by_email: input.postedByEmail,
    candidate_notification_email: input.candidateNotificationEmail ?? null,
    candidate_notification_emails: input.candidateNotificationEmails?.length ? input.candidateNotificationEmails : null,
    candidate_notification_routing: input.candidateNotificationRouting ?? "job_poster",
    employer_store_id: input.employerStoreId ?? null,
    employer_job_template_id: input.employerJobTemplateId ?? null,
  };
}

function loadImport(buildCanonicalJobInsertPayload = canonicalPayload) {
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n\n', "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "../../jobFormOptions") return { ROLE_OPTIONS: ["Line", "Other"], EMPLOYMENT_OPTIONS: ["Full time", "Part time", "Seasonal", "Temporary"], STATE_OPTIONS: ["MD", "DC"] };
    if (specifier === "../../richText") return { sanitizeRichText: (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on\w+="[^"]*"/gi, "") };
    if (specifier === "../../jobPersistence") return { buildCanonicalJobInsertPayload };
    if (specifier === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    if (specifier === "../providers/registry") return { getAtsProvider: (key) => key === "greenhouse" ? {} : undefined };
    if (specifier === "./prepareJobImport") return {
      normalizeProviderKey: (value) => value.trim().toLowerCase(),
      normalizeAtsLocationKey: (value) => value.trim().replace(/\s+/g, " "),
    };
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports.importPreparedJobs;
}

const importPreparedJobs = loadImport();
const ready = (id, overrides = {}) => ({
  status: "ready", providerKey: "greenhouse", externalId: id,
  job: { providerKey: "greenhouse", externalId: id, title: `Line Cook ${id}`, sourceUrl: `https://boards.example/${id}`, applyUrl: `https://boards.example/${id}/apply`, city: "Baltimore", state: "MD", roleCategory: "Line", employmentType: "Full time", descriptionHtml: "<p>Cook food.</p>", ...overrides },
});

function mockDatabase({ existing = [], insertError, updateError, mappingError, store } = {}) {
  const calls = { find: [], insert: [], update: [], mappings: [], events: [] };
  const rows = [...existing];
  return {
    calls,
    database: {
      async getAccount(id) { return { data: { id, owner_user_id: "owner-1", owner_email: "owner@example.com", restaurant_name: "Example Restaurant" }, error: null }; },
      async findExisting(accountId, provider, ids) { calls.find.push({ accountId, provider, ids }); return { data: rows.filter((row) => ids.includes(row.ats_external_job_id)), error: null }; },
      async insert(payload) { calls.events.push("insert"); calls.insert.push(payload); return insertError ? { data: null, error: insertError } : { data: { id: `new-${calls.insert.length}` }, error: null }; },
      async update(id, payload) { calls.events.push("update"); calls.update.push({ id, payload }); return updateError ? { data: null, error: updateError } : { data: { id }, error: null }; },
      async getStore(accountId, storeId) { return storeId === "invalid-store" ? { data: null, error: null } : { data: store ?? { id: storeId, employer_account_id: accountId, location_name: "Baltimore Restaurant", city: "Baltimore", state: "MD", active: true, is_assignable_location: true }, error: null }; },
      async upsertLocationMapping(payload) { calls.events.push("mapping"); calls.mappings.push(payload); return mappingError ? { data: null, error: mappingError } : { data: { id: "mapping-1" }, error: null }; },
    },
  };
}
const input = (preparedJobs, reviewCorrections = []) => ({ employerAccountId: "account-1", preparedJobs, reviewCorrections });
const deps = (database) => ({ database, now: () => new Date("2026-08-03T12:00:00.000Z") });

test("imports a new ATS job as inactive pending without billing or approval fields", async () => {
  const db = mockDatabase();
  const result = await importPreparedJobs(input([ready("1")]), deps(db.database));
  assert.equal(result.Imported.length, 1);
  assert.equal(db.calls.insert[0].source_type, "ats");
  assert.equal(db.calls.insert[0].status, "pending");
  assert.equal(db.calls.insert[0].active, false);
  assert.equal(db.calls.insert[0].ats_last_synced_at, "2026-08-03T12:00:00.000Z");
  assert.equal(db.calls.insert[0].company_website, null);
  assert.equal(db.calls.insert[0].pay_range, null);
  assert.equal(db.calls.insert[0].address, null);
  assert.equal(db.calls.insert[0].employer_store_id, null);
  assert.equal(db.calls.insert[0].employer_job_template_id, null);
  assert.equal(db.calls.insert[0].posted_by_user_id, "owner-1");
  assert.equal("approved_at" in db.calls.insert[0], false);
  assert.equal("billing_status" in db.calls.insert[0], false);
});

test("saves mappings only after successful writes and reports mapping failures as successful jobs", async () => {
  const item = { ...ready("ordered"), status: "needs-review", job: { ...ready("ordered").job, atsLocation: "Store 102", city: undefined, state: undefined }, issues: [{ field: "location", reason: "unmapped", message: "Choose location" }] };
  const correction = [{ providerKey: "greenhouse", externalId: "ordered", employerStoreId: "store-1" }];
  const failed = mockDatabase({ insertError: { message: "write failed" } });
  const failedResult = await importPreparedJobs(input([item], correction), deps(failed.database));
  assert.equal(failedResult.Failed.length, 1);
  assert.deepEqual(failed.calls.events, ["insert"]);
  assert.equal(failed.calls.mappings.length, 0);

  const partial = mockDatabase({ mappingError: { message: "mapping failed" } });
  const partialResult = await importPreparedJobs(input([item], correction), deps(partial.database));
  assert.deepEqual(partial.calls.events, ["insert", "mapping"]);
  assert.equal(partialResult.Imported.length, 1);
  assert.equal(partialResult.Failed.length, 0);
  assert.match(partialResult.Imported[0].message, /imported, but its location mapping could not be saved/i);
});

test("requires selected stores to belong to the employer, be active, and be assignable", async () => {
  const item = { ...ready("verified"), status: "needs-review", job: { ...ready("verified").job, atsLocation: "Corporate", city: undefined, state: undefined }, issues: [{ field: "location", reason: "unmapped", message: "Choose location" }] };
  const correction = [{ providerKey: "greenhouse", externalId: "verified", employerStoreId: "store-1" }];
  const invalidStores = [
    { id: "store-1", employer_account_id: "other", city: "Baltimore", state: "MD", active: true, is_assignable_location: true },
    { id: "store-1", employer_account_id: "account-1", city: "Baltimore", state: "MD", active: false, is_assignable_location: true },
    { id: "store-1", employer_account_id: "account-1", city: "Baltimore", state: "MD", active: true, is_assignable_location: false },
  ];
  for (const store of invalidStores) {
    const db = mockDatabase({ store });
    const result = await importPreparedJobs(input([item], correction), deps(db.database));
    assert.equal(result.Failed.length, 1);
    assert.equal(db.calls.insert.length, 0);
  }
});

test("successful updates overwrite store, normalized identity, city, and state after the job update", async () => {
  const db = mockDatabase({ existing: [{ id: "job-1", ats_provider: "greenhouse", ats_external_job_id: "overwrite" }] });
  const item = { ...ready("overwrite"), status: "needs-review", job: { ...ready("overwrite").job, atsLocation: "  550   Madison ", city: undefined, state: undefined }, issues: [{ field: "location", reason: "unmapped", message: "Choose location" }] };
  const result = await importPreparedJobs(input([item], [{ providerKey: "greenhouse", externalId: "overwrite", employerStoreId: "store-2" }]), deps(db.database));
  assert.equal(result.Updated.length, 1);
  assert.deepEqual(db.calls.events, ["update", "mapping"]);
  assert.equal(db.calls.mappings[0].employer_store_id, "store-2");
  assert.equal(db.calls.mappings[0].ats_location_key, "550 Madison");
  assert.deepEqual([db.calls.mappings[0].city, db.calls.mappings[0].state], ["Baltimore", "MD"]);
});

test("creates and updates an employer/provider-scoped mapping from a reviewed restaurant location", async () => {
  const db = mockDatabase();
  const item = { ...ready("mapped"), status: "needs-review", job: { ...ready("mapped").job, atsLocation: "550 Madison", city: undefined, state: undefined }, issues: [{ field: "location", reason: "unmapped", message: "Choose location" }] };
  const correction = [{ providerKey: "greenhouse", externalId: "mapped", employerStoreId: "store-1" }];
  const result = await importPreparedJobs(input([item], correction), deps(db.database));
  assert.equal(result.Imported.length, 1);
  assert.deepEqual(db.calls.mappings[0], {
    employer_account_id: "account-1", employer_store_id: "store-1", ats_provider: "greenhouse",
    ats_location_value: "550 Madison", ats_location_key: "550 Madison", city: "Baltimore", state: "MD",
  });
});

test("reuses the canonical job insert payload builder", async () => {
  let received;
  const service = loadImport((values) => { received = values; return canonicalPayload(values); });
  const db = mockDatabase();
  await service(input([ready("1")]), deps(db.database));
  assert.equal(received.restaurantName, "Example Restaurant");
  assert.equal(received.howToApply, "https://boards.example/1/apply");
});

test("fails safely when employer branding cannot be resolved", async () => {
  const db = mockDatabase();
  db.database.getAccount = async (id) => ({ data: { id, owner_user_id: "owner-1", owner_email: "owner@example.com", restaurant_name: null }, error: null });
  const result = await importPreparedJobs(input([ready("1")]), deps(db.database));
  assert.equal(result.Failed.length, 1);
  assert.match(result.Failed[0].message, /restaurant or company name/);
  assert.equal(db.calls.insert.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /Restaurant"/);
});

test("routes applications to the ATS without configuring candidate notification email", async () => {
  const db = mockDatabase();
  await importPreparedJobs(input([ready("1")]), deps(db.database));
  const payload = db.calls.insert[0];
  assert.equal(payload.ats_apply_url, "https://boards.example/1/apply");
  assert.equal(payload.how_to_apply, "https://boards.example/1/apply");
  assert.equal(payload.candidate_notification_email, null);
  assert.equal(payload.candidate_notification_emails, null);
});

test("updates only ATS-managed fields for an existing job", async () => {
  const db = mockDatabase({ existing: [{ id: "job-1", ats_provider: "greenhouse", ats_external_job_id: "1" }] });
  const result = await importPreparedJobs(input([ready("1")]), deps(db.database));
  assert.equal(result.Updated.length, 1);
  assert.equal(db.calls.insert.length, 0);
  assert.equal(db.calls.update[0].id, "job-1");
  assert.equal("status" in db.calls.update[0].payload, false);
  assert.equal("active" in db.calls.update[0].payload, false);
  assert.equal("approved_at" in db.calls.update[0].payload, false);
});

test("skips duplicate prepared identities", async () => {
  const db = mockDatabase();
  const result = await importPreparedJobs(input([ready("1"), ready("1")]), deps(db.database));
  assert.equal(result.Imported.length, 1);
  assert.equal(result.Skipped.length, 1);
  assert.match(result.Skipped[0].message, /more than once/);
});

test("turns a unique-index insert race into an update instead of a duplicate", async () => {
  const db = mockDatabase();
  let lookups = 0;
  db.database.findExisting = async () => ({
    data: lookups++ === 0 ? [] : [{ id: "raced-job", ats_provider: "greenhouse", ats_external_job_id: "1" }],
    error: null,
  });
  db.database.insert = async () => ({ data: null, error: { code: "23505", message: "jobs_ats_identity_unique_idx" } });
  const result = await importPreparedJobs(input([ready("1")]), deps(db.database));
  assert.equal(result.Updated.length, 1);
  assert.equal(result.Imported.length, 0);
  assert.equal(db.calls.update[0].id, "raced-job");
});

test("allows partial success and never exposes database errors", async () => {
  let inserts = 0;
  const db = mockDatabase();
  db.database.insert = async (payload) => { db.calls.insert.push(payload); inserts += 1; return inserts === 2 ? { data: null, error: { message: "secret database host" } } : { data: { id: "ok" }, error: null }; };
  const result = await importPreparedJobs(input([ready("1"), ready("2"), ready("bad", { applyUrl: "javascript:alert(1)" })]), deps(db.database));
  assert.equal(result.Imported.length, 1);
  assert.equal(result.Failed.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /secret database host/);
});

test("processes 500 jobs in safe batches", async () => {
  const db = mockDatabase();
  const jobs = Array.from({ length: 500 }, (_, index) => ready(String(index)));
  const result = await importPreparedJobs(input(jobs), deps(db.database));
  assert.equal(result.Imported.length, 500);
  assert.equal(db.calls.find.length, 10);
  assert.ok(db.calls.find.every((call) => call.ids.length <= 50));
});

test("rejects provider, identity, required field, and invalid corrections", async () => {
  const db = mockDatabase();
  const needsReview = { ...ready("4"), status: "needs-review", job: { ...ready("4").job, city: undefined, state: undefined }, issues: [{ field: "location", reason: "missing", message: "Choose location" }] };
  const jobs = [ready("1", { providerKey: "lever" }), ready("2", { externalId: "other" }), ready("3", { descriptionHtml: " " }), needsReview];
  const corrections = [{ providerKey: "greenhouse", externalId: "4", employerStoreId: "invalid-store" }];
  const result = await importPreparedJobs(input(jobs, corrections), deps(db.database));
  assert.equal(result.Failed.length, 4);
  assert.equal(db.calls.insert.length, 0);
});

test("applies review corrections and sanitizes immediately before persistence", async () => {
  const db = mockDatabase();
  const item = { ...ready("1"), status: "needs-review", job: { ...ready("1").job, descriptionHtml: undefined }, issues: [{ field: "description", reason: "missing", message: "Add description" }] };
  const result = await importPreparedJobs(input([item], [{ providerKey: "greenhouse", externalId: "1", description: '<p onclick="steal()">Safe</p><script>bad()</script>' }]), deps(db.database));
  assert.equal(result.Imported.length, 1);
  assert.equal(db.calls.insert[0].description, "<p>Safe</p>");
});

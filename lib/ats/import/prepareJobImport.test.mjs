import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "prepareJobImport.ts");
const hardeningMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/202608030002_harden_employer_ats_location_mappings.sql");

function loadPrepare(previewJobImport, getProvider = () => undefined) {
  const source = readFileSync(modulePath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{[^}]+\} from "\.\.\/types";\n/s, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "./previewJobImport") return { previewJobImport };
    if (specifier === "../providers/registry") return { getAtsProvider: getProvider };
    if (specifier === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

const key = (externalId, providerKey = "greenhouse") => ({ providerKey, externalId });
const job = (externalId, overrides = {}) => ({
  externalId,
  providerKey: "greenhouse",
  sourceUrl: `https://boards.example/jobs/${externalId}`,
  applyUrl: `https://boards.example/jobs/${externalId}#apply`,
  title: "Line Cook",
  location: "Baltimore, MD",
  descriptionHtml: "<p>Cook great food.</p>",
  employmentType: "Full-time",
  ...overrides,
});
const readyPreview = (jobs) => async () => ({
  status: "ready", providerKey: "greenhouse", sourceUrl: "https://boards.example/acme", jobs,
});

test("empty and over-limit selections are rejected without previewing", async () => {
  let calls = 0;
  const { prepareJobImport } = loadPrepare(async () => { calls += 1; });
  assert.equal((await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [] })).status, "invalid-request");
  assert.equal((await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: Array.from({ length: 501 }, (_, i) => key(String(i))) })).status, "invalid-request");
  assert.equal(calls, 0);
});

test("preview failures are mapped to fixed safe messages", async () => {
  const { prepareJobImport } = loadPrepare(async () => ({ status: "discovery-failed", message: "DNS secret internal detail" }));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("1")] });
  assert.equal(result.status, "discovery-failed");
  assert.doesNotMatch(result.message, /DNS|secret|internal/);
});

test("provider mismatch and a missing refreshed job are unavailable", async () => {
  const { prepareJobImport } = loadPrepare(readyPreview([]));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("1", "lever"), key("2")] });
  assert.deepEqual(result.items.map((item) => item.status), ["unavailable", "unavailable"]);
  assert.match(result.items[0].message, /does not belong/);
  assert.match(result.items[1].message, /no longer available/);
});

test("maps clear US city/state forms and normalizes state names", () => {
  const { mapUsLocation } = loadPrepare(async () => undefined);
  assert.deepEqual(mapUsLocation(" Baltimore, MD "), { city: "Baltimore", state: "MD" });
  assert.deepEqual(mapUsLocation("Baltimore, Maryland"), { city: "Baltimore", state: "MD" });
  assert.deepEqual(mapUsLocation("Washington, DC"), { city: "Washington", state: "DC" });
  assert.deepEqual(mapUsLocation("New York, New York"), { city: "New York", state: "NY" });
});

test("ambiguous location forms require location review", async () => {
  const values = ["Remote", "Remote - US", "Multiple Locations", "Baltimore, MD / Washington, DC"];
  const jobs = values.map((location, index) => job(String(index), { location }));
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: jobs.map((item) => key(item.externalId)) });
  for (const item of result.items) {
    assert.equal(item.status, "needs-review");
    assert.ok(item.issues.some((issue) => issue.field === "location"));
  }
});

test("saved mappings are isolated by employer and provider and reused automatically", async () => {
  const imported = job("550", { location: "550 Madison" });
  const { prepareJobImport } = loadPrepare(readyPreview([imported]));
  let lookup;
  const result = await prepareJobImport(
    { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("550")] },
    { findLocationMappings: async (...args) => {
      lookup = args;
      return [{ ats_provider: "greenhouse", ats_location_value: "550 Madison", ats_location_key: "550 Madison", city: "New York", state: "NY", employer_store_id: "store-1", employer_stores: { id: "store-1", employer_account_id: "employer-a", city: "Baltimore", state: "MD", active: true, is_assignable_location: true } }];
    } },
  );
  assert.deepEqual(lookup, ["employer-a", "greenhouse", ["550 Madison"]]);
  assert.equal(result.items[0].status, "ready");
  assert.deepEqual({ city: result.items[0].job.city, state: result.items[0].job.state }, { city: "Baltimore", state: "MD" });
  assert.ok(!("issues" in result.items[0]));
});

test("queries normalized locations from selected jobs only and normalizes provider keys", async () => {
  const jobs = [job("selected", { location: "  Store\t  #102  " }), job("other", { location: "Corporate" })];
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  let lookup;
  await prepareJobImport(
    { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("selected", " GreenHouse ")] },
    { findLocationMappings: async (...args) => { lookup = args; return []; } },
  );
  assert.deepEqual(lookup, ["employer-a", "greenhouse", ["Store #102"]]);
});

test("matches collapsed whitespace exactly without fuzzy or unrelated-string matches", async () => {
  const imported = job("store", { location: " Store   #102 " });
  const { prepareJobImport } = loadPrepare(readyPreview([imported]));
  const store = { id: "store-1", employer_account_id: "employer-a", city: "Baltimore", state: "MD", active: true, is_assignable_location: true };
  const mapping = { ats_provider: "greenhouse", ats_location_value: "Store #10", ats_location_key: "Store #10", city: "Wrong", state: "NY", employer_store_id: "store-1", employer_stores: store };
  const unrelated = await prepareJobImport(
    { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("store")] },
    { findLocationMappings: async () => [mapping] },
  );
  assert.ok(unrelated.items[0].issues.some((issue) => issue.field === "location"));
  const exact = await prepareJobImport(
    { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("store")] },
    { findLocationMappings: async () => [{ ...mapping, ats_location_value: "Store #102", ats_location_key: "Store #102", city: "Baltimore", state: "MD" }] },
  );
  assert.equal(exact.items[0].job.city, "Baltimore");
});

test("stale, cross-employer, inactive, and unassignable mapping targets require review", async () => {
  const imported = job("stale", { location: "Corporate" });
  const { prepareJobImport } = loadPrepare(readyPreview([imported]));
  const base = { ats_provider: "greenhouse", ats_location_value: "Corporate", ats_location_key: "Corporate", city: "Baltimore", state: "MD", employer_store_id: "store-1" };
  const targets = [
    null,
    { id: "store-1", employer_account_id: "other-employer", city: "Baltimore", state: "MD", active: true, is_assignable_location: true },
    { id: "store-1", employer_account_id: "employer-a", city: "Baltimore", state: "MD", active: false, is_assignable_location: true },
    { id: "store-1", employer_account_id: "employer-a", city: "Baltimore", state: "MD", active: true, is_assignable_location: false },
  ];
  for (const employer_stores of targets) {
    const result = await prepareJobImport(
      { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("stale")] },
      { findLocationMappings: async () => [{ ...base, employer_stores }] },
    );
    assert.ok(result.items[0].issues.some((issue) => issue.field === "location"));
  }
  const wrongProvider = await prepareJobImport(
    { employerAccountId: "employer-a", careersPageUrl: "https://example.com", selectedJobKeys: [key("stale")] },
    { findLocationMappings: async () => [{ ...base, ats_provider: "lever", employer_stores: { id: "store-1", employer_account_id: "employer-a", city: "Baltimore", state: "MD", active: true, is_assignable_location: true } }] },
  );
  assert.ok(wrongProvider.items[0].issues.some((issue) => issue.field === "location"));
});

test("hardening migration establishes normalized uniqueness, cascading store FK, timestamp trigger, and service-only RLS", () => {
  const sql = readFileSync(hardeningMigrationPath, "utf8");
  assert.match(sql, /employer_store_id uuid/);
  assert.match(sql, /references public\.employer_stores\(id\) on delete cascade/);
  assert.match(sql, /\(employer_account_id, ats_provider, ats_location_key\)/);
  assert.match(sql, /execute function public\.touch_updated_at\(\)/);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(readFileSync(resolve(dirname(hardeningMigrationPath), "202608030001_employer_ats_location_mappings.sql"), "utf8"), /enable row level security/);
});

test("high-confidence role categories map while uncertain roles need review", async () => {
  const jobs = [job("certain", { title: "Restaurant Bartender" }), job("uncertain", { title: "Culinary Specialist" })];
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: jobs.map((item) => key(item.externalId)) });
  assert.equal(result.items[0].status, "ready");
  assert.equal(result.items[0].job.roleCategory, "Bartender");
  assert.equal(result.items[1].status, "needs-review");
  assert.ok(result.items[1].issues.some((issue) => issue.field === "roleCategory"));
  assert.equal(result.items[1].job.roleCategory, undefined);
});

test("employment types are normalized to current RNH values", () => {
  const { mapEmploymentType } = loadPrepare(async () => undefined);
  assert.equal(mapEmploymentType("Full-time"), "Full time");
  assert.equal(mapEmploymentType("part_time"), "Part time");
  assert.equal(mapEmploymentType("Contractor"), "Contract");
  assert.equal(mapEmploymentType("Temporary"), "Temporary");
  assert.equal(mapEmploymentType("Internship"), "Internship");
  assert.equal(mapEmploymentType("Permanent"), undefined);
});

test("missing and invalid application URLs are unavailable", async () => {
  const jobs = [job("missing", { applyUrl: undefined }), job("invalid", { applyUrl: "javascript:alert(1)" })];
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: jobs.map((item) => key(item.externalId)) });
  assert.deepEqual(result.items.map((item) => item.status), ["unavailable", "unavailable"]);
});

test("missing required description and employment type need review", async () => {
  const sourceJob = job("1", { descriptionHtml: " ", employmentType: undefined });
  const { prepareJobImport } = loadPrepare(readyPreview([sourceJob]));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("1")] });
  assert.equal(result.items[0].status, "needs-review");
  assert.deepEqual(result.items[0].issues.map((issue) => issue.field), ["employmentType", "description"]);
});

test("selected order is preserved and duplicate occurrences are explicit", async () => {
  const jobs = [job("first"), job("second")];
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("second"), key("first"), key("second")] });
  assert.deepEqual(result.items.map((item) => item.externalId), ["second", "first", "second"]);
  assert.deepEqual(result.items.map((item) => item.status), ["ready", "ready", "unavailable"]);
  assert.match(result.items[2].message, /more than once/);
});

test("500 selected jobs are accepted and summarized", async () => {
  const jobs = Array.from({ length: 500 }, (_, i) => job(String(i)));
  const { prepareJobImport } = loadPrepare(readyPreview(jobs));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: jobs.map((item) => key(item.externalId)) });
  assert.equal(result.status, "prepared");
  assert.deepEqual(result.summary, { requested: 500, ready: 500, needsReview: 0, unavailable: 0 });
});

test("prepared output excludes provider raw payload and does not mutate imported jobs", async () => {
  const sourceJob = job("1", { raw: { secret: "provider payload" }, companyName: "Client must not control this" });
  const snapshot = structuredClone(sourceJob);
  const { prepareJobImport } = loadPrepare(readyPreview([sourceJob]));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("1")] });
  assert.deepEqual(sourceJob, snapshot);
  assert.equal(result.items[0].status, "ready");
  assert.equal("raw" in result.items[0].job, false);
  assert.equal("companyName" in result.items[0].job, false);
  assert.doesNotMatch(JSON.stringify(result), /provider payload/);
});

test("ATS description HTML is preserved verbatim for sanitization at persistence", async () => {
  const descriptionHtml = "<p>Source <strong>format</strong></p>";
  const sourceJob = job("1", { descriptionHtml });
  const { prepareJobImport } = loadPrepare(readyPreview([sourceJob]));
  const result = await prepareJobImport({ careersPageUrl: "https://example.com", selectedJobKeys: [key("1")] });
  assert.equal(result.items[0].job.descriptionHtml, descriptionHtml);
});

test("provider hydration uses authoritative selected identities, deduplicates requests, preserves order, and marks individual failures", async () => {
  const previewJobs = [job("first", { providerKey: "workday", title: "Client title", descriptionHtml: undefined }), job("second", { providerKey: "workday", descriptionHtml: undefined })];
  const hydratedCalls = [];
  const provider = { hydrateJobs: async ({ jobs }) => {
    hydratedCalls.push(jobs.map((item) => item.externalId));
    return [
      { status: "ready", job: job("first", { providerKey: "workday", title: "Server title", descriptionHtml: "<p>Hydrated</p>" }) },
      { status: "unavailable", providerKey: "workday", externalId: "second" },
    ];
  } };
  const { prepareJobImport } = loadPrepare(async () => ({ status: "ready", providerKey: "workday", sourceUrl: "https://boards.example/workday", jobs: previewJobs }), () => provider);
  const result = await prepareJobImport({ employerAccountId: "account-1", careersPageUrl: "https://example.com", selectedJobKeys: [key("second", "workday"), key("first", "workday"), key("first", "workday")] }, { getProvider: () => provider, findLocationMappings: async () => [] });
  assert.deepEqual(hydratedCalls, [["second", "first"]]);
  assert.deepEqual(result.items.map((item) => item.externalId), ["second", "first", "first"]);
  assert.equal(result.items[0].status, "unavailable");
  assert.equal(result.items[1].status, "ready");
  assert.equal(result.items[1].job.title, "Server title");
  assert.equal(result.items[1].job.descriptionHtml, "<p>Hydrated</p>");
  assert.equal(result.items[2].status, "unavailable");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "syncEmployerAtsConnection.ts");
const providerJob = (id, overrides = {}) => ({ externalId: id, providerKey: "greenhouse", sourceUrl: `https://boards.example/${id}`, applyUrl: `https://boards.example/${id}/apply`, title: "Line Cook", location: "Baltimore, MD", descriptionHtml: "<p>Cook</p>", employmentType: "Full time", updatedAt: "2026-08-01T00:00:00.000Z", ...overrides });
const existingJob = (id, overrides = {}) => ({ id: `rnh-${id}`, ats_external_job_id: id, ats_inactive_reason: null, status: "active", active: true, approved_at: "2026-01-01T00:00:00Z", expires_at: "2026-09-01T00:00:00Z", ats_source_url: `https://old/${id}`, ats_apply_url: `https://old/${id}/apply`, ats_last_synced_at: null, ats_remote_updated_at: null, title: "Old", description: "Old", city: "Annapolis", state: "MD", role_category: "Server", employment_type: "Part time", how_to_apply: "https://old/apply", ...overrides });

function loadSync() {
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n\n', "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "../../richText") return { sanitizeRichText: (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "") };
    if (name === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    if (name === "../providers/registry") return { getAtsProvider: () => undefined };
    if (name === "../import/prepareJobImport") return { normalizeAtsLocationKey: (v) => v.trim().replace(/\s+/g, " "), mapUsLocation: (v) => v === "Baltimore, MD" ? { city: "Baltimore", state: "MD" } : undefined, mapRoleCategory: (title) => /line cook/i.test(title) ? "Line" : undefined, mapEmploymentType: (v) => v === "Full time" ? "Full time" : undefined };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports.syncEmployerAtsConnection;
}
const sync = loadSync();

function setup({ connection = {}, jobs = [], remote = [], parseError = false, updateErrorIds = [], mappings = [] } = {}) {
  const calls = { reads: [], mappings: [], updates: [] };
  const row = { id: "connection-1", employer_account_id: "account-1", provider_key: "greenhouse", source_url: "https://boards.example/company", enabled: true, connection_status: "active", ...connection };
  const database = {
    async getConnection() { return { data: connection === null ? null : row, error: null }; },
    async getImportedJobs(account, provider, from, to) { calls.reads.push({ account, provider, from, to }); return { data: jobs.slice(from, to + 1), error: null }; },
    async getLocationMappings(account, provider, keys) { calls.mappings.push({ account, provider, keys }); return { data: mappings, error: null }; },
    async updateJob(id, payload) { calls.updates.push({ id, payload }); return updateErrorIds.includes(id) ? { data: null, error: {} } : { data: { id }, error: null }; },
  };
  const provider = { parseJobs: async () => { if (parseError) throw new Error("secret"); return remote; } };
  return { calls, dependencies: { database, getProvider: (key) => key === "greenhouse" ? provider : undefined, now: () => new Date("2026-08-03T12:00:00Z") } };
}

test("connection validation returns safe failures", async () => {
  assert.equal((await sync({ connectionId: "x" }, setup({ connection: null }).dependencies)).status, "connection-unavailable");
  assert.equal((await sync({ connectionId: "x" }, setup({ connection: { enabled: false } }).dependencies)).status, "disabled");
  assert.equal((await sync({ connectionId: "x" }, setup({ connection: { connection_status: "disconnected" } }).dependencies)).status, "connection-unavailable");
  assert.equal((await sync({ connectionId: "x" }, setup({ connection: { provider_key: "gone" } }).dependencies)).status, "unsupported-provider");
  for (const source_url of ["notaurl", "ftp://example.com", "https://user:pass@example.com"]) assert.equal((await sync({ connectionId: "x" }, setup({ connection: { source_url } }).dependencies)).status, "connection-unavailable");
});

test("provider failure performs zero reads and writes", async () => {
  const db = setup({ parseError: true, jobs: [existingJob("1")] }); const result = await sync({ connectionId: "x" }, db.dependencies);
  assert.equal(result.status, "retrieval-failed"); assert.equal(db.calls.reads.length, 0); assert.equal(db.calls.updates.length, 0); assert.doesNotMatch(result.message, /secret/);
});

test("updates only managed fields and sanitizes the persisted description", async () => {
  const db = setup({ jobs: [existingJob("1")], remote: [providerJob("1", { descriptionHtml: "<p>New</p><script>bad()</script>" })] }); const result = await sync({ connectionId: "x" }, db.dependencies);
  assert.equal(result.Updated.length, 1); const payload = db.calls.updates[0].payload;
  assert.equal(payload.description, "<p>New</p>"); assert.equal(payload.city, "Baltimore"); assert.equal(payload.role_category, "Line"); assert.equal(payload.ats_last_synced_at, "2026-08-03T12:00:00.000Z");
  for (const key of ["expires_at", "approved_at", "employer_account_id", "billing_status", "active", "status"]) assert.equal(key in payload, false);
});

test("ambiguous values preserve saved values and saved mappings update location", async () => {
  const ambiguous = setup({ jobs: [existingJob("1")], remote: [providerJob("1", { title: "Mystery", location: "Many places", employmentType: "Unknown" })] }); const reviewed = await sync({ connectionId: "x" }, ambiguous.dependencies);
  assert.equal(reviewed.NeedsReview.length, 1); const first = ambiguous.calls.updates[0].payload; assert.equal("city" in first, false); assert.equal("role_category" in first, false); assert.equal("employment_type" in first, false);
  const mapped = setup({ jobs: [existingJob("1")], remote: [providerJob("1", { location: "Store 7" })], mappings: [{ ats_location_key: "Store 7", city: "Towson", state: "MD", employer_stores: { employer_account_id: "account-1", active: true, is_assignable_location: true, city: "Towson", state: "MD" } }] });
  await sync({ connectionId: "x" }, mapped.dependencies); assert.equal(mapped.calls.updates[0].payload.city, "Towson");
});

test("unchanged jobs refresh, missing jobs close, and new jobs are not inserted", async () => {
  const same = providerJob("1"); const row = existingJob("1", { title: same.title, description: same.descriptionHtml, city: "Baltimore", state: "MD", role_category: "Line", employment_type: "Full time", ats_source_url: same.sourceUrl, ats_apply_url: same.applyUrl, how_to_apply: same.applyUrl, ats_remote_updated_at: same.updatedAt });
  const db = setup({ jobs: [row, existingJob("closed")], remote: [same, providerJob("new")] }); const result = await sync({ connectionId: "x" }, db.dependencies);
  assert.equal(result.Unchanged.length, 1); assert.equal(result.Closed.length, 1); assert.equal(result.NewAvailable.length, 1); assert.equal(result.Reopened.length, 0);
  assert.deepEqual(db.calls.updates.find((v) => v.id === "rnh-closed").payload, { active: false, status: "archived", ats_inactive_reason: "closed_in_ats", ats_last_synced_at: "2026-08-03T12:00:00.000Z" }); assert.equal("descriptionHtml" in result.NewAvailable[0], false);
});

test("writes are partial and reads are bounded and isolated", async () => {
  const jobs = Array.from({ length: 201 }, (_, i) => existingJob(String(i))); const remote = jobs.map((_, i) => providerJob(String(i))); const db = setup({ jobs, remote, updateErrorIds: ["rnh-0"] }); const result = await sync({ connectionId: "x" }, db.dependencies);
  assert.equal(result.Failed.length, 1); assert.equal(result.Updated.length, 200); assert.equal(db.calls.reads.length, 2); assert.ok(db.calls.reads.every(({ account, provider, from, to }) => account === "account-1" && provider === "greenhouse" && to - from + 1 === 200));
});

test("approved and never-approved ATS closures reopen with established statuses", async () => {
  const db = setup({ jobs: [existingJob("approved", { active: false, status: "archived", ats_inactive_reason: "closed_in_ats" }), existingJob("pending", { active: false, status: "archived", approved_at: null, ats_inactive_reason: "closed_in_ats" })], remote: [providerJob("approved"), providerJob("pending")] });
  const result = await sync({ connectionId: "x" }, db.dependencies); assert.equal(result.Reopened.length, 2);
  assert.deepEqual(Object.fromEntries(db.calls.updates.map(({ id, payload }) => [id, { active: payload.active, status: payload.status, reason: payload.ats_inactive_reason }])), { "rnh-approved": { active: true, status: "active", reason: null }, "rnh-pending": { active: false, status: "pending", reason: null } });
});

test("intentional and legacy inactivity is never reopened but content updates", async () => {
  const jobs = [existingJob("employer", { active: false, status: "paused", ats_inactive_reason: "employer_deactivated" }), existingJob("admin", { active: false, status: "rejected", ats_inactive_reason: "admin_rejected" }), existingJob("legacy", { active: false, status: "archived" })];
  const db = setup({ jobs, remote: jobs.map((job) => providerJob(job.ats_external_job_id)) }); const result = await sync({ connectionId: "x" }, db.dependencies); assert.equal(result.Reopened.length, 0);
  for (const { payload } of db.calls.updates) { assert.equal("active" in payload, false); assert.equal("status" in payload, false); assert.equal("ats_inactive_reason" in payload, false); assert.equal(payload.title, "Line Cook"); }
});

test("normal active and pending jobs preserve state and provider identity participates in matching", async () => {
  const db = setup({ jobs: [existingJob("active"), existingJob("pending", { active: false, status: "pending", approved_at: null })], remote: [providerJob("active"), providerJob("pending"), providerJob("foreign", { providerKey: "other" })] }); const result = await sync({ connectionId: "x" }, db.dependencies);
  assert.equal(result.Reopened.length, 0); assert.equal(result.NewAvailable.length, 0);
  for (const { payload } of db.calls.updates) { assert.equal("active" in payload, false); assert.equal("status" in payload, false); assert.equal("ats_inactive_reason" in payload, false); }
});

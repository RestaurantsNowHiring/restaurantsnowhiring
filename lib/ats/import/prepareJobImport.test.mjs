import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "prepareJobImport.ts");

function loadPrepare(previewJobImport) {
  const source = readFileSync(modulePath, "utf8")
    .replace('import "server-only";\n\n', "")
    .replace(/import type \{[^}]+\} from "\.\.\/types";\n/s, "");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "./previewJobImport") return { previewJobImport };
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

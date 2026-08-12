import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const experience = await readFile(new URL("./InterestedCandidatesExperience.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../page.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../../api/employer/candidate-submissions/route.ts", import.meta.url), "utf8");
const resumeApi = await readFile(new URL("../../api/employer/candidate-submissions/[id]/resume/route.ts", import.meta.url), "utf8");

test("dedicated route preserves authentication, authorization, and account selection", () => {
  assert.match(page, /employer-login\?next=/);
  assert.match(page, /canViewCandidates/);
  assert.match(page, /X-Employer-Account-Id/);
  assert.match(page, /\/api\/employer\/candidate-submissions/);
});

test("candidate experience preserves filters, actions, loading, errors, and empty state", () => {
  for (const text of ["Search interested candidates", "Filter interested candidates by job role", "Filter interested candidates by location", "Filter interested candidates by job level", "Filter interested candidates by status", "No interested candidates yet", "No candidates match"]) assert.match(experience, new RegExp(text));
  assert.match(experience, /method: "PATCH"/);
  assert.match(experience, /\/resume/);
  assert.match(experience, /mailto:/);
  assert.match(experience, /tel:/);
  assert.match(page, /Loading interested candidates/);
  assert.match(page, /role="alert"/);
});

test("candidate cards retain responsive overflow-safe structure", () => {
  assert.match(experience, /@media\(max-width:760px\)/);
  assert.match(experience, /overflow-wrap:anywhere/);
  assert.match(page, /overflowX: "clip"/);
});

test("dashboard renders only an authoritative count summary and navigation", () => {
  assert.match(dashboard, /\{candidates\.length\} Interested Candidates/);
  assert.match(dashboard, /href="\/employer-dashboard\/interested-candidates"/);
  assert.doesNotMatch(dashboard, /Search interested candidates/);
  assert.doesNotMatch(dashboard, /rn-candidate-list">\{filteredCandidates/);
  assert.match(page, /href="\/employer-dashboard"/);
});

test("server APIs continue to enforce employer scope and permissions", () => {
  assert.match(api, /getEmployerAccountContext/);
  assert.match(api, /canViewCandidates/);
  assert.match(api, /canUpdateCandidateStatuses/);
  assert.match(api, /filterEmployerVisibleJobs/);
  assert.match(api, /visibleJobIdSet\.has/);
  assert.match(resumeApi, /canUserAccessJob/);
  assert.match(resumeApi, /createSignedUrl/);
});

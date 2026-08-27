import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getPublicJobApplicationMode,
  mapPublicJobRecord,
} from "../../lib/publicJobData.mjs";

const detail = fs.readFileSync("app/jobs/[id]/page.tsx", "utf8");
const engagement = fs.readFileSync("app/components/JobEngagement.tsx", "utf8");
const candidateForm = fs.readFileSync("app/components/CandidateSubmissionForm.tsx", "utf8");

function renderApplicationTokens(databaseRecord) {
  const job = mapPublicJobRecord(databaseRecord);
  const mode = getPublicJobApplicationMode(job);
  return mode.kind === "external"
    ? `APPLY ON COMPANY SITE href-only=${mode.applyUrl ? "yes" : "no"}`
    : "CANDIDATE INTEREST Resume upload Send My Information";
}

test("database source_type survives the real public-job mapper and selects the sourced branch", () => {
  const output = renderApplicationTokens({
    id: "sourced-job",
    source_type: "rnh_sourced",
    external_apply_url: "https://example.com/apply",
  });
  assert.match(output, /APPLY ON COMPANY SITE/);
  assert.doesNotMatch(output, /Send My Information|Resume upload|https:\/\/example\.com\/apply/);
});

test("the same public-job mapper keeps employer jobs on candidate interest", () => {
  const output = renderApplicationTokens({
    id: "employer-job",
    source_type: "employer",
    external_apply_url: null,
  });
  assert.match(output, /CANDIDATE INTEREST/);
  assert.match(output, /Resume upload|Send My Information/);
  assert.doesNotMatch(output, /APPLY ON COMPANY SITE/);
});

test("sourced application branch renders only the external application card", () => {
  assert.match(detail, /isSourced \? \(\s*<JobEngagement[\s\S]*?applyUrl=\{applicationMode\.applyUrl\}/);
  assert.match(detail, /\) : \(\s*<>\s*<JobEngagement jobId=\{visibleJob\.id\} \/>\s*<CandidateSubmissionForm/);
  assert.doesNotMatch(engagement, /CandidateSubmissionForm|Full Name|Phone Number|Resume Upload|Optional Message|Send My Information/);
});

test("external application card uses the URL only as its link destination", () => {
  assert.match(engagement, /href=\{applyUrl\}/);
  assert.match(engagement, />APPLY ON COMPANY SITE →<\/a>/);
  assert.doesNotMatch(engagement, />\s*\{applyUrl\}\s*</);
});

test("external apply click is recorded before opening a new destination", () => {
  assert.match(engagement, /record\(jobId,"apply_click"\)\.finally\(\(\)=>window\.open/);
  assert.match(engagement, /sessionId:sessionId\(\)/);
});

test("sourced disclosure remains inside the restrained external card", () => {
  assert.match(engagement, /This opportunity was identified by Restaurants NOW HIRING/);
  assert.match(engagement, /not representing the employer in the hiring process/);
});

test("employer jobs retain the complete candidate interest form", () => {
  for (const label of ["Full Name", "Email", "Phone Number", "Resume", "Optional Message", "Send My Information"]) {
    assert.match(candidateForm, new RegExp(label));
  }
  assert.match(detail, /<CandidateSubmissionForm jobId=\{visibleJob\.id\} \/>/);
});

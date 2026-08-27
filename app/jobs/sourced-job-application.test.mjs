import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const detail = fs.readFileSync("app/jobs/[id]/page.tsx", "utf8");
const engagement = fs.readFileSync("app/components/JobEngagement.tsx", "utf8");
const candidateForm = fs.readFileSync("app/components/CandidateSubmissionForm.tsx", "utf8");

test("sourced application branch renders only the external application card", () => {
  assert.match(detail, /isSourced \? \(\s*<JobEngagement[\s\S]*?applyUrl=\{visibleJob\.external_apply_url\}/);
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

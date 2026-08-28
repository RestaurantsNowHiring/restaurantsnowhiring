import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getPublicCompanyJobs } from "./publicCompanies.mjs";
import { mapPublicJobRecord } from "./publicJobData.mjs";

const sourcedMigration = fs.readFileSync("supabase/migrations/202608270001_rnh_sourced_jobs.sql", "utf8");
const companyDetail = fs.readFileSync("app/companies/[companySlug]/page.tsx", "utf8");
const sitemap = fs.readFileSync("app/sitemap.ts", "utf8");

const employerJob = { id: "employer-job", restaurant_name: "MISSION BBQ", source_type: "employer", company_id: "mission-company" };
const sourcedJob = { id: "sourced-job", restaurant_name: "Noodles & Company", source_type: "rnh_sourced", company_id: "noodles-company", external_apply_url: "https://careers.example/noodles" };

test("a sourced-only company is excluded while employer-owned inventory remains", () => {
  assert.deepEqual(getPublicCompanyJobs([sourcedJob]), []);
  assert.deepEqual(getPublicCompanyJobs([sourcedJob, employerJob]), [employerJob]);
});

test("adding sourced inventory does not establish employer participation", () => {
  const participating = getPublicCompanyJobs([employerJob, sourcedJob]);
  assert.equal(participating.length, 1);
  assert.equal(participating[0].restaurant_name, "MISSION BBQ");
  assert.equal(getPublicCompanyJobs([{ ...sourcedJob, company_id: "mission-company" }]).length, 0);
});

test("sourced jobs retain their public job-page application data", () => {
  const publicJob = mapPublicJobRecord(sourcedJob);
  assert.equal(publicJob.source_type, "rnh_sourced");
  assert.equal(publicJob.company_id, "noodles-company");
  assert.equal(publicJob.external_apply_url, "https://careers.example/noodles");
});

test("company profiles and sitemap use only employer-owned company inventory", () => {
  assert.match(companyDetail, /getPublicCompanyInventory\(\)/);
  assert.match(sitemap, /isEmployerOwnedCompanyJob\(job\)/);
});

test("sourced analytics and company claims still retain company relationships", () => {
  assert.match(sourcedMigration, /job_events\(job_id, company_id, source_type/);
  assert.match(sourcedMigration, /company_id uuid not null references public\.companies/);
  assert.match(sourcedMigration, /where company_id=new\.company_id and source_type='rnh_sourced'/);
  assert.doesNotMatch(sourcedMigration, /delete from public\.companies/i);
});

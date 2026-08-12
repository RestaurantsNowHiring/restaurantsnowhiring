import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

function jobListingsSource() {
  const start = dashboard.indexOf("Job Listings");
  const end = dashboard.indexOf("{deleteJob ?", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return dashboard.slice(start, end);
}

test("job row actions are visible without the old More menu", () => {
  const listings = jobListingsSource();
  assert.doesNotMatch(listings, /<details|<summary|More actions for/);
  assert.match(listings, />View<\/Link>/);
  assert.match(listings, />Edit<\/Link>/);
  assert.match(listings, /"Renew & Reactivate"/);
  assert.match(listings, /"Resume"/);
  assert.match(listings, /"Pause"/);
  assert.match(listings, />\s*Delete\s*<\/button>/);
});

test("existing single-job action handlers and permissions remain wired", () => {
  const listings = jobListingsSource();
  assert.match(listings, /canManageJobs && canEmployerPauseResume\(job\.status\)/);
  assert.match(listings, /handlePauseToggle\(job\)/);
  assert.match(listings, /handleDeleteClick\(job\)/);
  assert.match(listings, /busyJobId === job\.id/);
  assert.match(listings, /href={`\/jobs\/\$\{job\.id\}`}/);
  assert.match(listings, /href={`\/employer-dashboard\/jobs\/\$\{job\.id\}\/edit`}/);
});

test("search, filter, sorting, pagination, and bulk selection stay available", () => {
  const listings = jobListingsSource();
  for (const behavior of [
    "setJobSearchQuery(event.target.value)",
    "setJobStatusFilter(event.target.value as JobStatusFilter)",
    "setJobSortOption(event.target.value as JobSortOption)",
    "setJobCurrentPage((page) => Math.max(1, page - 1))",
    "setJobCurrentPage((page) => Math.min(jobTotalPages, page + 1))",
    "handleToggleSelectAllFiltered(event.target.checked)",
    "handleToggleJobSelection(job.id, event.target.checked)",
  ]) assert.ok(listings.includes(behavior), `missing preserved behavior: ${behavior}`);
});

test("desktop table does not opt into horizontal scrolling and mobile uses cards", () => {
  assert.match(dashboard, /\.rn-dashboard-table-wrap\s*{[\s\S]*?overflow: hidden;/);
  assert.doesNotMatch(dashboard, /min-width:\s*1180px|overflow-x:\s*auto|Scrollable job listings table/);
  assert.match(dashboard, /@media \(max-width: 980px\)[\s\S]*?\.rn-dashboard-table-wrap\s*{\s*display: none;/);
  assert.match(dashboard, /@media \(max-width: 980px\)[\s\S]*?\.rn-dashboard-mobile-list\s*{\s*display: grid;/);
  assert.match(dashboard, /rn-dashboard-mobile-card/);
});

test("desktop actions stay on one compact row and title and location retain useful width", () => {
  assert.match(dashboard, /\.rn-dashboard-row-actions\s*{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(dashboard, /\.rn-dashboard-table__col-title\s*{\s*width: 20%;/);
  assert.match(dashboard, /\.rn-dashboard-table__col-location\s*{\s*width: 16\.5%;/);
  assert.match(dashboard, /\.rn-dashboard-table th,[\s\S]*?padding: 9px 6px;/);
  assert.match(dashboard, /\.rn-dashboard-table td:nth-child\(7\),[\s\S]*?text-align: center;/);
});

test("employer account scoping remains unchanged", () => {
  assert.match(dashboard, /X-Employer-Account-Id/);
  assert.match(dashboard, /selectedEmployerAccountId/);
  assert.match(dashboard, /canUserAccessJob/);
  assert.match(dashboard, /employer_account_id/);
});

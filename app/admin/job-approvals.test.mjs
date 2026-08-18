import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const adminPage = await readFile(new URL("./AdminPageClient.tsx", import.meta.url), "utf8");

async function employerListModule() {
  const source = await readFile(new URL("../../lib/adminEmployerList.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const employer = (number, overrides = {}) => ({
  employer: `Restaurant ${number}`,
  email: `contact${number}@example.com`,
  adCount: number,
  latest: `2026-08-${String(number).padStart(2, "0")}`,
  ...overrides,
});

test("Job ad review and its status controls render before the employer list", () => {
  const review = adminPage.indexOf("Job ad review");
  const controls = adminPage.indexOf('label: "Pending"', review);
  const results = adminPage.indexOf("filteredJobs.map", controls);
  const employers = adminPage.indexOf("Employers with submitted jobs");
  assert.ok(review !== -1 && review < controls);
  assert.ok(controls < results);
  assert.ok(results < employers);
});

test("employer search matches restaurant names and contact emails case-insensitively", async () => {
  const { filterAdminEmployers } = await employerListModule();
  const rows = [
    employer(1, { employer: "Green Fork" }),
    employer(2, { email: "HIRING@BlueBistro.com" }),
    employer(3),
  ];
  assert.deepEqual(filterAdminEmployers(rows, " green "), [rows[0]]);
  assert.deepEqual(filterAdminEmployers(rows, "bluebistro"), [rows[1]]);
  assert.deepEqual(filterAdminEmployers(rows, ""), rows);
});

test("employer pagination defaults to 15 rows and reports a clear range", async () => {
  const { ADMIN_EMPLOYERS_PER_PAGE, paginateAdminEmployers } = await employerListModule();
  const rows = Array.from({ length: 32 }, (_, index) => employer(index + 1));
  assert.equal(ADMIN_EMPLOYERS_PER_PAGE, 15);
  assert.deepEqual(paginateAdminEmployers(rows, 1), {
    rows: rows.slice(0, 15), page: 1, totalPages: 3, total: 32, showingStart: 1, showingEnd: 15,
  });
  assert.deepEqual(paginateAdminEmployers(rows, 3), {
    rows: rows.slice(30), page: 3, totalPages: 3, total: 32, showingStart: 31, showingEnd: 32,
  });
});

test("existing approval behavior remains wired to the existing endpoints and status helpers", () => {
  assert.match(adminPage, /adminFilterForJob\(job\.status, job\.active\)/);
  assert.match(adminPage, /updateJobStatus\(job\.id, "approve"\)/);
  assert.match(adminPage, /updateJobStatus\(job\.id, "reject"\)/);
  assert.match(adminPage, /`\/api\/admin\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/\$\{action\}`/);
  assert.match(adminPage, /const optimisticStatus = action === "approve" \? "active" : "rejected"/);
});

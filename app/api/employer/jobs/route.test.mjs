import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const routePath = resolve(dirname(fileURLToPath(import.meta.url)), "route.ts");

function loadRoute({ accountId = "mission-account", allowlisted = true } = {}) {
  const source = readFileSync(routePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const inserts = [];
  const syncs = [];
  const admin = { from(table) {
    assert.equal(table, "jobs");
    return { insert(payload) { inserts.push(payload); return { select() { return { async single() { return { data: { id: "job-1", status: payload.status, active: payload.active, approved_at: payload.approved_at ?? null }, error: null }; } }; } }; } };
  } };
  const mod = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init = {}) => Response.json(body, init) } };
    if (specifier.endsWith("/billing")) return { getAuthUserFromRequest: async () => ({ id: "poster", email: "poster@example.com" }), syncSubscriptionQuantityForEmployer: async (id) => syncs.push(id) };
    if (specifier.endsWith("/employerAccounts")) return {
      getSelectedEmployerAccountIdFromRequest: (request) => request.headers.get("x-employer-account-id"),
      getEmployerAccountContext: async () => ({ accountId, ownerUserId: "owner", ownerEmail: "owner@example.com", assignedStoreIds: [], canManageNotificationRouting: true, defaultCandidateNotificationRouting: "job_poster", canManageJobs: true }),
      assertEmployerPermission: () => {},
    };
    if (specifier.endsWith("/jobPersistence")) return {
      shouldAutoApproveJob: (id) => allowlisted && id === "mission-account",
      buildCanonicalJobInsertPayload: (input) => ({ employer_account_id: input.employerAccountId, employer_user_id: input.employerUserId, posted_by_user_id: input.postedByUserId, active: allowlisted && input.employerAccountId === "mission-account", status: allowlisted && input.employerAccountId === "mission-account" ? "active" : "pending", ...(allowlisted && input.employerAccountId === "mission-account" ? { approved_at: "2026-08-12T00:00:00.000Z" } : {}) }),
    };
    if (specifier.endsWith("/employerVisibleJobs")) return { filterEmployerVisibleJobs: () => [], loadEmployerJobsForDashboard: async () => ({ jobs: [], includesViews: true }) };
    if (specifier.endsWith("/supabaseAdmin")) return { getSupabaseAdminClient: () => admin };
    throw new Error(`Unexpected require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return { POST: mod.exports.POST, inserts, syncs };
}

const validJob = { restaurantName: "MISSION BBQ", title: "Cook", roleCategory: "Line", city: "Baltimore", state: "MD", applyEmail: "apply@example.com", employmentType: "Full time", description: "Cook food." };

test("manual jobs use the authoritative allowlisted account and auto-approve", async () => {
  const route = loadRoute();
  const response = await route.POST(new Request("https://example.com/api/employer/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validJob) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).autoApproved, true);
  assert.deepEqual({ account: route.inserts[0].employer_account_id, status: route.inserts[0].status, active: route.inserts[0].active, approved: route.inserts[0].approved_at }, { account: "mission-account", status: "active", active: true, approved: "2026-08-12T00:00:00.000Z" });
  assert.deepEqual(route.syncs, ["owner"]);
});

test("a client-supplied account id is rejected and cannot obtain auto-approval", async () => {
  const route = loadRoute({ accountId: "ordinary-account", allowlisted: false });
  const response = await route.POST(new Request("https://example.com/api/employer/jobs", { method: "POST", headers: { "content-type": "application/json", "x-employer-account-id": "mission-account" }, body: JSON.stringify({ ...validJob, employerAccountId: "mission-account" }) }));
  assert.equal(response.status, 400);
  assert.equal(route.inserts.length, 0);
});

test("non-MISSION manual jobs remain pending", async () => {
  const route = loadRoute({ accountId: "ordinary-account", allowlisted: false });
  const response = await route.POST(new Request("https://example.com/api/employer/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validJob) }));
  assert.equal(response.status, 200);
  assert.deepEqual({ status: route.inserts[0].status, active: route.inserts[0].active, approved: route.inserts[0].approved_at }, { status: "pending", active: false, approved: undefined });
  assert.deepEqual(route.syncs, []);
});

test("Post Job success copy is driven by the authoritative API result", () => {
  const page = readFileSync(resolve(dirname(routePath), "../../../post-job/page.tsx"), "utf8");
  assert.match(page, /setSubmittedJobAutoApproved\(responseBody\?\.autoApproved === true\)/);
  assert.match(page, /\{submittedJobAutoApproved/);
  assert.doesNotMatch(page, /getNewJobApprovalFields|shouldAutoApproveJob/);
});

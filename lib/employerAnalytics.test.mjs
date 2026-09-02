import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("./employerAnalytics.ts", import.meta.url), "utf8");
const authPage = readFileSync(new URL("../app/employer-login/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/employer-dashboard/page.tsx", import.meta.url), "utf8");
const postJob = readFileSync(new URL("../app/post-job/page.tsx", import.meta.url), "utf8");

test("employer GA helper is typed, guarded, and contains no PII parameters", () => {
  assert.match(helper, /typeof window === "undefined" \|\| typeof window\.gtag !== "function"/);
  assert.doesNotMatch(helper, /\bany\b/);
  assert.doesNotMatch(helper, /\b(?:email|phone|address|password)\??: string/);
});

test("signup and login conversions follow distinct confirmed auth branches", () => {
  assert.match(authPage, /signInWithPassword[\s\S]*employer_login_success[\s\S]*acceptPendingTeamInvites/);
  assert.match(authPage, /signUp[\s\S]*if \(error\)[\s\S]*employer_signup_success/);
  assert.match(authPage, /identities\.length === 0[\s\S]*trackSignupFailure\("account_exists"\)/);
  assert.match(authPage, /signupStartedRef\.current[\s\S]*employer_signup_start/);
});

test("authenticated dashboard views fire after access is established and are deduplicated", () => {
  assert.match(helper, /name: "employer_dashboard_view"; parameters: \{ page_path: string; company_id\?: string \}/);
  assert.match(dashboard, /authStatus !== "allowed" \|\| !employerAccess[\s\S]*trackedDashboardAccountIdsRef\.current\.has[\s\S]*employer_dashboard_view/);
  assert.match(dashboard, /setEmployerAccess\(access\)[\s\S]*setAuthStatus\("allowed"\)/);
});

test("dashboard click and post-job form and backend success are instrumented", () => {
  assert.match(dashboard, /Post New Job[\s\S]*Create Your First Job/);
  assert.equal((dashboard.match(/employer_post_job_click/g) ?? []).length, 2);
  assert.match(postJob, /jobFormStartedRef\.current[\s\S]*employer_job_form_start/);
  assert.match(postJob, /if \(!response\?\.ok\)[\s\S]*employer_job_posted/);
  assert.match(postJob, /trackedPostedJobIdsRef/);
});

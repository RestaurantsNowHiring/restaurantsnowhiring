import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const directory = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(directory, "page.tsx"), "utf8");
const form = readFileSync(resolve(directory, "PostFreeForm.tsx"), "utf8");
const route = readFileSync(resolve(directory, "../api/promotional-entry/route.ts"), "utf8");
const servicePath = resolve(directory, "../../lib/promotionalEntry.ts");

function loadService(environment = {}) {
  const source = readFileSync(servicePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (specifier) => {
    if (specifier === "node:crypto") return requireBuiltin("node:crypto");
    if (specifier.endsWith("jobFormOptions")) return { EMPLOYMENT_OPTIONS: ["Full time", "Part time", "Seasonal", "Temporary"], STATE_OPTIONS: ["MD"], CANADIAN_PROVINCE_OPTIONS: ["Ontario"], normalizeJobCountry: (v) => !v || v === "United States" ? "United States" : v === "Canada" ? "Canada" : null };
    if (specifier.endsWith("promotionalInvitations")) return { normalizePromotionalContactEmail: (v) => { const e=String(v??"").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null; } };
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("exports", "require", "module", "process", outputText)(mod.exports, require, mod, { env: environment });
  return mod.exports;
}
function requireBuiltin(name) { return process.getBuiltinModule(name); }
const valid = { companyName:" Cafe  One ", companyWebsite:"HTTPS://Example.COM", contactName:"Pat Owner", contactEmail:" Owner@Gmail.com ", title:"Cook", city:"Baltimore", state:"MD", country:"United States", employmentType:"Full time", description:"Prepare great food.", applicationUrl:"https://example.com/apply#top" };

test("/post-free is a public customer form requiring no login", () => {
  assert.match(page, /Post Your First Job Free/); assert.match(page, /No account required\. No credit card/); assert.match(page, /<PostFreeForm/);
  assert.doesNotMatch(page + form, /supabase\.auth|employer-login|server-side eligibility|Admin architecture/);
});
test("form collects required company/job fields and uses the universal endpoint", () => {
  for (const name of ["companyName","companyWebsite","contactName","contactEmail","title","city","state","country","employmentType","description","applicationUrl"]) assert.match(form, new RegExp(`name="${name}"`));
  assert.match(form, /fetch\("\/api\/promotional-entry"/); assert.match(form, /Check your email/);
});
test("server normalization, location and URL validation are deterministic", () => {
  const service = loadService(); const result = service.validatePromotionalEntry(valid);
  assert.equal(result.data.contactEmail, "owner@gmail.com"); assert.equal(result.data.companyName, "Cafe One"); assert.equal(result.data.companyWebsite, "https://example.com/");
  assert.equal(service.validatePromotionalEntry({...valid, state:"XX"}).data, undefined); assert.equal(service.validatePromotionalEntry({...valid, applicationUrl:"javascript:alert(1)"}).data, undefined);
});
test("disposable mail is rejected while legitimate consumer providers are not", () => {
  const service=loadService(); for (const domain of ["gmail.com","outlook.com","yahoo.com","icloud.com"]) assert.equal(service.isDisposableEmail(`owner@${domain}`), false);
  assert.equal(service.validatePromotionalEntry({...valid, contactEmail:"owner@mailinator.com"}).error, "Please use a permanent email address.");
});
test("IP digest is keyed, stable, and never contains the raw IP", () => {
  const service=loadService(); const a=service.digestClientIp("203.0.113.9","pepper-a"), b=service.digestClientIp("203.0.113.9","pepper-b"); assert.notEqual(a,b); assert.equal(a.length,66); assert.doesNotMatch(a,/203\.0\.113\.9/);
});
test("missing production pepper fails safely and development has a non-production fallback", () => {
  assert.equal(loadService({NODE_ENV:"production"}).getPromotionalEntryPepper({NODE_ENV:"production"}), null); assert.ok(loadService().getPromotionalEntryPepper({NODE_ENV:"development"}));
});
test("IP and normalized-email limits independently stop excess hourly requests", () => {
  const service=loadService(); assert.equal(service.promotionalEntryIsRateLimited(4, 2), false); assert.equal(service.promotionalEntryIsRateLimited(5, 0), true); assert.equal(service.promotionalEntryIsRateLimited(0, 3), true);
});
test("server boundary owns identity, source, eligibility, tokens and rate limits", () => {
  assert.match(route, /promotionalEntryIsRateLimited/); assert.match(route, /entry_source: "public_request"/);
  assert.match(route, /identity_key/); assert.match(route, /verification_token_digest: createDigestOnlyToken\(\)/); assert.match(route, /token_digest: createDigestOnlyToken\(\)/);
  assert.doesNotMatch(route, /body\.(company_id|source_type|approved|active|billing|stripe|verification_token)/i);
  assert.doesNotMatch(route, /from\("jobs"\)|stripe|syncSubscription|sendEmail|rawToken/);
  assert.match(route, /redeemed_job_id/); assert.match(route, /FRIENDLY_INELIGIBLE/); assert.match(route, /status: 429/);
});
test("success response exposes no token, invitation, company, approval, or billing state", () => {
  const success = route.slice(route.lastIndexOf("return NextResponse.json")); assert.doesNotMatch(success, /token|invitation|company|eligibility|approval|billing|stripe/i); assert.match(success, /Verify your email to continue/);
});
test("existing employer, MISSION BBQ, ATS, and billing paths are isolated", () => {
  assert.doesNotMatch(route + form, /api\/employer\/jobs|MISSION_BBQ|ats|stripe|billing/i);
});

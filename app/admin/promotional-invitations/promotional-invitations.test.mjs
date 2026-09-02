import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const serviceSource = read("lib/promotionalInvitations.ts");
const { outputText } = ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const loaded = { exports: {} };
new Function("exports", "require", "module", outputText)(loaded.exports, (name) => {
  if (name === "node:crypto") return { createHash, randomBytes };
  if (name === "./seo") return { absoluteUrl: (path) => `https://www.restaurantsnowhiring.com${path}` };
  throw new Error(`Unexpected require: ${name}`);
}, loaded);
const { buildPromotionalUrl, createPromotionalBearerToken, normalizePromotionalContactEmail, parseFutureOfferExpiration } = loaded.exports;

test("contact email is normalized and invalid email is rejected", () => {
  assert.equal(normalizePromotionalContactEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizePromotionalContactEmail("not-an-email"), null);
});

test("expiration must be valid and in the future", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assert.equal(parseFutureOfferExpiration("2026-09-01T12:00:00Z", now), null);
  assert.equal(parseFutureOfferExpiration("bad", now), null);
  assert.equal(parseFutureOfferExpiration("2026-10-02T12:00:00Z", now).toISOString(), "2026-10-02T12:00:00.000Z");
});

test("server token uses 32 random bytes and stores a 32-byte SHA-256 digest", () => {
  let requested = 0;
  const result = createPromotionalBearerToken((size) => { requested = size; return Buffer.alloc(size, 7); });
  assert.equal(requested, 32);
  assert.equal(result.digest.byteLength, 32);
  assert.match(result.databaseDigest, /^\\x[0-9a-f]{64}$/);
  assert.notEqual(result.rawToken, result.databaseDigest);
  assert.equal(buildPromotionalUrl(result.rawToken), `https://www.restaurantsnowhiring.com/promotional-post/${result.rawToken}`);
});

test("issuance and listing are authenticated, server-only, digest-only operations", () => {
  const route = read("app/api/admin/promotional-invitations/route.ts");
  assert.ok((route.match(/requireAdminApi\(\)/g) ?? []).length >= 2);
  assert.match(route, /createPromotionalBearerToken\(\)/);
  assert.match(route, /from\("companies"\).*\.eq\("id", companyId\)\.maybeSingle\(\)/s);
  assert.match(route, /token_digest: token\.databaseDigest/);
  assert.doesNotMatch(route, /token_digest: body|\.from\("jobs"\)|stripe|billing/i);
  const fields = route.match(/const LIST_FIELDS = ([^;]+)/)?.[1] ?? "";
  assert.doesNotMatch(fields, /token_digest|promotional_url/);
});

test("revocation updates an eligible invitation and never deletes or restores it", () => {
  const route = read("app/api/admin/promotional-invitations/[id]/revoke/route.ts");
  assert.match(route, /requireAdminApi\(\)/);
  assert.match(route, /redeemed_at/);
  assert.match(route, /revoked_at: new Date\(\)\.toISOString\(\), revoked_reason: reason/);
  assert.doesNotMatch(route, /\.delete\(|revoked_at:\s*null/);
});

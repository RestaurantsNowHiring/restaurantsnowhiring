import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(directory, "promotionalVerification.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = { exports: {} };

new Function("exports", "require", "module", outputText)(loaded.exports, (specifier) => {
  if (specifier === "server-only") return {};
  if (specifier === "node:crypto") return process.getBuiltinModule("node:crypto");
  if (specifier === "./emailTemplates") {
    return { buildBrandedEmailHtml: () => "", buildBrandedEmailText: () => "" };
  }
  throw new Error(`Unexpected import: ${specifier}`);
}, loaded);

const { buildPromotionalVerificationUrl, getPromotionalVerificationBaseUrl } = loaded.exports;

test("Preview verification links use the HTTPS Vercel deployment URL", () => {
  const environment = {
    VERCEL_ENV: "preview",
    VERCEL_URL: "restaurants-now-hiring-git-phase-4-example.vercel.app",
  };

  assert.equal(
    buildPromotionalVerificationUrl("secret/token", environment),
    "https://restaurants-now-hiring-git-phase-4-example.vercel.app/verify-promotional/secret%2Ftoken",
  );
});

test("Production verification links always use the canonical production URL", () => {
  const environment = {
    VERCEL_ENV: "production",
    VERCEL_URL: "attacker.example",
  };

  assert.equal(
    buildPromotionalVerificationUrl("secret-token", environment),
    "https://www.restaurantsnowhiring.com/verify-promotional/secret-token",
  );
});

test("Preview base URLs fail closed unless they are clean Vercel deployment hostnames", () => {
  for (const VERCEL_URL of [
    undefined,
    "attacker.example",
    "preview.vercel.app.evil.example",
    "preview.vercel.app/path",
    "user@preview.vercel.app",
  ]) {
    assert.equal(getPromotionalVerificationBaseUrl({ VERCEL_ENV: "preview", VERCEL_URL }), null);
  }
});


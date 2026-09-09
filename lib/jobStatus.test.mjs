import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./jobStatus.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const mod = { exports: {} };
new Function("exports", "require", "module", outputText)(mod.exports, () => {}, mod);
const { isPubliclyVisibleJob } = mod.exports;
const now = new Date("2026-09-09T12:00:00.000Z");

test("active outreach_free is public only before its exact expiration", () => {
  assert.equal(isPubliclyVisibleJob("active", true, "outreach_free", "2026-09-09T12:00:00.001Z", now), true);
  assert.equal(isPubliclyVisibleJob("active", true, "outreach_free", "2026-09-09T12:00:00.000Z", now), false);
  assert.equal(isPubliclyVisibleJob("active", true, "outreach_free", "2026-09-09T11:59:59.999Z", now), false);
});

test("employer and ATS-compatible visibility does not acquire expiration behavior", () => {
  assert.equal(isPubliclyVisibleJob("active", true, "employer", "2026-01-01T00:00:00.000Z", now), true);
  assert.equal(isPubliclyVisibleJob("active", true, "ats", "2026-01-01T00:00:00.000Z", now), true);
});

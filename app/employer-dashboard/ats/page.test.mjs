import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = resolve(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const source = readFileSync(pagePath, "utf8");

test("UI gates owner-only connection controls by account_owner role", () => {
  assert.match(source, /const canManageAtsConnectionSettings = employerAccess\?\.role === "account_owner";/);
  assert.match(source, /\{canManageAtsConnectionSettings \? \([\s\S]*Disconnect[\s\S]*\) : null\}/);
  assert.match(source, /\{canManageAtsConnectionSettings \? \([\s\S]*Change Careers Page URL[\s\S]*Update URL[\s\S]*\) : null\}/);
});

test("UI leaves job-management sync controls outside owner-only gate", () => {
  const ownerGateIndex = source.indexOf("{canManageAtsConnectionSettings ? (");
  const syncNowIndex = source.indexOf("Sync Now");
  const disableSyncIndex = source.indexOf("Disable Sync");
  const enableSyncIndex = source.indexOf("Enable Sync");
  assert.ok(syncNowIndex > -1 && syncNowIndex < ownerGateIndex);
  assert.ok(disableSyncIndex > -1 && disableSyncIndex < ownerGateIndex);
  assert.ok(enableSyncIndex > -1 && enableSyncIndex < ownerGateIndex);
});

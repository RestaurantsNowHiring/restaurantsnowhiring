import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = resolve(dirname(fileURLToPath(import.meta.url)), "page.tsx");
const source = readFileSync(pagePath, "utf8");

function callbackBody(name) {
  const start = source.indexOf(`const ${name} = useCallback`);
  assert.notEqual(start, -1, `${name} callback should exist`);
  const end = source.indexOf(";\n\n  const ", start + 1);
  assert.notEqual(end, -1, `${name} callback should have a parsable end`);
  return source.slice(start, end);
}

function callbackDeps(name) {
  const body = callbackBody(name);
  const depsMatch = body.match(/\}, \[([^\]]*)\]\)$/);
  assert.ok(depsMatch, `${name} should end with a useCallback dependency array`);
  return depsMatch[1].split(",").map((dependency) => dependency.trim()).filter(Boolean);
}

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

test("initial connections effect does not depend on connections state", () => {
  assert.deepEqual(callbackDeps("loadConnections"), ["loadSyncHistory", "router"]);
  assert.doesNotMatch(callbackBody("loadConnections"), /\}, \[[^\]]*connections[^\]]*\]\)$/);
});

test("initial history effect does not depend on history rows or loading state", () => {
  assert.deepEqual(callbackDeps("loadSyncHistory"), ["router"]);
  assert.doesNotMatch(callbackBody("loadSyncHistory"), /\}, \[[^\]]*(syncHistory|syncHistoryLoading|connections)[^\]]*\]\)$/);
});

test("loaders are stable and cannot create a repeated fetch loop through state dependencies", () => {
  assert.deepEqual(callbackDeps("loadConnections"), ["loadSyncHistory", "router"]);
  assert.deepEqual(callbackDeps("loadSyncHistory"), ["router"]);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*void checkAuthAndLoadAccess\(\);[\s\S]*\}, \[loadEmployerAccess, router\]\);/);
});

test("explicit refresh still occurs after Sync Now", () => {
  const syncBodyStart = source.indexOf("async function syncConnection");
  const actionBodyStart = source.indexOf("async function runConnectionAction");
  const syncBody = source.slice(syncBodyStart, actionBodyStart);
  assert.match(syncBody, /await loadConnections\(accessToken\);/);
});

test("explicit refresh still occurs after successful import", () => {
  const importBodyStart = source.indexOf("async function importSelectedJobs");
  const renderStart = source.indexOf("if (authStatus === \"loading\")");
  const importBody = source.slice(importBodyStart, renderStart);
  assert.match(importBody, /setImportResult\(\{ summary, groups \}\);[\s\S]*await loadConnections\(accessToken\);/);
});

test("explicit refresh still occurs after connection actions", () => {
  const actionBodyStart = source.indexOf("async function runConnectionAction");
  const nextBodyStart = source.indexOf("function toggleJobSelection");
  const actionBody = source.slice(actionBodyStart, nextBodyStart);
  assert.match(actionBody, /await loadConnections\(accessToken\);/);
});

test("existing connection cards remain rendered while a background refresh is active", () => {
  assert.match(source, /const isInitialConnectionsLoad = connectionsLoading && connections\.length === 0;/);
  assert.match(source, /connectionsLoading && connections\.length > 0 \? <p role="status"[^>]*>Refreshing connected job sources\.\.\.<\/p> : null/);
  assert.match(source, /connections\.length > 0 \? \([\s\S]*connections\.map\(\(connection\) =>/);
});

test("existing history rows remain rendered while a background refresh is active", () => {
  assert.match(source, /const isInitialHistoryLoad = syncHistoryLoading && syncHistory\.length === 0;/);
  assert.match(source, /syncHistoryLoading && syncHistory\.length > 0 \? <p role="status"[^>]*>Refreshing sync history\.\.\.<\/p> : null/);
  assert.match(source, /syncHistory\.length > 0 \? \([\s\S]*syncHistory\.map\(\(row\) =>/);
});

test("initial empty loads still show full loading messages", () => {
  assert.match(source, /isInitialConnectionsLoad \? <p role="status"[^>]*>Loading connected job sources\.\.\.<\/p> : null/);
  assert.match(source, /isInitialHistoryLoad \? <p role="status"[^>]*>Loading sync history\.\.\.<\/p> : null/);
});

test("duplicate same-resource requests are guarded", () => {
  assert.match(source, /if \(connectionsRequestRef\.current\.inFlight\) return;/);
  assert.match(source, /if \(syncHistoryRequestRef\.current\.inFlightKey === requestKey\) return;/);
});

test("stale responses cannot overwrite newer state", () => {
  assert.match(source, /connectionsRequestRef\.current\.sequence !== requestSequence/);
  assert.match(source, /syncHistoryRequestRef\.current\.sequence !== requestSequence/);
});

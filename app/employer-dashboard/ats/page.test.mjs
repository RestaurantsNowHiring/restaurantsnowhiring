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
  const match = callbackBody(name).match(/\}, \[([^\]]*)\]\)$/);
  assert.ok(match);
  return match[1].split(",").map((item) => item.trim()).filter(Boolean);
}

test("data loaders remain stable and guarded", () => {
  assert.deepEqual(callbackDeps("loadConnections"), ["loadSyncHistory", "router"]);
  assert.deepEqual(callbackDeps("loadSyncHistory"), ["router"]);
  assert.match(source, /if \(connectionsRequestRef\.current\.inFlight\) return;/);
  assert.match(source, /if \(syncHistoryRequestRef\.current\.inFlightKey === requestKey\) return;/);
  assert.match(source, /connectionsRequestRef\.current\.sequence !== requestSequence/);
  assert.match(source, /syncHistoryRequestRef\.current\.sequence !== requestSequence/);
});

test("existing data remains visible during background refresh", () => {
  assert.match(source, /const isInitialConnectionsLoad = connectionsLoading && connections\.length === 0;/);
  assert.match(source, /connectionsLoading && connections\.length > 0 \? <p role="status"/);
  assert.match(source, /const isInitialHistoryLoad = syncHistoryLoading && syncHistory\.length === 0;/);
  assert.match(source, /syncHistoryLoading && syncHistory\.length > 0 \? <p role="status"/);
});

test("explicit refreshes remain after sync, import, and source actions", () => {
  const syncBody = source.slice(source.indexOf("async function syncConnection"), source.indexOf("async function runConnectionAction"));
  const actionBody = source.slice(source.indexOf("async function runConnectionAction"), source.indexOf("function toggleJobSelection"));
  const importBody = source.slice(source.indexOf("async function importSelectedJobs"), source.indexOf("if (authStatus === \"loading\")"));
  assert.match(syncBody, /await loadConnections\(accessToken\);/);
  assert.match(actionBody, /await loadConnections\(accessToken\);/);
  assert.match(importBody, /setImportResult\(\{ summary, groups \}\);[\s\S]*await loadConnections\(accessToken\);/);
});

test("import card uses the concise requested workflow copy", () => {
  assert.match(source, />\s*Import Jobs\s*</);
  assert.match(source, /Paste your Greenhouse or Workday careers page to preview jobs before importing them\./);
  assert.match(source, /Careers Page URL/);
  assert.match(source, /https:\/\/boards\.greenhouse\.io\/company\\nor\\nhttps:\/\/company\.wd1\.myworkdayjobs\.com\/\.\.\./);
  assert.match(source, /isFindingJobs \? "Finding Jobs\.\.\." : "Find Jobs"/);
  assert.match(source, /Searching here does not change your saved job source\./);
  assert.match(source, /onSubmit=\{findJobs\}/);
  assert.match(source, /fetch\("\/api\/employer\/ats\/preview"/);
  assert.doesNotMatch(source, /Find My Jobs|Examples:|We only access jobs available on your public careers page/);
});

test("supported ATS card only names providers available today", () => {
  const start = source.indexOf('aria-label="ATS platforms available today"');
  const end = source.indexOf("More integrations coming soon.", start);
  const block = source.slice(start, end);
  assert.match(source, /Supported ATS/);
  assert.match(source, /Supported today/);
  assert.match(block, /\{\['Greenhouse', 'Workday'\]\.map/);
  assert.doesNotMatch(source, /Lever|iCIMS|Taleo|SmartRecruiters|JazzHR|Ashby/);
});

test("saved source cards expose dashboard metrics and progressive management", () => {
  assert.match(source, /Saved Job Sources/);
  assert.match(source, /\{connection\.sourceLabel\} Job Source/);
  assert.match(source, /Current URL:/);
  for (const metric of ["Imported Jobs", "Last Successful Sync", "Last Failed Sync", "Consecutive Failures"]) assert.match(source, new RegExp(metric));
  for (const action of ["Sync Now", "Disable Sync", "Enable Sync", "Manage Source", "Change URL", "Update Saved Source", "Disconnect"]) assert.match(source, new RegExp(action));
  assert.match(source, /canManageAtsConnectionSettings && managedSourceId === connection\.id/);
  assert.match(source, /employerAccess\?\.role === "account_owner"/);
});

test("source state messages are mutually exclusive", () => {
  assert.match(source, /connectionStatus === "disconnected" \? <p role="status"[\s\S]*This source is disconnected\.[\s\S]*: !connection\.enabled \? <p role="status"[\s\S]*Synchronization is paused\./);
});

test("sync history retains table, badges, and pagination", () => {
  assert.match(source, /Sync History/);
  for (const heading of ["Date", "Status", "Duration", "Jobs Updated", "Jobs Closed", "Jobs Reopened", "Needs Review", "Failed", "Warning"]) assert.match(source, new RegExp(`"${heading}"`));
  assert.match(source, /statusBadgeStyle\(getHistoryStatusTone\(row\.status\)\)/);
  assert.match(source, /aria-label="Sync history pagination"/);
  assert.doesNotMatch(source, /Newest ATS synchronization runs for your connected job source/);
});

test("imported jobs uses the connection count when no latest import exists", () => {
  assert.match(source, /const importedJobCount = connections\.reduce\(\(total, connection\) => total \+ connection\.importedJobCount, 0\);/);
  assert.match(source, /importedJobCount > 0 \? \([\s\S]*pluralize\(importedJobCount, "job"\)/);
  assert.match(source, /: \(\s*<div[\s\S]*No jobs imported yet\./);
});

test("page keeps the existing design system and responsive layout", () => {
  assert.match(source, /rn-ats-connect-grid/);
  assert.match(source, /@media \(max-width: 900px\)/);
  assert.match(source, /homeCardStyle|homeInputStyle|homePrimaryButton|homeSecondaryButton|homeTheme/);
  assert.doesNotMatch(source, /from ["'](?:react-icons|@heroicons\/react|@fortawesome\/)/);
});

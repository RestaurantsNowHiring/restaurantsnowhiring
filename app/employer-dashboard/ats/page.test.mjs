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


test("supported ATS platform guidance is honest and limited to available providers", () => {
  assert.match(source, /Supported ATS Platforms/);
  assert.match(source, /Available Today/);
  assert.match(source, /Greenhouse/);
  assert.match(source, /Workday/);
  assert.match(source, /More Integrations Coming Soon/);
  assert.match(source, /We only access jobs available on your public careers page\./);
  assert.doesNotMatch(source, /All ATS platforms supported|Universal ATS integration|credentials (are )?(stored|accessed|secure)/i);
});

test("Greenhouse and Workday are the only ATS platforms presented as available today", () => {
  const availableTodayStart = source.indexOf('aria-label="ATS platforms available today"');
  assert.notEqual(availableTodayStart, -1, "available today list should exist");
  const availableTodayEnd = source.indexOf("More Integrations Coming Soon", availableTodayStart);
  assert.notEqual(availableTodayEnd, -1, "available today list should end before coming soon copy");
  const availableTodayBlock = source.slice(availableTodayStart, availableTodayEnd);
  assert.match(availableTodayBlock, /\{\['Greenhouse', 'Workday'\]\.map/);
  assert.doesNotMatch(availableTodayBlock, /Lever|iCIMS|UKG|Taleo|JazzHR|BambooHR/i);
});

test("connection guidance renders before management, history, and imported job sections", () => {
  const connectIndex = source.indexOf("Connect Your Applicant Tracking System (ATS)");
  const supportedIndex = source.indexOf("Supported ATS Platforms");
  const connectedIndex = source.indexOf("Connected Job Sources");
  const historyIndex = source.indexOf("Sync History");
  const importedIndex = source.lastIndexOf("Imported Jobs");
  assert.ok(connectIndex > -1, "connection form heading should be present");
  assert.ok(supportedIndex > connectIndex, "supported ATS card should sit beside/after the form");
  assert.ok(connectedIndex > supportedIndex, "connected sources should follow connection guidance");
  assert.ok(historyIndex > connectedIndex, "sync history should follow connected sources");
  assert.ok(importedIndex > historyIndex, "imported jobs should remain after sync history");
});

test("preview, review, and import result flows remain near the connection area", () => {
  const connectIndex = source.indexOf("Connect Your Applicant Tracking System (ATS)");
  const jobsFoundIndex = source.indexOf("Jobs Found");
  const reviewIndex = source.indexOf("Review Selected Jobs");
  const importCompleteIndex = source.indexOf("Import complete");
  const connectedIndex = source.indexOf("Connected Job Sources");
  assert.ok(jobsFoundIndex > connectIndex && jobsFoundIndex < connectedIndex);
  assert.ok(reviewIndex > jobsFoundIndex && reviewIndex < connectedIndex);
  assert.ok(importCompleteIndex > reviewIndex && importCompleteIndex < connectedIndex);
});

test("connection form keeps existing request flow while updating ATS-specific copy", () => {
  assert.match(source, /onSubmit=\{findJobs\}/);
  assert.match(source, /Careers Page URL/);
  assert.match(source, /Find My Jobs/);
  assert.match(source, /isFindingJobs \? "Finding Jobs\.\.\." : "Find My Jobs"/);
  assert.match(source, /Paste the URL of your public ATS careers page\./);
  assert.match(source, /https:\/\/boards\.greenhouse\.io\/company or https:\/\/company\.wd1\.myworkdayjobs\.com\/\.\.\./);
  assert.match(source, /fetch\("\/api\/employer\/ats\/preview"/);
});

test("connected sources, sync history, and imported jobs functionality remains present", () => {
  for (const text of ["Sync Now", "Disable Sync", "Enable Sync", "Disconnect", "Change Careers Page URL", "Update URL", "Connected Job Sources", "Sync History", "Imported Jobs"]) {
    assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const heading of ["Date", "Status", "Duration", "Jobs Updated", "Jobs Closed", "Jobs Reopened", "Needs Review", "Failed", "Warning"]) {
    assert.match(source, new RegExp(`"${heading}"`));
  }
});


test("coming soon ATS providers are visually separate from supported providers", () => {
  const availableTodayStart = source.indexOf('aria-label="ATS platforms available today"');
  const availableTodayEnd = source.indexOf("More Integrations Coming Soon", availableTodayStart);
  const comingSoonStart = source.indexOf('aria-label="ATS integrations coming soon"');
  assert.ok(comingSoonStart > availableTodayEnd);
  const comingSoonBlock = source.slice(comingSoonStart, source.indexOf("Don’t see your ATS?", comingSoonStart));
  for (const provider of ["Lever", "iCIMS", "Taleo", "SmartRecruiters", "JazzHR", "Ashby"]) {
    assert.match(comingSoonBlock, new RegExp(provider));
  }
  assert.doesNotMatch(comingSoonBlock, /Supported/);
});

test("connected source hierarchy keeps statuses near the top and required metric cards", () => {
  const cardStart = source.indexOf("<article key={connection.id}");
  const cardEnd = source.indexOf("{syncResult ?", cardStart);
  const card = source.slice(cardStart, cardEnd);
  assert.ok(card.indexOf("getStatusLabel(connection)") < card.indexOf("Connected Job Source"));
  assert.match(card, /Careers URL:/);
  for (const metric of ["Imported Jobs", "Last Successful Sync", "Last Failed Sync", "Consecutive Failures"]) {
    assert.match(card, new RegExp(metric));
  }
});

test("retrieval and loading messages use accessible status and alert containers", () => {
  assert.match(source, /id="ats-import-note"/);
  assert.match(source, /role=\{resultMessage \? "status" : undefined\}/);
  assert.match(source, /connectionsMessage \? <div role="alert"/);
  assert.match(source, /syncHistoryMessage \? <div role="alert"/);
});

test("imported jobs empty state explains how to start synchronization", () => {
  assert.match(source, /No jobs imported yet\./);
  assert.match(source, /Import jobs from Greenhouse or Workday above to begin automatic synchronization\./);
});

test("responsive ATS support layout uses existing classes and no new dependencies", () => {
  assert.match(source, /rn-ats-connect-grid/);
  assert.match(source, /gridTemplateColumns: "minmax\(0, 1\.7fr\) minmax\(280px, 1fr\)"/);
  assert.match(source, /@media \(max-width: 900px\)/);
  assert.match(source, /homeCardStyle|homeInputStyle|homePrimaryButton|homeSecondaryButton|homeTheme/);
  assert.doesNotMatch(source, /from ["'](?:lucide-react|react-icons|@heroicons\/react|@fortawesome\/)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "atsSyncFailureNotifications.ts");
function loadModule() {
  const source = readFileSync(modulePath, "utf8").replace('import "server-only";\n\n', "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const mod = { exports: {} };
  const require = (name) => {
    if (name === "../../supabaseAdmin") return { getSupabaseAdminClient: () => null };
    if (name === "../../emailTemplates") return { buildBrandedEmailHtml: ({ title, intro, bodyHtml = "" }) => `${title}\n${intro}\n${bodyHtml}`, buildBrandedEmailText: ({ title, intro, contextRows = [] }) => `${title}\n${intro}\n${contextRows.map((r) => `${r.label}: ${r.value}`).join("\n")}` };
    if (name === "./runEmployerAtsSync") return {};
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(mod.exports, require, mod);
  return mod.exports;
}
const { handleAtsSyncFailureNotification } = loadModule();

function setup({ count = 3, sentAt = null, owners, mailOk = true, mailThrows = false, markError = false } = {}) {
  const calls = { owners: [], mails: [], marks: [], clears: [], loads: [] };
  const connection = { id: "conn-1", employer_account_id: "acct-1", consecutive_failure_count: count, failure_notification_sent_at: sentAt };
  const database = {
    async getConnection(id) { calls.loads.push(id); return { data: connection, error: null }; },
    async listAccountOwners(accountId) { calls.owners.push(accountId); return { data: owners ?? [{ email: "Owner@Example.com", role: "account_owner" }, { email: "hm@example.com", role: "hiring_manager" }, { email: "viewer@example.com", role: "viewer" }], error: null }; },
    async markNotificationSent(id, value) { calls.marks.push({ id, value }); return { data: markError ? null : { id }, error: markError ? { message: "raw" } : null }; },
    async clearNotificationSent(id, value) { calls.clears.push({ id, value }); return { data: { id }, error: null }; },
  };
  const mailer = async (input) => { if (mailThrows) throw new Error("smtp url stack secret"); calls.mails.push(input); return { ok: mailOk }; };
  const now = () => new Date("2026-08-04T12:00:00.000Z");
  return { calls, dependencies: { database, mailer, now } };
}

const failure = { status: "retrieval-failed", message: "safe", consecutiveFailureCount: 3 };
const success = { status: "completed", sync: { status: "completed" }, connection: { status: "active", consecutiveFailureCount: 0, lastSuccessfulSyncAt: "2026-08-04T12:00:00.000Z" } };

test("exactly 3 failures sends one owner email and marks notification sent", async () => {
  const context = setup();
  const result = await handleAtsSyncFailureNotification("conn-1", failure, context.dependencies);
  assert.deepEqual(result, { status: "sent" });
  assert.deepEqual(context.calls.mails[0].to, ["owner@example.com"]);
  assert.equal(context.calls.mails[0].subject, "We're having trouble syncing your jobs");
  assert.doesNotMatch(`${context.calls.mails[0].text}\n${context.calls.mails[0].html}`, /failure_code|retrieval|stack|https?:\/\//i);
  assert.deepEqual(context.calls.marks, [{ id: "conn-1", value: "2026-08-04T12:00:00.000Z" }]);
});

test("4th failure sends nothing when notification was already sent", async () => {
  const context = setup({ count: 4, sentAt: "2026-08-04T11:00:00.000Z" });
  assert.deepEqual(await handleAtsSyncFailureNotification("conn-1", { ...failure, consecutiveFailureCount: 4 }, context.dependencies), { status: "skipped" });
  assert.equal(context.calls.mails.length, 0);
  assert.equal(context.calls.marks.length, 0);
});

test("success resets notification state", async () => {
  const context = setup({ sentAt: "2026-08-04T11:00:00.000Z" });
  assert.deepEqual(await handleAtsSyncFailureNotification("conn-1", success, context.dependencies), { status: "reset" });
  assert.deepEqual(context.calls.clears, [{ id: "conn-1", value: "2026-08-04T12:00:00.000Z" }]);
  assert.equal(context.calls.mails.length, 0);
});

test("later failure streak sends again after reset", async () => {
  const context = setup({ count: 3, sentAt: null });
  assert.deepEqual(await handleAtsSyncFailureNotification("conn-1", failure, context.dependencies), { status: "sent" });
  assert.equal(context.calls.mails.length, 1);
});

test("only account owners receive email with de-duplicated valid addresses", async () => {
  const context = setup({ owners: [{ email: "Owner@Example.com", role: "account_owner" }, { email: "owner@example.com", role: "account_owner" }, { email: "bad", role: "account_owner" }, { email: "hm@example.com", role: "hiring_manager" }, { email: "viewer@example.com", role: "viewer" }] });
  await handleAtsSyncFailureNotification("conn-1", failure, context.dependencies);
  assert.deepEqual(context.calls.mails[0].to, ["owner@example.com"]);
});

test("safe email failure handling does not mark notification sent", async () => {
  const context = setup({ mailOk: false });
  assert.deepEqual(await handleAtsSyncFailureNotification("conn-1", failure, context.dependencies), { status: "failed", reason: "email_failed" });
  assert.equal(context.calls.marks.length, 0);
});

test("thrown email failure is caught safely and leaves sent_at unset", async () => {
  const context = setup({ mailThrows: true });
  assert.deepEqual(await handleAtsSyncFailureNotification("conn-1", failure, context.dependencies), { status: "failed", reason: "unexpected_failure" });
  assert.equal(context.calls.marks.length, 0);
});

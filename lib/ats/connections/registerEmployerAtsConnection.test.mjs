import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const servicePath = resolve(dirname(fileURLToPath(import.meta.url)), "registerEmployerAtsConnection.ts");

function loadService() {
  const source = readFileSync(servicePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const testModule = { exports: {} };
  const require = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier.endsWith("supabaseAdmin")) return { getSupabaseAdminClient: () => null };
    if (specifier.endsWith("providers/registry")) return { getAtsProvider: () => undefined };
    if (specifier.endsWith("ats/types")) return {};
    throw new Error(`Unexpected test require: ${specifier}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}

const { normalizeAtsSourceUrl, registerEmployerAtsConnection } = loadService();
const validInput = { employerAccountId: "account-1", connectedByUserId: "user-1", inputUrl: " https://example.com/careers ", providerKey: "greenhouse", sourceUrl: "https://boards.greenhouse.io/acme" };

function memoryDatabase({ accountExists = true, accountError = null, connectionError = null, rows = [] } = {}) {
  const state = { rows: rows.map((row) => ({ ...row })), upserts: [] };
  const database = {
    from(table) {
      if (table === "employer_accounts") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: accountExists ? { id: "account-1" } : null, error: accountError }) }) }) };
      assert.equal(table, "employer_ats_connections");
      return {
        upsert(payload, options) {
          state.upserts.push({ payload, options });
          const key = (row) => row.employer_account_id === payload.employer_account_id && row.provider_key === payload.provider_key && row.source_url_key === payload.source_url_key;
          let row = state.rows.find(key);
          if (row) Object.assign(row, payload);
          else { row = { id: `connection-${state.rows.length + 1}`, connected_at: "original-connected", created_at: "original-created", ...payload }; state.rows.push(row); }
          return { select: () => ({ single: async () => connectionError ? ({ data: null, error: connectionError }) : ({ data: { id: row.id }, error: null }) }) };
        },
      };
    },
  };
  return { database, state };
}

function deps(database, provider = true) {
  return { getSupabaseAdminClient: () => database, getAtsProvider: (key) => provider && key === "greenhouse" ? { key } : undefined };
}

test("first registration performs an exact-identity upsert and returns connected", async () => {
  const { database, state } = memoryDatabase();
  assert.deepEqual(await registerEmployerAtsConnection(validInput, deps(database)), { status: "connected", connectionId: "connection-1" });
  assert.equal(state.rows.length, 1);
  assert.equal(state.upserts[0].options.onConflict, "employer_account_id,provider_key,source_url_key");
});

test("existing matching connection is refreshed and reactivated without overwriting historical fields", async () => {
  const existing = { id: "existing", employer_account_id: "account-1", provider_key: "greenhouse", source_url_key: "https://boards.greenhouse.io/acme", enabled: false, connection_status: "disconnected", disconnected_at: "yesterday", connected_at: "connected-before", created_at: "created-before", last_sync_started_at: "started-before", last_successful_sync_at: "success-before", last_failed_sync_at: "failed-before" };
  const { database, state } = memoryDatabase({ rows: [existing] });
  await registerEmployerAtsConnection(validInput, deps(database));
  assert.deepEqual(state.rows[0], { ...existing, input_url: "https://example.com/careers", source_url: validInput.sourceUrl, enabled: true, connection_status: "active", connected_by_user_id: "user-1", disconnected_at: null, consecutive_failure_count: 0, last_failure_code: null });
  for (const field of ["connected_at", "created_at", "last_sync_started_at", "last_successful_sync_at", "last_failed_sync_at"]) assert.equal(field in state.upserts[0].payload, false);
});

test("provider is trimmed/lowercased before lookup and persistence", async () => {
  const { database, state } = memoryDatabase(); let lookup;
  await registerEmployerAtsConnection({ ...validInput, providerKey: " GreenHouse " }, { getSupabaseAdminClient: () => database, getAtsProvider: (key) => { lookup = key; return { key }; } });
  assert.equal(lookup, "greenhouse"); assert.equal(state.rows[0].provider_key, "greenhouse");
});

test("unregistered, empty, and overlong providers fail safely before persistence", async () => {
  for (const providerKey of ["unknown", " ", "x".repeat(129)]) {
    const { database, state } = memoryDatabase();
    const result = await registerEmployerAtsConnection({ ...validInput, providerKey }, deps(database, false));
    assert.deepEqual(result, { status: "failed", message: "The ATS connection could not be enabled." }); assert.equal(state.upserts.length, 0);
  }
});

test("invalid input and source URLs fail safely", async () => {
  for (const patch of [{ inputUrl: "not a URL" }, { sourceUrl: "file:///tmp/jobs" }, { sourceUrl: "https://user:secret@example.com/jobs" }, { inputUrl: "https://user:secret@example.com/jobs" }]) {
    const { database, state } = memoryDatabase();
    const result = await registerEmployerAtsConnection({ ...validInput, ...patch }, deps(database));
    assert.equal(result.status, "failed"); assert.equal(state.upserts.length, 0);
  }
});

test("source key removes fragments, normalizes scheme/hostname/trailing dot, and preserves path/query", () => {
  assert.equal(normalizeAtsSourceUrl(" HTTPS://Job-Boards.Greenhouse.io./Acme/Job?department=FOH&sort=new#jobs "), "https://job-boards.greenhouse.io/Acme/Job?department=FOH&sort=new");
});

test("missing account and database errors are sanitized and prevent a successful result", async () => {
  for (const options of [{ accountExists: false }, { accountError: { message: "raw account secret" } }, { connectionError: { message: "raw database secret" } }]) {
    const { database } = memoryDatabase(options);
    const result = await registerEmployerAtsConnection(validInput, deps(database));
    assert.deepEqual(result, { status: "failed", message: "The ATS connection could not be enabled." });
    assert.doesNotMatch(JSON.stringify(result), /raw|database secret|account secret/i);
  }
  const thrown = await registerEmployerAtsConnection(validInput, { getSupabaseAdminClient: () => { throw new Error("raw thrown secret"); }, getAtsProvider: () => ({ key: "greenhouse" }) });
  assert.deepEqual(thrown, { status: "failed", message: "The ATS connection could not be enabled." });
});

test("multiple source URLs remain distinct while equivalent normalized sources share one identity", async () => {
  const { database, state } = memoryDatabase();
  await registerEmployerAtsConnection({ ...validInput, sourceUrl: "HTTPS://BOARDS.GREENHOUSE.IO/acme#jobs" }, deps(database));
  await registerEmployerAtsConnection({ ...validInput, sourceUrl: "https://boards.greenhouse.io/acme#other" }, deps(database));
  await registerEmployerAtsConnection({ ...validInput, sourceUrl: "https://boards.greenhouse.io/other?team=FOH" }, deps(database));
  assert.equal(state.rows.length, 2);
  assert.deepEqual(state.rows.map((row) => row.source_url_key), ["https://boards.greenhouse.io/acme", "https://boards.greenhouse.io/other?team=FOH"]);
});

test("write payload contains only registration/reactivation fields and required failure resets", async () => {
  const { database, state } = memoryDatabase();
  await registerEmployerAtsConnection(validInput, deps(database));
  assert.deepEqual(Object.keys(state.upserts[0].payload).sort(), ["connected_by_user_id", "connection_status", "consecutive_failure_count", "disconnected_at", "employer_account_id", "enabled", "input_url", "last_failure_code", "provider_key", "source_url", "source_url_key"].sort());
  assert.equal(state.upserts[0].payload.consecutive_failure_count, 0);
});

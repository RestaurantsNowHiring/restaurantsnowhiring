import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = resolve(dirname(fileURLToPath(import.meta.url)), "manageEmployerAtsConnection.ts");
function loadModule() {
  const source = readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const testModule = { exports: {} };
  const require = (name) => {
    if (name === "server-only") return {};
    if (name.endsWith("../../supabaseAdmin")) return { getSupabaseAdminClient: () => null };
    if (name.endsWith("../import/previewJobImport")) return { previewJobImport: async () => ({ status: "unsupported", message: "unused" }) };
    if (name.endsWith("./registerEmployerAtsConnection")) return { normalizeAtsSourceUrl: (v) => { const u = new URL(v.trim()); u.protocol = u.protocol.toLowerCase(); u.hostname = u.hostname.toLowerCase().replace(/\.$/, ""); u.hash = ""; return u.toString(); } };
    throw new Error(`Unexpected require ${name}`);
  };
  new Function("exports", "require", "module", outputText)(testModule.exports, require, testModule);
  return testModule.exports;
}
const { updateEmployerAtsConnectionState, updateEmployerAtsConnectionSource } = loadModule();
function db(found = true, error = null) { const calls = []; return { calls, database: { updateOwnedConnection: async (connectionId, employerAccountId, payload) => { calls.push({ connectionId, employerAccountId, payload }); return { data: found ? { id: connectionId } : null, error }; } } }; }

test("disable only flips enabled off", async () => {
  const ctx = db();
  assert.deepEqual(await updateEmployerAtsConnectionState({ connectionId: "c1", employerAccountId: "a1", action: "disable" }, { database: ctx.database }), { status: "updated" });
  assert.deepEqual(ctx.calls[0].payload, { enabled: false });
});

test("enable only flips enabled on", async () => {
  const ctx = db();
  await updateEmployerAtsConnectionState({ connectionId: "c1", employerAccountId: "a1", action: "enable" }, { database: ctx.database });
  assert.deepEqual(ctx.calls[0].payload, { enabled: true });
});

test("disconnect preserves history while setting disconnected state", async () => {
  const ctx = db();
  await updateEmployerAtsConnectionState({ connectionId: "c1", employerAccountId: "a1", action: "disconnect" }, { database: ctx.database, now: () => new Date("2026-08-04T12:00:00Z") });
  assert.deepEqual(ctx.calls[0].payload, { enabled: false, connection_status: "disconnected", disconnected_at: "2026-08-04T12:00:00.000Z" });
});

test("actions are ownership scoped and return not-found safely", async () => {
  const ctx = db(false);
  const result = await updateEmployerAtsConnectionState({ connectionId: "other", employerAccountId: "a1", action: "enable" }, { database: ctx.database });
  assert.deepEqual(ctx.calls[0], { connectionId: "other", employerAccountId: "a1", payload: { enabled: true } });
  assert.deepEqual(result, { status: "not-found" });
});

test("database failures return safe failure", async () => {
  assert.deepEqual(await updateEmployerAtsConnectionState({ connectionId: "c1", employerAccountId: "a1", action: "enable" }, { database: null }), { status: "failed", message: "The ATS connection could not be updated." });
  const ctx = db(true, { message: "secret" });
  assert.deepEqual(await updateEmployerAtsConnectionState({ connectionId: "c1", employerAccountId: "a1", action: "enable" }, { database: ctx.database }), { status: "failed", message: "The ATS connection could not be updated." });
});

test("URL update validates through discovery, ignores browser provider, and reconnects", async () => {
  const ctx = db();
  const result = await updateEmployerAtsConnectionSource({ connectionId: "c1", employerAccountId: "a1", careersPageUrl: " https://brand.example/careers " }, { database: ctx.database, previewJobImport: async (url) => {
    assert.equal(url, "https://brand.example/careers");
    return { status: "ready", providerKey: "greenhouse", sourceUrl: "https://Boards.Greenhouse.io/Brand#jobs", jobs: [] };
  } });
  assert.deepEqual(result, { status: "updated" });
  assert.deepEqual(ctx.calls[0].payload, { input_url: "https://brand.example/careers", source_url: "https://Boards.Greenhouse.io/Brand#jobs", source_url_key: "https://boards.greenhouse.io/Brand", enabled: true, connection_status: "active", disconnected_at: null });
});

test("URL update rejects unsupported and retrieval failures without database mutation", async () => {
  for (const preview of [{ status: "unsupported", message: "no" }, { status: "retrieval-failed", message: "no", providerKey: "greenhouse", sourceUrl: "https://x" }]) {
    const ctx = db();
    const result = await updateEmployerAtsConnectionSource({ connectionId: "c1", employerAccountId: "a1", careersPageUrl: "https://x" }, { database: ctx.database, previewJobImport: async () => preview });
    assert.deepEqual(result, { status: "validation-failed", message: "Enter a valid supported careers page URL." });
    assert.equal(ctx.calls.length, 0);
  }
});

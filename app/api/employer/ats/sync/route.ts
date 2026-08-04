import { NextResponse } from "next/server";
import { runEmployerAtsSync } from "../../../../../lib/ats/sync/runEmployerAtsSync";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

const MAX_BODY_BYTES = 64 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SyncPayload = { connectionId?: unknown };
type OwnershipDatabase = { connectionBelongsToEmployer(connectionId: string, employerAccountId: string): Promise<{ found: boolean; error?: boolean }> };
type SyncRouteDependencies = {
  getAuthUserFromRequest: typeof getAuthUserFromRequest;
  getEmployerAccountContext: typeof getEmployerAccountContext;
  getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest;
  assertEmployerPermission: typeof assertEmployerPermission;
  runEmployerAtsSync: typeof runEmployerAtsSync;
  database?: OwnershipDatabase | null;
};

function defaultDatabase(): OwnershipDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async connectionBelongsToEmployer(connectionId, employerAccountId) {
      try {
        const { data, error } = await client.from("employer_ats_connections").select("id").eq("id", connectionId).eq("employer_account_id", employerAccountId).maybeSingle();
        if (error) return { found: false, error: true };
        return { found: Boolean(data) };
      } catch {
        return { found: false, error: true };
      }
    },
  };
}

const defaultDependencies: SyncRouteDependencies = { getAuthUserFromRequest, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest, assertEmployerPermission, runEmployerAtsSync };

function permissionStatus(error: unknown) {
  return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (!Number.isFinite(parsedLength) || parsedLength > MAX_BODY_BYTES) return { error: "Request body is too large." as const };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: "Request body must be valid JSON." as const };
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) return { error: "Request body is too large." as const };
    chunks.push(value);
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)) };
}

async function readPayload(request: Request): Promise<{ connectionId: string } | { error: string }> {
  const body = await readBoundedBody(request);
  if ("error" in body && body.error) return { error: body.error };
  let payload: SyncPayload | null = null;
  try { payload = JSON.parse(body.text) as SyncPayload; } catch { return { error: "Request body must be valid JSON." as const }; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Request body must be valid JSON." as const };
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== "connectionId") return { error: "Request body must only include connectionId." as const };
  const connectionId = typeof payload.connectionId === "string" ? payload.connectionId.trim() : "";
  if (!connectionId) return { error: "connectionId is required." as const };
  if (!UUID_PATTERN.test(connectionId)) return { error: "connectionId must be a valid UUID." as const };
  return { connectionId };
}

export async function handleEmployerAtsSyncPost(request: Request, dependencies: SyncRouteDependencies = defaultDependencies) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const context = await dependencies.getEmployerAccountContext(user, dependencies.getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(context, "canManageJobs");
    const payload = await readPayload(request);
    if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 400 });
    const database = dependencies.database === undefined ? defaultDatabase() : dependencies.database;
    if (!database) return NextResponse.json({ error: "Could not synchronize ATS connection." }, { status: 500 });
    const ownership = await database.connectionBelongsToEmployer(payload.connectionId, context.accountId);
    if (ownership.error) return NextResponse.json({ error: "Could not synchronize ATS connection." }, { status: 500 });
    if (!ownership.found) return NextResponse.json({ error: "ATS connection not found." }, { status: 404 });
    const result = await dependencies.runEmployerAtsSync({ connectionId: payload.connectionId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Employer ATS sync failed", { error });
    return NextResponse.json({ error: "Could not synchronize ATS connection." }, { status: permissionStatus(error) });
  }
}

export async function POST(request: Request) { return handleEmployerAtsSyncPost(request); }

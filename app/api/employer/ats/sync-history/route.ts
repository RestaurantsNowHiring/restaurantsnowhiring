import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

type SyncHistoryRow = { id: string; connection_id: string; started_at: string; completed_at: string | null; status: string; completed: number | null; updated: number | null; closed: number | null; reopened: number | null; new_available: number | null; needs_review: number | null; failed: number | null; warning_message: string | null };
type SyncHistoryDatabase = {
  connectionBelongsToAccount(connectionId: string, employerAccountId: string): Promise<{ data: { id: string } | null; error: unknown | null }>;
  listHistory(connectionId: string, from: number, to: number): Promise<{ data: SyncHistoryRow[] | null; error: unknown | null; count: number | null }>;
};
type SyncHistoryDependencies = { getAuthUserFromRequest: typeof getAuthUserFromRequest; getEmployerAccountContext: typeof getEmployerAccountContext; getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest; assertEmployerPermission: typeof assertEmployerPermission; database?: SyncHistoryDatabase | null };
const defaultDependencies: SyncHistoryDependencies = { getAuthUserFromRequest, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest, assertEmployerPermission };

function defaultDatabase(): SyncHistoryDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async connectionBelongsToAccount(connectionId, employerAccountId) {
      return await client.from("employer_ats_connections").select("id").eq("id", connectionId).eq("employer_account_id", employerAccountId).maybeSingle() as { data: { id: string } | null; error: unknown | null };
    },
    async listHistory(connectionId, from, to) {
      return await client.from("employer_ats_sync_history").select("id,connection_id,started_at,completed_at,status,completed,updated,closed,reopened,new_available,needs_review,failed,warning_message", { count: "exact" }).eq("connection_id", connectionId).order("started_at", { ascending: false }).range(from, to) as { data: SyncHistoryRow[] | null; error: unknown | null; count: number | null };
    },
  };
}
function permissionStatus(error: unknown) { return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500; }
function parsePositiveInt(value: string | null, fallback: number) { const parsed = Number.parseInt(value ?? "", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function toHistoryResponse(row: SyncHistoryRow) {
  return { id: row.id, connectionId: row.connection_id, startedAt: row.started_at, completedAt: row.completed_at, status: row.status, completed: Math.max(0, row.completed ?? 0), updated: Math.max(0, row.updated ?? 0), closed: Math.max(0, row.closed ?? 0), reopened: Math.max(0, row.reopened ?? 0), newAvailable: Math.max(0, row.new_available ?? 0), needsReview: Math.max(0, row.needs_review ?? 0), failed: Math.max(0, row.failed ?? 0), warningMessage: row.warning_message ?? null };
}
export async function handleEmployerAtsSyncHistoryGet(request: Request, dependencies: SyncHistoryDependencies = defaultDependencies) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const context = await dependencies.getEmployerAccountContext(user, dependencies.getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(context, "canManageJobs");
    const url = new URL(request.url);
    const connectionId = (url.searchParams.get("connectionId") ?? "").trim();
    if (!connectionId) return NextResponse.json({ error: "Connection ID is required." }, { status: 400 });
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(100, parsePositiveInt(url.searchParams.get("pageSize"), 10));
    const database = dependencies.database === undefined ? defaultDatabase() : dependencies.database;
    if (!database) return NextResponse.json({ error: "Could not load sync history." }, { status: 500 });
    const connection = await database.connectionBelongsToAccount(connectionId, context.accountId);
    if (connection.error) return NextResponse.json({ error: "Could not load sync history." }, { status: 500 });
    if (!connection.data) return NextResponse.json({ error: "ATS connection not found." }, { status: 404 });
    const from = (page - 1) * pageSize;
    const history = await database.listHistory(connectionId, from, from + pageSize - 1);
    if (history.error || !Array.isArray(history.data)) return NextResponse.json({ error: "Could not load sync history." }, { status: 500 });
    return NextResponse.json({ history: history.data.map(toHistoryResponse), page, pageSize, total: Math.max(0, history.count ?? history.data.length) }, { status: 200 });
  } catch (error) {
    console.error("Employer ATS sync history load failed", { error });
    return NextResponse.json({ error: "Could not load sync history." }, { status: permissionStatus(error) });
  }
}
export async function GET(request: Request) { return handleEmployerAtsSyncHistoryGet(request); }

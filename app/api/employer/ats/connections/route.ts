import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

type ConnectionRow = { id: string; provider_key: string; input_url: string; enabled: boolean; connection_status: string; connected_at: string | null; last_sync_started_at: string | null; last_successful_sync_at: string | null; last_failed_sync_at: string | null; consecutive_failure_count: number | null };
type ConnectionsDatabase = { listConnections(employerAccountId: string): Promise<{ data: ConnectionRow[] | null; error: unknown | null }>; countImportedJobs(employerAccountId: string, providerKey: string): Promise<{ count: number | null; error: unknown | null }> };
type ConnectionsRouteDependencies = { getAuthUserFromRequest: typeof getAuthUserFromRequest; getEmployerAccountContext: typeof getEmployerAccountContext; getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest; assertEmployerPermission: typeof assertEmployerPermission; database?: ConnectionsDatabase | null };
const defaultDependencies: ConnectionsRouteDependencies = { getAuthUserFromRequest, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest, assertEmployerPermission };

function defaultDatabase(): ConnectionsDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async listConnections(employerAccountId) {
      return await client.from("employer_ats_connections").select("id,provider_key,input_url,enabled,connection_status,connected_at,last_sync_started_at,last_successful_sync_at,last_failed_sync_at,consecutive_failure_count").eq("employer_account_id", employerAccountId).order("connected_at", { ascending: false }) as { data: ConnectionRow[] | null; error: unknown | null };
    },
    async countImportedJobs(employerAccountId, providerKey) {
      const { count, error } = await client.from("jobs").select("id", { count: "exact", head: true }).eq("employer_account_id", employerAccountId).eq("source_type", "ats").eq("ats_provider", providerKey);
      return { count, error };
    },
  };
}
function permissionStatus(error: unknown) { return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500; }
function normalizeProviderKey(value: string) { return value.trim().toLowerCase(); }
function toConnectionResponse(row: ConnectionRow, importedJobCount: number) {
  return { id: row.id, sourceLabel: "Connected job source", inputUrl: row.input_url, enabled: Boolean(row.enabled), connectionStatus: row.connection_status, connectedAt: row.connected_at ?? null, lastSyncStartedAt: row.last_sync_started_at ?? null, lastSuccessfulSyncAt: row.last_successful_sync_at ?? null, lastFailedSyncAt: row.last_failed_sync_at ?? null, consecutiveFailureCount: Math.max(0, row.consecutive_failure_count ?? 0), importedJobCount };
}
export async function handleEmployerAtsConnectionsGet(request: Request, dependencies: ConnectionsRouteDependencies = defaultDependencies) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const context = await dependencies.getEmployerAccountContext(user, dependencies.getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(context, "canManageJobs");
    const database = dependencies.database === undefined ? defaultDatabase() : dependencies.database;
    if (!database) return NextResponse.json({ error: "Could not load ATS connections." }, { status: 500 });
    const connectionsResult = await database.listConnections(context.accountId);
    if (connectionsResult.error || !Array.isArray(connectionsResult.data)) return NextResponse.json({ error: "Could not load ATS connections." }, { status: 500 });
    const countsByProvider = new Map<string, number>();
    const providerKeys = Array.from(new Set(connectionsResult.data.map((row) => normalizeProviderKey(row.provider_key)).filter(Boolean)));
    for (const providerKey of providerKeys) {
      const countResult = await database.countImportedJobs(context.accountId, providerKey);
      if (countResult.error || countResult.count === null) return NextResponse.json({ error: "Could not load ATS connections." }, { status: 500 });
      countsByProvider.set(providerKey, Math.max(0, countResult.count));
    }
    return NextResponse.json({ connections: connectionsResult.data.map((row) => toConnectionResponse(row, countsByProvider.get(normalizeProviderKey(row.provider_key)) ?? 0)) }, { status: 200 });
  } catch (error) {
    console.error("Employer ATS connections load failed", { error });
    return NextResponse.json({ error: "Could not load ATS connections." }, { status: permissionStatus(error) });
  }
}
export async function GET(request: Request) { return handleEmployerAtsConnectionsGet(request); }

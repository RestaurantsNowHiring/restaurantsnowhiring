import "server-only";

import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { syncEmployerAtsConnection, type SyncEmployerAtsConnectionResult } from "./syncEmployerAtsConnection";

/** A started run is considered abandoned after this interval. */
export const ATS_SYNC_STALE_AFTER_MS = 30 * 60 * 1000;

export type RunEmployerAtsSyncInput = { connectionId: string };
type CompletedSync = Extract<SyncEmployerAtsConnectionResult, { status: "completed" }>;
type EngineResult = SyncEmployerAtsConnectionResult | { status: "disconnected"; message: string };
type Connection = { id: string; enabled: boolean; connection_status: string; consecutive_failure_count: number; last_sync_started_at: string | null; last_successful_sync_at: string | null; last_failed_sync_at: string | null };
type DbResult<T> = { data: T | null; error: unknown | null };

export type RunEmployerAtsSyncDatabase = {
  getConnection(connectionId: string): Promise<DbResult<Connection>>;
  markStarted(connectionId: string, previousStartedAt: string | null, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
  updateConnection(connectionId: string, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
  createHistory?(payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
  updateHistory?(historyId: string, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
};
export type RunEmployerAtsSyncDependencies = { database?: RunEmployerAtsSyncDatabase | null; now?: () => Date; sync?: (input: { connectionId: string }) => Promise<EngineResult> };
export type RunEmployerAtsSyncResult =
  | { status: "completed"; sync: CompletedSync; connection: { status: "active"; consecutiveFailureCount: 0; lastSuccessfulSyncAt: string } }
  | { status: "completed-with-warning"; sync: CompletedSync; message: string }
  | { status: "connection-unavailable" | "disabled" | "disconnected" | "already-running" | "unsupported-provider" | "retrieval-failed" | "database-failed"; message: string; consecutiveFailureCount?: number };

const messages = {
  "connection-unavailable": "The ATS connection is unavailable.", disabled: "The ATS connection is disabled.", disconnected: "The ATS connection is disconnected.",
  "already-running": "The ATS connection is already being synchronized.", "unsupported-provider": "The ATS provider is no longer supported.",
  "retrieval-failed": "The ATS jobs could not be retrieved. No jobs were changed.", "database-failed": "The synchronization service is temporarily unavailable.",
} as const;

function defaultDatabase(): RunEmployerAtsSyncDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async getConnection(connectionId) { return await client.from("employer_ats_connections").select("id,enabled,connection_status,consecutive_failure_count,last_sync_started_at,last_successful_sync_at,last_failed_sync_at").eq("id", connectionId).maybeSingle() as DbResult<Connection>; },
    async markStarted(connectionId, previousStartedAt, payload) {
      let query = client.from("employer_ats_connections").update(payload).eq("id", connectionId);
      query = previousStartedAt === null ? query.is("last_sync_started_at", null) : query.eq("last_sync_started_at", previousStartedAt);
      return await query.select("id").maybeSingle() as DbResult<{ id: string }>;
    },
    async updateConnection(connectionId, payload) { return await client.from("employer_ats_connections").update(payload).eq("id", connectionId).select("id").single() as DbResult<{ id: string }>; },
    async createHistory(payload) { return await client.from("employer_ats_sync_history").insert(payload).select("id").single() as DbResult<{ id: string }>; },
    async updateHistory(historyId, payload) { return await client.from("employer_ats_sync_history").update(payload).eq("id", historyId).select("id").single() as DbResult<{ id: string }>; },
  };
}

function safeHistoryMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}
function syncSummary(sync: EngineResult | { status: "unexpected-failure" }) {
  const summary = sync.status === "completed" ? sync.summary : null;
  return {
    completed: sync.status === "completed" ? 1 : 0,
    updated: Math.max(0, summary?.updated ?? 0),
    closed: Math.max(0, summary?.closed ?? 0),
    reopened: Math.max(0, summary?.reopened ?? 0),
    new_available: Math.max(0, summary?.newAvailable ?? 0),
    needs_review: Math.max(0, summary?.needsReview ?? 0),
    failed: Math.max(0, summary?.failed ?? 0),
  };
}
async function finishHistory(database: RunEmployerAtsSyncDatabase, historyId: string | null, payload: Record<string, unknown>) {
  if (!historyId || !database.updateHistory) return;
  try { await database.updateHistory(historyId, payload); } catch {}
}

function hasRecentUnfinishedRun(connection: Connection, now: Date): boolean {
  if (!connection.last_sync_started_at) return false;
  const started = new Date(connection.last_sync_started_at).getTime();
  if (!Number.isFinite(started) || now.getTime() - started >= ATS_SYNC_STALE_AFTER_MS) return false;
  const success = connection.last_successful_sync_at ? new Date(connection.last_successful_sync_at).getTime() : -Infinity;
  const failure = connection.last_failed_sync_at ? new Date(connection.last_failed_sync_at).getTime() : -Infinity;
  return started > success && started > failure;
}

/** Runs the existing engine exactly once and records only bounded connection-level state. */
export async function runEmployerAtsSync(input: RunEmployerAtsSyncInput, dependencies?: RunEmployerAtsSyncDependencies): Promise<RunEmployerAtsSyncResult> {
  const database = dependencies?.database === undefined ? defaultDatabase() : dependencies.database;
  const now = dependencies?.now ?? (() => new Date());
  const connectionId = typeof input?.connectionId === "string" ? input.connectionId.trim() : "";
  if (!database || !connectionId) return { status: "connection-unavailable", message: messages["connection-unavailable"] };
  let loaded: DbResult<Connection>;
  try { loaded = await database.getConnection(connectionId); } catch { return { status: "database-failed", message: messages["database-failed"] }; }
  if (loaded.error) return { status: "database-failed", message: messages["database-failed"] };
  const connection = loaded.data;
  if (!connection) return { status: "connection-unavailable", message: messages["connection-unavailable"] };
  if (!connection.enabled) return { status: "disabled", message: messages.disabled };
  if (connection.connection_status === "disconnected") return { status: "disconnected", message: messages.disconnected };

  const startedDate = now();
  if (hasRecentUnfinishedRun(connection, startedDate)) return { status: "already-running", message: messages["already-running"] };
  const startedAt = startedDate.toISOString();
  let started: DbResult<{ id: string }>;
  try { started = await database.markStarted(connection.id, connection.last_sync_started_at, { last_sync_started_at: startedAt, updated_at: startedAt }); }
  catch { return { status: "database-failed", message: messages["database-failed"] }; }
  if (started.error) return { status: "database-failed", message: messages["database-failed"] };
  if (!started.data) return { status: "already-running", message: messages["already-running"] };

  let historyId: string | null = null;
  if (database.createHistory) {
    try {
      const history = await database.createHistory({ connection_id: connection.id, started_at: startedAt, status: "running" });
      if (!history.error && history.data?.id) historyId = history.data.id;
    } catch {}
  }

  let sync: EngineResult | { status: "unexpected-failure" };
  try { sync = await (dependencies?.sync ?? syncEmployerAtsConnection)({ connectionId: connection.id }); } catch { sync = { status: "unexpected-failure" }; }
  const completedAt = now().toISOString();
  if (sync.status === "completed") {
    let write: DbResult<{ id: string }>;
    try { write = await database.updateConnection(connection.id, { last_successful_sync_at: completedAt, connection_status: "active", consecutive_failure_count: 0, last_failure_code: null, updated_at: completedAt }); }
    catch { write = { data: null, error: true }; }
    if (write.error || !write.data) {
      const message = "Your jobs were synchronized, but the connection status could not be updated.";
      await finishHistory(database, historyId, { completed_at: completedAt, status: "completed_with_warning", ...syncSummary(sync), warning_message: message });
      return { status: "completed-with-warning", sync, message };
    }
    await finishHistory(database, historyId, { completed_at: completedAt, status: "completed", ...syncSummary(sync), warning_message: null });
    return { status: "completed", sync, connection: { status: "active", consecutiveFailureCount: 0, lastSuccessfulSyncAt: completedAt } };
  }
  if (sync.status === "disabled" || sync.status === "disconnected") {
    await finishHistory(database, historyId, { completed_at: completedAt, status: "failed", ...syncSummary(sync), warning_message: messages[sync.status] });
    return { status: sync.status, message: messages[sync.status] };
  }
  const failureCode = { "connection-unavailable": "connection_unavailable", "unsupported-provider": "unsupported_provider", "retrieval-failed": "retrieval_failed", "database-failed": "database_failed", "unexpected-failure": "unexpected_failure" }[sync.status];
  const failureCount = Math.max(0, connection.consecutive_failure_count || 0) + 1;
  let write: DbResult<{ id: string }>;
  try { write = await database.updateConnection(connection.id, { last_failed_sync_at: completedAt, connection_status: "error", consecutive_failure_count: failureCount, last_failure_code: failureCode, updated_at: completedAt }); }
  catch { write = { data: null, error: true }; }
  if (write.error || !write.data) {
    await finishHistory(database, historyId, { completed_at: completedAt, status: "failed", ...syncSummary(sync), warning_message: messages["database-failed"] });
    return { status: "database-failed", message: messages["database-failed"] };
  }
  const warningMessage = sync.status === "unexpected-failure" ? messages["database-failed"] : messages[sync.status];
  await finishHistory(database, historyId, { completed_at: completedAt, status: "failed", ...syncSummary(sync), warning_message: safeHistoryMessage(warningMessage) });
  if (sync.status === "unexpected-failure") return { status: "database-failed", message: messages["database-failed"], consecutiveFailureCount: failureCount };
  return { status: sync.status, message: messages[sync.status], consecutiveFailureCount: failureCount };
}

import "server-only";

import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { runEmployerAtsSync, type RunEmployerAtsSyncResult } from "./runEmployerAtsSync";

export const ATS_SYNC_WORKER_CONCURRENCY = 3;
export const ATS_SYNC_WORKER_PAGE_SIZE = 100;
export const ATS_SYNC_WORKER_MAX_RUNTIME_MS = 45_000;

type AtsConnectionRow = { id: string; last_sync_started_at: string | null };
type DbResult<T> = { data: T | null; error: unknown | null };
type PaginationCursor = { phase: "null-started"; id: string | null } | { phase: "started"; startedAt: string | null; id: string | null };

export type ScheduledAtsSyncSummary = {
  attempted: number;
  completed: number;
  completedWithWarning: number;
  alreadyRunning: number;
  skipped: number;
  failed: number;
};

export type ScheduledAtsSyncResponse = {
  status: "completed" | "completed-with-warning";
  summary: ScheduledAtsSyncSummary;
  hasMore: boolean;
  message?: string;
};

export type ScheduledAtsSyncDatabase = {
  listEligibleConnections(input: { cursor: PaginationCursor; limit: number }): Promise<DbResult<AtsConnectionRow[]>>;
};

export type RunScheduledAtsSyncsDependencies = {
  database?: ScheduledAtsSyncDatabase | null;
  runner?: (input: { connectionId: string }) => Promise<RunEmployerAtsSyncResult>;
  now?: () => number;
  maxRuntimeMs?: number;
  pageSize?: number;
  concurrency?: number;
};

const emptySummary = (): ScheduledAtsSyncSummary => ({ attempted: 0, completed: 0, completedWithWarning: 0, alreadyRunning: 0, skipped: 0, failed: 0 });

function defaultDatabase(): ScheduledAtsSyncDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async listEligibleConnections({ cursor, limit }) {
      let query = client
        .from("employer_ats_connections")
        .select("id,last_sync_started_at")
        .eq("enabled", true)
        .in("connection_status", ["active", "error"])
        .limit(limit);

      if (cursor.phase === "null-started") {
        query = query.is("last_sync_started_at", null).order("id", { ascending: true });
        if (cursor.id) query = query.gt("id", cursor.id);
      } else {
        query = query.not("last_sync_started_at", "is", null).order("last_sync_started_at", { ascending: true }).order("id", { ascending: true });
        if (cursor.startedAt && cursor.id) {
          query = query.or(`last_sync_started_at.gt.${cursor.startedAt},and(last_sync_started_at.eq.${cursor.startedAt},id.gt.${cursor.id})`);
        }
      }

      return await query as DbResult<AtsConnectionRow[]>;
    },
  };
}

function classify(result: RunEmployerAtsSyncResult, summary: ScheduledAtsSyncSummary) {
  switch (result.status) {
    case "completed":
      summary.completed += 1;
      break;
    case "completed-with-warning":
      summary.completedWithWarning += 1;
      break;
    case "already-running":
      summary.alreadyRunning += 1;
      break;
    case "disabled":
    case "disconnected":
      summary.skipped += 1;
      break;
    default:
      summary.failed += 1;
      break;
  }
}

async function runBounded<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>, shouldStart: () => boolean) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length && shouldStart()) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
  return nextIndex;
}

function advanceCursor(cursor: PaginationCursor, rows: AtsConnectionRow[], pageWasFull: boolean): PaginationCursor | null {
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    return cursor.phase === "null-started" ? { phase: "null-started", id: last.id } : { phase: "started", startedAt: last.last_sync_started_at, id: last.id };
  }
  if (cursor.phase === "null-started") return { phase: "started", startedAt: null, id: null };
  return pageWasFull ? cursor : null;
}

/**
 * Scheduled ATS sync pagination snapshots one bounded page of eligible connection IDs at a time.
 * It first drains rows with null last_sync_started_at by id, then keysets non-null rows by
 * (last_sync_started_at, id). The worker never mutates rows itself; runEmployerAtsSync owns claiming.
 */
export async function runScheduledAtsSyncs(dependencies: RunScheduledAtsSyncsDependencies = {}): Promise<ScheduledAtsSyncResponse | { status: "failed"; message: string }> {
  const database = dependencies.database === undefined ? defaultDatabase() : dependencies.database;
  const runner = dependencies.runner ?? runEmployerAtsSync;
  const now = dependencies.now ?? Date.now;
  const maxRuntimeMs = dependencies.maxRuntimeMs ?? ATS_SYNC_WORKER_MAX_RUNTIME_MS;
  const pageSize = dependencies.pageSize ?? ATS_SYNC_WORKER_PAGE_SIZE;
  const concurrency = dependencies.concurrency ?? ATS_SYNC_WORKER_CONCURRENCY;
  const startedAt = now();
  const summary = emptySummary();
  if (!database) return { status: "failed", message: "Scheduled job synchronization could not start." };

  let cursor: PaginationCursor | null = { phase: "null-started", id: null };
  let hasMore = false;
  let queryCount = 0;
  const processed = new Set<string>();

  while (cursor && now() - startedAt < maxRuntimeMs) {
    const result = await database.listEligibleConnections({ cursor, limit: pageSize });
    queryCount += 1;
    if (result.error) {
      if (queryCount === 1) return { status: "failed", message: "Scheduled job synchronization could not start." };
      return { status: "completed-with-warning", summary, hasMore: true, message: "Some job sources could not be scheduled during this run." };
    }

    const rows = (result.data ?? []).filter((row) => !processed.has(row.id));
    const pageWasFull = (result.data ?? []).length >= pageSize;
    cursor = advanceCursor(cursor, result.data ?? [], pageWasFull);
    if (rows.length === 0) continue;

    const claimableRows = rows.filter(() => now() - startedAt < maxRuntimeMs);
    if (claimableRows.length < rows.length) {
      hasMore = true;
      break;
    }

    const startedCount = await runBounded(claimableRows, Math.max(1, concurrency), async (row) => {
      if (processed.has(row.id)) return;
      processed.add(row.id);
      summary.attempted += 1;
      try {
        const runnerResult = await runner({ connectionId: row.id });
        classify(runnerResult, summary);
      } catch {
        summary.failed += 1;
      }
    }, () => now() - startedAt < maxRuntimeMs);
    if (startedCount < claimableRows.length) {
      hasMore = true;
      break;
    }
  }

  if (cursor) hasMore = true;
  return { status: "completed", summary, hasMore };
}

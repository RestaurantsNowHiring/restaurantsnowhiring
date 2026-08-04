import "server-only";

import { sanitizeRichText } from "../../richText";
import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { getAtsProvider } from "../providers/registry";
import type { AtsProvider, ImportedJob } from "../types";
import { mapEmploymentType, mapRoleCategory, mapUsLocation, normalizeAtsLocationKey } from "../import/prepareJobImport";

export const ATS_SYNC_BATCH_SIZE = 200;

export type SyncEmployerAtsConnectionInput = { connectionId: string };
export type SyncJobOutcome = { providerKey: string; externalId: string; jobId: string; message: string };
export type SyncAvailableJob = { providerKey: string; externalId: string; title: string; location?: string };
export type SyncEmployerAtsConnectionResult =
  | { status: "completed"; connectionId: string; summary: { currentImported: number; updated: number; closed: number; reopened: number; needsReview: number; newAvailable: number; unchanged: number; failed: number }; Updated: SyncJobOutcome[]; Closed: SyncJobOutcome[]; Reopened: SyncJobOutcome[]; NeedsReview: SyncJobOutcome[]; NewAvailable: SyncAvailableJob[]; Unchanged: SyncJobOutcome[]; Failed: SyncJobOutcome[] }
  | { status: "connection-unavailable" | "disabled" | "unsupported-provider" | "retrieval-failed" | "database-failed"; message: string };

type DbError = { message?: string; code?: string };
type DbResult<T> = { data: T | null; error: DbError | null };
type Connection = { id: string; employer_account_id: string; provider_key: string; source_url: string; enabled: boolean; connection_status: string };
type ExistingJob = { id: string; ats_external_job_id: string; ats_inactive_reason: string | null; status: string | null; active: boolean; approved_at: string | null; expires_at: string | null; ats_source_url: string | null; ats_apply_url: string | null; ats_last_synced_at: string | null; ats_remote_updated_at: string | null; title: string; description: string; city: string; state: string; role_category: string; employment_type: string; how_to_apply?: string | null };
type LocationMapping = { ats_location_key: string; city: string; state: string; employer_stores: { employer_account_id: string; active: boolean; is_assignable_location: boolean; city: string | null; state: string | null } | null };
type SyncDatabase = {
  getConnection(id: string): Promise<DbResult<Connection>>;
  getImportedJobs(accountId: string, providerKey: string, from: number, to: number): Promise<DbResult<ExistingJob[]>>;
  getLocationMappings(accountId: string, providerKey: string, keys: string[]): Promise<DbResult<LocationMapping[]>>;
  updateJob(id: string, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
};
export type SyncEmployerAtsConnectionDependencies = { database: SyncDatabase; getProvider?: (key: string) => AtsProvider | undefined; now?: () => Date };

const JOB_FIELDS = "id,ats_external_job_id,ats_inactive_reason,status,active,approved_at,expires_at,ats_source_url,ats_apply_url,ats_last_synced_at,ats_remote_updated_at,title,description,city,state,role_category,employment_type,how_to_apply";

function defaultDatabase(): SyncDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async getConnection(id) { return await client.from("employer_ats_connections").select("id,employer_account_id,provider_key,source_url,enabled,connection_status").eq("id", id).maybeSingle() as DbResult<Connection>; },
    async getImportedJobs(accountId, providerKey, from, to) { return await client.from("jobs").select(JOB_FIELDS).eq("employer_account_id", accountId).eq("source_type", "ats").eq("ats_provider", providerKey).range(from, to) as DbResult<ExistingJob[]>; },
    async getLocationMappings(accountId, providerKey, keys) {
      if (!keys.length) return { data: [], error: null };
      return await client.from("employer_ats_location_mappings").select("ats_location_key,city,state,employer_stores!inner(employer_account_id,active,is_assignable_location,city,state)").eq("employer_account_id", accountId).eq("ats_provider", providerKey).in("ats_location_key", keys) as unknown as DbResult<LocationMapping[]>;
    },
    async updateJob(id, payload) { return await client.from("jobs").update(payload).eq("id", id).select("id").single() as DbResult<{ id: string }>; },
  };
}

function safeUrl(value: string) {
  try { const url = new URL(value); return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password; } catch { return false; }
}
function same(a: unknown, b: unknown) { return (a ?? null) === (b ?? null); }
function identity(providerKey: string, externalId: string) { return `${providerKey}\0${externalId}`; }
function outcome(providerKey: string, job: ExistingJob, message: string): SyncJobOutcome { return { providerKey, externalId: job.ats_external_job_id, jobId: job.id, message }; }

/**
 * Synchronizes one persisted connection. Retrieval completes before any write; after that
 * point rows are deliberately independent, so one failed write does not undo other rows.
 * Only jobs carrying the durable closed_in_ats reason are eligible for reopening;
 * all employer, admin, legacy, and other intentional inactive states are preserved.
 */
export async function syncEmployerAtsConnection(input: SyncEmployerAtsConnectionInput, dependencies?: SyncEmployerAtsConnectionDependencies): Promise<SyncEmployerAtsConnectionResult> {
  const database = dependencies?.database ?? defaultDatabase();
  if (!database) return { status: "database-failed", message: "The synchronization service is temporarily unavailable." };
  const connectionId = typeof input?.connectionId === "string" ? input.connectionId.trim() : "";
  if (!connectionId) return { status: "connection-unavailable", message: "The ATS connection is unavailable." };
  let loaded: DbResult<Connection>;
  try { loaded = await database.getConnection(connectionId); } catch { return { status: "database-failed", message: "The ATS connection could not be loaded." }; }
  if (loaded.error) return { status: "database-failed", message: "The ATS connection could not be loaded." };
  const connection = loaded.data;
  if (!connection || connection.connection_status === "disconnected") return { status: "connection-unavailable", message: "The ATS connection is unavailable." };
  if (!connection.enabled) return { status: "disabled", message: "The ATS connection is disabled." };
  const provider = (dependencies?.getProvider ?? getAtsProvider)(connection.provider_key);
  if (!provider) return { status: "unsupported-provider", message: "The ATS provider is no longer supported." };
  if (!safeUrl(connection.source_url)) return { status: "connection-unavailable", message: "The ATS connection source is invalid." };

  let remoteJobs: ImportedJob[];
  try { remoteJobs = await provider.parseJobs({ url: connection.source_url }); }
  catch { return { status: "retrieval-failed", message: "The ATS jobs could not be retrieved. No jobs were changed." }; }
  if (!Array.isArray(remoteJobs)) return { status: "retrieval-failed", message: "The ATS jobs could not be retrieved. No jobs were changed." };

  const existing: ExistingJob[] = [];
  try {
    for (let from = 0; ; from += ATS_SYNC_BATCH_SIZE) {
      const page = await database.getImportedJobs(connection.employer_account_id, connection.provider_key, from, from + ATS_SYNC_BATCH_SIZE - 1);
      if (page.error) return { status: "database-failed", message: "Imported jobs could not be loaded. No jobs were changed." };
      const rows = page.data ?? []; existing.push(...rows);
      if (rows.length < ATS_SYNC_BATCH_SIZE) break;
    }
  } catch { return { status: "database-failed", message: "Imported jobs could not be loaded. No jobs were changed." }; }

  const remote = new Map<string, ImportedJob>();
  for (const job of remoteJobs) if (job.providerKey === connection.provider_key && typeof job.externalId === "string" && job.externalId) remote.set(identity(job.providerKey, job.externalId), job);
  const importedKeys = new Set(existing.map((job) => identity(connection.provider_key, job.ats_external_job_id)));
  const NewAvailable: SyncAvailableJob[] = [];
  for (const job of remote.values()) if (!importedKeys.has(identity(job.providerKey, job.externalId))) NewAvailable.push({ providerKey: job.providerKey, externalId: job.externalId, title: job.title, ...(job.location ? { location: job.location } : {}) });

  const locationKeys = [...new Set([...remote.values()].map((job) => job.location ? normalizeAtsLocationKey(job.location) : "").filter(Boolean))];
  const mappings = new Map<string, LocationMapping>();
  try {
    for (let offset = 0; offset < locationKeys.length; offset += ATS_SYNC_BATCH_SIZE) {
      const found = await database.getLocationMappings(connection.employer_account_id, connection.provider_key, locationKeys.slice(offset, offset + ATS_SYNC_BATCH_SIZE));
      if (found.error) return { status: "database-failed", message: "ATS location mappings could not be loaded. No jobs were changed." };
      for (const mapping of found.data ?? []) {
        const store = mapping.employer_stores;
        if (store?.employer_account_id === connection.employer_account_id && store.active && store.is_assignable_location && store.city && store.state) mappings.set(mapping.ats_location_key, mapping);
      }
    }
  } catch { return { status: "database-failed", message: "ATS location mappings could not be loaded. No jobs were changed." }; }

  const result = { status: "completed" as const, connectionId: connection.id, summary: { currentImported: existing.length, updated: 0, closed: 0, reopened: 0, needsReview: 0, newAvailable: NewAvailable.length, unchanged: 0, failed: 0 }, Updated: [] as SyncJobOutcome[], Closed: [] as SyncJobOutcome[], Reopened: [] as SyncJobOutcome[], NeedsReview: [] as SyncJobOutcome[], NewAvailable, Unchanged: [] as SyncJobOutcome[], Failed: [] as SyncJobOutcome[] };
  const syncedAt = (dependencies?.now ?? (() => new Date()))().toISOString();
  for (const current of existing) {
    const incoming = remote.get(identity(connection.provider_key, current.ats_external_job_id));
    if (!incoming) {
      let write: DbResult<{ id: string }>;
      try { write = await database.updateJob(current.id, { active: false, status: "archived", ats_inactive_reason: "closed_in_ats", ats_last_synced_at: syncedAt }); }
      catch { write = { data: null, error: {} }; }
      const bucket = write.error ? result.Failed : result.Closed;
      bucket.push(outcome(connection.provider_key, current, write.error ? "This job could not be deactivated." : "The ATS no longer lists this job; it was deactivated."));
      continue;
    }
    const issues: string[] = [];
    const directLocation = mapUsLocation(incoming.location);
    const saved = incoming.location ? mappings.get(normalizeAtsLocationKey(incoming.location)) : undefined;
    const location = directLocation ?? (saved ? { city: saved.city, state: saved.state } : undefined);
    if (!location) issues.push("location");
    const role = mapRoleCategory(incoming.title, incoming.department);
    if (!role) issues.push("role category");
    const employment = mapEmploymentType(incoming.employmentType);
    if (!employment) issues.push("employment type");
    const description = sanitizeRichText(incoming.descriptionHtml ?? "").trim();
    if (!description) issues.push("description");
    const payload: Record<string, unknown> = {
      title: incoming.title.trim(), ats_source_url: incoming.sourceUrl, ats_apply_url: incoming.applyUrl,
      how_to_apply: incoming.applyUrl, ats_last_synced_at: syncedAt, ats_remote_updated_at: incoming.updatedAt ?? null,
      ...(description ? { description } : {}), ...(location ? location : {}), ...(role ? { role_category: role } : {}),
      ...(employment ? { employment_type: employment } : {}),
    };
    const reopening = current.ats_inactive_reason === "closed_in_ats";
    if (reopening) Object.assign(payload, current.approved_at
      ? { active: true, status: "active", ats_inactive_reason: null }
      : { active: false, status: "pending", ats_inactive_reason: null });
    const changed = !same(current.title, payload.title) || !same(current.description, payload.description ?? current.description) || !same(current.ats_source_url, payload.ats_source_url) || !same(current.ats_apply_url, payload.ats_apply_url) || !same(current.how_to_apply, payload.how_to_apply) || !same(current.ats_remote_updated_at, payload.ats_remote_updated_at) || !same(current.city, payload.city ?? current.city) || !same(current.state, payload.state ?? current.state) || !same(current.role_category, payload.role_category ?? current.role_category) || !same(current.employment_type, payload.employment_type ?? current.employment_type);
    let write: DbResult<{ id: string }>;
    try { write = await database.updateJob(current.id, payload); } catch { write = { data: null, error: {} }; }
    if (write.error) result.Failed.push(outcome(connection.provider_key, current, "This job could not be synchronized."));
    else if (reopening) result.Reopened.push(outcome(connection.provider_key, current, current.approved_at
      ? "The previously approved ATS job returned and was reactivated."
      : "The ATS job returned and was restored to pending review."));
    else if (issues.length) result.NeedsReview.push(outcome(connection.provider_key, current, `ATS data was refreshed, but ${issues.join(", ")} requires review; the saved value was preserved.`));
    else if (changed) result.Updated.push(outcome(connection.provider_key, current, "The ATS-managed job fields were updated."));
    else result.Unchanged.push(outcome(connection.provider_key, current, "The job remains open and its sync timestamp was refreshed."));
  }
  result.summary.updated = result.Updated.length; result.summary.closed = result.Closed.length; result.summary.reopened = result.Reopened.length;
  result.summary.needsReview = result.NeedsReview.length; result.summary.unchanged = result.Unchanged.length; result.summary.failed = result.Failed.length;
  return result;
}

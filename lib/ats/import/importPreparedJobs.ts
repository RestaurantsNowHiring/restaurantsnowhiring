import "server-only";

import { EMPLOYMENT_OPTIONS, ROLE_OPTIONS, STATE_OPTIONS } from "../../jobFormOptions";
import { sanitizeRichText } from "../../richText";
import { syncSubscriptionQuantityForEmployer } from "../../billing";
import { buildCanonicalJobInsertPayload, shouldAutoApproveJob } from "../../jobPersistence";
import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { getAtsProvider } from "../providers/registry";
import type { PreparedImportItem, PreparedRnhJob } from "./prepareJobImport";
import { normalizeAtsLocationKey, normalizeProviderKey } from "./prepareJobImport";

const MAX_JOBS = 500;
const BATCH_SIZE = 50;
const MAX_TEXT = 10_000;
const MAX_DESCRIPTION = 250_000;
const ROLE_CATEGORIES = new Set([...ROLE_OPTIONS, "Shift Lead", "Delivery", "Runner", "Expo", "Barista"]);
const EMPLOYMENT_TYPES = new Set([...EMPLOYMENT_OPTIONS, "Contract", "Internship"]);
const STATES = new Set(STATE_OPTIONS);

export type JobReviewCorrection = {
  providerKey: string;
  externalId: string;
  employerStoreId?: string;
  roleCategory?: string;
  employmentType?: string;
  description?: string;
};

export type ImportPreparedJobsInput = {
  employerAccountId: string;
  preparedJobs: PreparedImportItem[];
  reviewCorrections: JobReviewCorrection[];
};

export type ImportJobOutcome = {
  providerKey: string;
  externalId: string;
  message: string;
};

export type ImportPreparedJobsResult = {
  Imported: ImportJobOutcome[];
  Updated: ImportJobOutcome[];
  Skipped: ImportJobOutcome[];
  Failed: ImportJobOutcome[];
};

type Account = { id: string; owner_user_id: string; owner_email: string; restaurant_name: string | null };
type ExistingJob = { id: string; ats_provider: string; ats_external_job_id: string };
type Store = { id: string; employer_account_id: string; location_name: string; city: string; state: string; active: boolean; is_assignable_location: boolean };
type DbResult<T = unknown> = { data: T | null; error: { code?: string; message?: string } | null };

type ImportDatabase = {
  getAccount(accountId: string): Promise<DbResult<Account>>;
  findExisting(accountId: string, providerKey: string, externalIds: string[]): Promise<DbResult<ExistingJob[]>>;
  insert(payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
  update(id: string, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
  getStore(accountId: string, storeId: string): Promise<DbResult<Store>>;
  upsertLocationMapping(payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
};

export type ImportPreparedJobsDependencies = {
  database: ImportDatabase;
  now: () => Date;
  syncSubscriptionQuantityForEmployer?: typeof syncSubscriptionQuantityForEmployer;
};

function defaultDatabase(): ImportDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async getAccount(accountId) {
      const result = await client.from("employer_accounts").select("id,owner_user_id,owner_email,restaurant_brand_name,company_name,account_name").eq("id", accountId).maybeSingle();
      const row = result.data;
      return {
        error: result.error,
        data: row ? {
          id: row.id,
          owner_user_id: row.owner_user_id,
          owner_email: row.owner_email,
          restaurant_name: row.restaurant_brand_name || row.company_name || row.account_name || null,
        } : null,
      };
    },
    async findExisting(accountId, providerKey, externalIds) {
      const result = await client.from("jobs").select("id,ats_provider,ats_external_job_id").eq("employer_account_id", accountId).eq("source_type", "employer").eq("ats_provider", providerKey).in("ats_external_job_id", externalIds);
      return result as DbResult<ExistingJob[]>;
    },
    async insert(payload) {
      const result = await client.from("jobs").insert(payload).select("id").single();
      return result as DbResult<{ id: string }>;
    },
    async update(id, payload) {
      const result = await client.from("jobs").update(payload).eq("id", id).select("id").single();
      return result as DbResult<{ id: string }>;
    },
    async getStore(accountId, storeId) {
      const result = await client.from("employer_stores").select("id,employer_account_id,location_name,city,state,active,is_assignable_location")
        .eq("id", storeId).maybeSingle();
      return result as DbResult<Store>;
    },
    async upsertLocationMapping(payload) {
      const result = await client.from("employer_ats_location_mappings").upsert(payload, {
        onConflict: "employer_account_id,ats_provider,ats_location_key",
      }).select("id").single();
      return result as DbResult<{ id: string }>;
    },
  };
}

function safeIdentity(item: Partial<PreparedImportItem>): Pick<ImportJobOutcome, "providerKey" | "externalId"> {
  return {
    providerKey: typeof item.providerKey === "string" ? item.providerKey.slice(0, 128) : "unknown",
    externalId: typeof item.externalId === "string" ? item.externalId.slice(0, 1024) : "unknown",
  };
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function cleanString(value: unknown, max = MAX_TEXT) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= max ? clean : undefined;
}

function validateAndMerge(item: PreparedImportItem, correction: JobReviewCorrection | undefined, store?: Store): { job: PreparedRnhJob } | { error: string } {
  if (item.status === "unavailable") return { error: item.message || "This job is unavailable." };
  const job = item.job;
  const rawProvider = cleanString(item.providerKey, 128);
  const provider = rawProvider ? normalizeProviderKey(rawProvider) : undefined;
  const externalId = cleanString(item.externalId, 1024);
  if (!provider || !getAtsProvider(provider) || provider !== normalizeProviderKey(job.providerKey)) return { error: "The ATS provider identity is invalid." };
  if (!externalId || externalId !== job.externalId) return { error: "The ATS job identity is invalid." };
  if (!validUrl(job.sourceUrl) || !validUrl(job.applyUrl)) return { error: "The ATS job URLs are invalid." };
  if (correction && (correction.providerKey !== provider || correction.externalId !== externalId)) return { error: "The review correction identity is invalid." };

  const issueFields = new Set(item.status === "needs-review" ? item.issues.map((issue) => issue.field) : []);
  const supplied = correction ?? { providerKey: provider, externalId };
  if ((!issueFields.has("location") && supplied.employerStoreId !== undefined && !job.atsLocation) ||
      (!issueFields.has("roleCategory") && supplied.roleCategory !== undefined) ||
      (!issueFields.has("employmentType") && supplied.employmentType !== undefined) ||
      (!issueFields.has("description") && supplied.description !== undefined)) {
    return { error: "A review correction was supplied for a field that did not require review." };
  }

  const city = cleanString(store ? store.city : job.city, 200);
  const state = cleanString(store ? store.state : job.state, 2)?.toUpperCase();
  const roleCategory = cleanString(issueFields.has("roleCategory") ? supplied.roleCategory : job.roleCategory, 100);
  const employmentType = cleanString(issueFields.has("employmentType") ? supplied.employmentType : job.employmentType, 100);
  const descriptionHtml = cleanString(issueFields.has("description") ? supplied.description : job.descriptionHtml, MAX_DESCRIPTION);
  if (!city || !state || !STATES.has(state)) return { error: "Choose a valid city and state." };
  if (!roleCategory || !ROLE_CATEGORIES.has(roleCategory)) return { error: "Choose a valid role category." };
  if (!employmentType || !EMPLOYMENT_TYPES.has(employmentType)) return { error: "Choose a valid employment type." };
  if (!descriptionHtml) return { error: "A job description is required." };
  if (!cleanString(job.title, 500)) return { error: "A job title is required." };
  if (job.remoteUpdatedAt && Number.isNaN(Date.parse(job.remoteUpdatedAt))) return { error: "The ATS update time is invalid." };
  return { job: { ...job, city, state, roleCategory, employmentType, descriptionHtml } };
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505";
}

/** Persist only values produced by prepareJobImport; route code must never construct preparedJobs from browser job data. */
export async function importPreparedJobs(input: ImportPreparedJobsInput, dependencies?: ImportPreparedJobsDependencies): Promise<ImportPreparedJobsResult> {
  const result: ImportPreparedJobsResult = { Imported: [], Updated: [], Skipped: [], Failed: [] };
  if (!Array.isArray(input.preparedJobs) || input.preparedJobs.length < 1 || input.preparedJobs.length > MAX_JOBS) {
    result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: `Import must contain between 1 and ${MAX_JOBS} prepared jobs.` });
    return result;
  }
  const database = dependencies?.database ?? defaultDatabase();
  if (!database) {
    result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: "The import service is temporarily unavailable." });
    return result;
  }
  const accountId = cleanString(input.employerAccountId, 100);
  if (!accountId) {
    result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: "The employer account is invalid." });
    return result;
  }
  const accountResult = await database.getAccount(accountId);
  if (accountResult.error || !accountResult.data) {
    result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: "The employer account could not be verified." });
    return result;
  }
  const restaurantName = cleanString(accountResult.data.restaurant_name, 500);
  if (!restaurantName) {
    result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: "Set the employer restaurant or company name before importing jobs." });
    return result;
  }
  const corrections = new Map<string, JobReviewCorrection>();
  for (const value of Array.isArray(input.reviewCorrections) ? input.reviewCorrections : []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      result.Failed.push({ providerKey: "unknown", externalId: "unknown", message: "A review correction is invalid." });
      continue;
    }
    const correction = value as JobReviewCorrection;
    const allowedKeys = new Set(["providerKey", "externalId", "employerStoreId", "roleCategory", "employmentType", "description"]);
    if (Object.keys(correction).some((field) => !allowedKeys.has(field)) ||
        !cleanString(correction.providerKey, 128) || !cleanString(correction.externalId, 1024) ||
        [correction.employerStoreId, correction.roleCategory, correction.employmentType, correction.description]
          .some((field) => field !== undefined && typeof field !== "string")) {
      result.Failed.push({ ...safeIdentity(correction as Partial<PreparedImportItem>), message: "A review correction is invalid." });
      continue;
    }
    correction.providerKey = normalizeProviderKey(correction.providerKey);
    const key = `${correction.providerKey}\0${correction.externalId}`;
    if (corrections.has(key)) {
      result.Failed.push({ ...safeIdentity(correction as Partial<PreparedImportItem>), message: "Duplicate review corrections were provided." });
    } else corrections.set(key, correction);
  }
  const preparedIdentities = new Set(input.preparedJobs.map((item) => `${normalizeProviderKey(item?.providerKey ?? "")}\0${item?.externalId}`));
  for (const [key, correction] of corrections) {
    if (!preparedIdentities.has(key)) {
      result.Failed.push({ ...safeIdentity(correction as Partial<PreparedImportItem>), message: "A review correction does not match a prepared job." });
      corrections.delete(key);
    }
  }
  const seen = new Set<string>();
  const now = (dependencies?.now ?? (() => new Date()))().toISOString();

  for (let offset = 0; offset < input.preparedJobs.length; offset += BATCH_SIZE) {
    const batch = input.preparedJobs.slice(offset, offset + BATCH_SIZE);
    const valid: Array<{ item: PreparedImportItem; job: PreparedRnhJob; key: string; store?: Store }> = [];
    for (const item of batch) {
      const identity = safeIdentity(item);
      const key = `${normalizeProviderKey(identity.providerKey)}\0${identity.externalId}`;
      if (seen.has(key)) { result.Skipped.push({ ...identity, message: "This ATS job appeared more than once in the import." }); continue; }
      seen.add(key);
      const correction = corrections.get(key);
      const locationIssue = item.status === "needs-review" && item.issues.some((issue) => issue.field === "location");
      const locationOverride = Boolean(correction?.employerStoreId && item.status !== "unavailable" && item.job.atsLocation);
      let store: Store | undefined;
      if (locationIssue || locationOverride) {
        const storeId = cleanString(correction?.employerStoreId, 100);
        if (!storeId) { result.Failed.push({ ...identity, message: "Choose a restaurant location." }); continue; }
        const storeResult = await database.getStore(accountId, storeId);
        if (storeResult.error || !storeResult.data || storeResult.data.employer_account_id !== accountId ||
            !storeResult.data.active || !storeResult.data.is_assignable_location ||
            !cleanString(storeResult.data.city, 200) || !STATES.has(storeResult.data.state?.toUpperCase())) {
          result.Failed.push({ ...identity, message: "Choose a valid restaurant location." }); continue;
        }
        store = storeResult.data;
      }
      const checked = validateAndMerge(item, correction, store);
      if ("error" in checked) { (item.status === "unavailable" ? result.Skipped : result.Failed).push({ ...identity, message: checked.error }); continue; }
      valid.push({ item, job: checked.job, key, ...(store ? { store } : {}) });
    }

    for (const providerKey of new Set(valid.map(({ job }) => normalizeProviderKey(job.providerKey)))) {
      const providerJobs = valid.filter(({ job }) => normalizeProviderKey(job.providerKey) === providerKey);
      const existingResult = await database.findExisting(accountId, providerKey, providerJobs.map(({ job }) => job.externalId));
      if (existingResult.error) {
        for (const { item } of providerJobs) result.Failed.push({ ...safeIdentity(item), message: "This job could not be checked for an existing import." });
        continue;
      }
      const existing = new Map((existingResult.data ?? []).map((row) => [row.ats_external_job_id, row]));
      for (const { item, job, store } of providerJobs) {
        const identity = safeIdentity(item);
        // Sanitization deliberately happens here, immediately before persistence.
        const managed = {
          title: job.title.trim(), role_category: job.roleCategory, city: job.city, state: job.state,
          employment_type: job.employmentType, description: sanitizeRichText(job.descriptionHtml).trim(),
          source_type: "ats", ats_provider: normalizeProviderKey(job.providerKey), ats_external_job_id: job.externalId,
          ats_source_url: job.sourceUrl, ats_apply_url: job.applyUrl, ats_last_synced_at: now,
          ats_remote_updated_at: job.remoteUpdatedAt ?? null,
        };
        if (!managed.description) { result.Failed.push({ ...identity, message: "The job description is empty after sanitization." }); continue; }
        const prior = existing.get(job.externalId);
        let persistedAs: "Imported" | "Updated" | undefined;
        if (prior) {
          const update = await database.update(prior.id, managed);
          if (update.error) { result.Failed.push({ ...identity, message: "This existing job could not be updated." }); continue; }
          persistedAs = "Updated";
        } else {
          const inserted = await database.insert({
            ...buildCanonicalJobInsertPayload({
              restaurantName,
              title: managed.title,
              roleCategory: job.roleCategory!,
              city: job.city!,
              state: job.state!,
              // public.jobs historically requires apply_email. ATS application routing uses
              // how_to_apply/ats_apply_url; this compatibility value is not notification routing.
              applyEmail: accountResult.data.owner_email,
              employmentType: job.employmentType!,
              description: managed.description,
              employerEmail: accountResult.data.owner_email,
              employerUserId: accountResult.data.owner_user_id,
              employerAccountId: accountResult.data.id,
              postedByUserId: accountResult.data.owner_user_id,
              postedByEmail: accountResult.data.owner_email,
              howToApply: job.applyUrl,
              candidateNotificationEmail: null,
              candidateNotificationEmails: null,
              approvalDate: new Date(now),
            }),
            ...managed,
          });
          if (!inserted.error) persistedAs = "Imported";
          else if (isUniqueViolation(inserted.error)) {
            const raced = await database.findExisting(accountId, providerKey, [job.externalId]);
            const row = raced.data?.[0];
            if (row && !(await database.update(row.id, managed)).error) persistedAs = "Updated";
          }
        }
        if (!persistedAs) { result.Failed.push({ ...identity, message: "This job could not be imported." }); continue; }

        let mappingFailed = false;
        if (store && job.atsLocation) {
          const mapping = await database.upsertLocationMapping({
            employer_account_id: accountId, employer_store_id: store.id,
            ats_provider: normalizeProviderKey(job.providerKey), ats_location_value: job.atsLocation,
            ats_location_key: normalizeAtsLocationKey(job.atsLocation), city: job.city, state: job.state,
          });
          mappingFailed = Boolean(mapping.error);
        }
        result[persistedAs].push({ ...identity, message: mappingFailed
          ? `The ATS job was ${persistedAs === "Imported" ? "imported" : "updated"}, but its location mapping could not be saved. Choose the restaurant location again on the next import.`
          : persistedAs === "Imported" ? "The ATS job was imported for approval." : "The ATS job was updated." });
      }
    }
  }
  if (result.Imported.length > 0 && shouldAutoApproveJob(accountId)) {
    const syncQuantity = dependencies?.syncSubscriptionQuantityForEmployer ?? syncSubscriptionQuantityForEmployer;
    await syncQuantity(accountResult.data.owner_user_id).catch((syncError) => {
      console.error("Failed to sync Stripe quantity after MISSION BBQ ATS auto-approval", { syncError });
    });
  }
  return result;
}

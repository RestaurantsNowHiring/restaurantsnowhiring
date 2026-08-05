import "server-only";

import { previewJobImport } from "./previewJobImport";
import { getAtsProvider } from "../providers/registry";
import type { AtsProviderKey, ImportedJob } from "../types";
import { getSupabaseAdminClient } from "../../supabaseAdmin";

export const MAX_IMPORT_SELECTION = 500;

export type SelectedImportJobKey = {
  providerKey: AtsProviderKey;
  externalId: string;
};

export type PrepareJobImportInput = {
  employerAccountId: string;
  careersPageUrl: string;
  selectedJobKeys: SelectedImportJobKey[];
};

export type AtsLocationMapping = {
  ats_provider: string;
  ats_location_value: string;
  ats_location_key: string;
  city: string;
  state: string;
  employer_store_id: string;
  employer_stores: { id: string; employer_account_id: string; city: string | null; state: string | null; active: boolean; is_assignable_location: boolean } | null;
};
export type PrepareJobImportDependencies = {
  findLocationMappings(accountId: string, provider: string, locationKeys: string[]): Promise<AtsLocationMapping[]>;
  getProvider?: typeof getAtsProvider;
};

export function normalizeProviderKey(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeAtsLocationKey(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export type ImportReviewIssue = {
  field: "location" | "roleCategory" | "employmentType" | "description";
  reason: "missing" | "unmapped";
  originalValue?: string;
  message: string;
};

export type PreparedRnhJob = {
  externalId: string;
  providerKey: AtsProviderKey;
  sourceUrl: string;
  applyUrl: string;
  title: string;
  descriptionHtml?: string;
  employmentType?: string;
  department?: string;
  remoteUpdatedAt?: string;
  atsLocation?: string;
  city?: string;
  state?: string;
  roleCategory?: string;
};

export type PreparedImportItem =
  | {
      status: "ready";
      providerKey: AtsProviderKey;
      externalId: string;
      job: PreparedRnhJob;
    }
  | {
      status: "needs-review";
      providerKey: AtsProviderKey;
      externalId: string;
      job: PreparedRnhJob;
      issues: ImportReviewIssue[];
    }
  | {
      status: "unavailable";
      providerKey: AtsProviderKey;
      externalId: string;
      message: string;
    };

export type PrepareJobImportResult =
  | {
      status: "prepared";
      providerKey: AtsProviderKey;
      sourceUrl: string;
      items: PreparedImportItem[];
      summary: {
        requested: number;
        ready: number;
        needsReview: number;
        unavailable: number;
      };
    }
  | {
      status:
        | "invalid-request"
        | "discovery-failed"
        | "no-job-links"
        | "unsupported"
        | "retrieval-failed";
      message: string;
    };

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "american samoa": "AS", guam: "GU",
  "northern mariana islands": "MP", "puerto rico": "PR", "u.s. virgin islands": "VI",
  "us virgin islands": "VI", "virgin islands": "VI",
};

for (const code of Object.values(STATE_CODES)) STATE_CODES[code.toLowerCase()] = code;

export function mapUsLocation(value: string | undefined): { city: string; state: string } | undefined {
  const location = value?.trim();
  if (!location || /[\/;|]/.test(location)) return undefined;
  const match = /^([^,]+),\s*([^,]+)$/.exec(location);
  if (!match) return undefined;
  const city = match[1].trim();
  const state = STATE_CODES[match[2].trim().toLowerCase()];
  if (!city || !state || /\b(remote|multiple|various|region|locations?|united states)\b/i.test(city)) return undefined;
  return { city, state };
}

const ROLE_MAPPINGS: ReadonlyArray<[RegExp, string]> = [
  [/\bshift (?:lead|leader)\b/i, "Shift Lead"],
  [/\b(?:general |restaurant |assistant )?manager\b/i, "Manager"],
  [/\bline cook\b/i, "Line"],
  [/\bprep(?:aration)? cook\b|\bprep\b/i, "Prep"],
  [/\bdishwasher\b|\bdish washer\b/i, "Dish"],
  [/\bserver\b|\bwait(?:er|ress|staff)\b/i, "Server"],
  [/\bcashier\b/i, "Cashier"],
  [/\bhost(?:ess)?\b/i, "Host"],
  [/\bbartender\b/i, "Bartender"],
  [/\bbusser\b|\bbus person\b/i, "Busser"],
  [/\bfood runner\b|\brunner\b/i, "Runner"],
  [/\bexpo\b|\bexpeditor\b/i, "Expo"],
  [/\bbarista\b/i, "Barista"],
  [/\bdelivery driver\b|\bdelivery\b/i, "Delivery"],
];

export function mapRoleCategory(title: string, department?: string): string | undefined {
  const context = `${title} ${department ?? ""}`.trim();
  return ROLE_MAPPINGS.find(([pattern]) => pattern.test(context))?.[1];
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  fulltime: "Full time", parttime: "Part time", seasonal: "Seasonal",
  temporary: "Temporary", temp: "Temporary", contract: "Contract",
  contractor: "Contract", internship: "Internship", intern: "Internship",
};

export function mapEmploymentType(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized ? EMPLOYMENT_TYPES[normalized] : undefined;
}

function validHttpUrl(value: string | undefined): value is string {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function prepareJob(job: ImportedJob, mapping?: AtsLocationMapping): PreparedImportItem {
  if (!validHttpUrl(job.applyUrl)) {
    return {
      status: "unavailable", providerKey: job.providerKey, externalId: job.externalId,
      message: "This job does not have a valid ATS application URL.",
    };
  }

  const location = mapping ? { city: mapping.city, state: mapping.state } : mapUsLocation(job.location);
  const roleCategory = mapRoleCategory(job.title, job.department);
  const employmentType = mapEmploymentType(job.employmentType);
  // Keep the refreshed ATS markup as source-of-truth. The persistence service must
  // apply the established rich-text sanitizer immediately before inserting it.
  const descriptionHtml = job.descriptionHtml?.trim() ? job.descriptionHtml : undefined;
  const prepared: PreparedRnhJob = {
    externalId: job.externalId,
    providerKey: job.providerKey,
    sourceUrl: job.sourceUrl,
    applyUrl: job.applyUrl,
    title: job.title,
    ...(descriptionHtml ? { descriptionHtml } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(job.department ? { department: job.department } : {}),
    ...(job.updatedAt ? { remoteUpdatedAt: job.updatedAt } : {}),
    ...(job.location ? { atsLocation: job.location } : {}),
    ...(location ?? {}),
    ...(roleCategory ? { roleCategory } : {}),
  };
  const issues: ImportReviewIssue[] = [];
  if (!location) issues.push({ field: "location", reason: job.location ? "unmapped" : "missing", ...(job.location ? { originalValue: job.location } : {}), message: "Choose a single city and state for this job." });
  if (!roleCategory) issues.push({ field: "roleCategory", reason: "unmapped", originalValue: [job.title, job.department].filter(Boolean).join(" / "), message: "Choose a role category for this job." });
  if (!employmentType) issues.push({ field: "employmentType", reason: job.employmentType ? "unmapped" : "missing", ...(job.employmentType ? { originalValue: job.employmentType } : {}), message: "Choose an employment type for this job." });
  if (!descriptionHtml) issues.push({ field: "description", reason: "missing", message: "Add a description in the ATS before importing this job." });

  return issues.length
    ? { status: "needs-review", providerKey: job.providerKey, externalId: job.externalId, job: prepared, issues }
    : { status: "ready", providerKey: job.providerKey, externalId: job.externalId, job: prepared };
}

const SAFE_PREVIEW_MESSAGES = {
  "discovery-failed": "We couldn't inspect that careers page. Check the URL and try again.",
  "no-job-links": "We couldn't find job links on that careers page.",
  unsupported: "That careers page uses a job system we don't support yet.",
  "retrieval-failed": "We found the job system, but couldn't retrieve the jobs right now. Please try again.",
} as const;

function defaultDependencies(): PrepareJobImportDependencies | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return { async findLocationMappings(accountId, provider, locationKeys) {
    if (!locationKeys.length) return [];
    const result = await client.from("employer_ats_location_mappings")
      .select("ats_provider,ats_location_value,ats_location_key,city,state,employer_store_id,employer_stores!inner(id,employer_account_id,city,state,active,is_assignable_location)")
      .eq("employer_account_id", accountId).eq("ats_provider", provider).in("ats_location_key", locationKeys);
    if (result.error) throw new Error("Could not load ATS location mappings.");
    return (result.data ?? []) as unknown as AtsLocationMapping[];
  } };
}

export async function prepareJobImport(input: PrepareJobImportInput, dependencies?: PrepareJobImportDependencies): Promise<PrepareJobImportResult> {
  if (!Array.isArray(input.selectedJobKeys) || input.selectedJobKeys.length === 0 || input.selectedJobKeys.length > MAX_IMPORT_SELECTION) {
    return { status: "invalid-request", message: `Select between 1 and ${MAX_IMPORT_SELECTION} jobs to import.` };
  }

  let preview: Awaited<ReturnType<typeof previewJobImport>>;
  try {
    preview = await previewJobImport(input.careersPageUrl);
  } catch {
    return { status: "discovery-failed", message: SAFE_PREVIEW_MESSAGES["discovery-failed"] };
  }
  if (preview.status !== "ready") return { status: preview.status, message: SAFE_PREVIEW_MESSAGES[preview.status] };

  let jobs = new Map(preview.jobs.map((job) => [`${normalizeProviderKey(job.providerKey)}\u0000${job.externalId}`, job]));
  const seen = new Set<string>();
  const matchedJobs = new Map<string, ImportedJob>();
  for (const selected of input.selectedJobKeys) {
    const identity = `${normalizeProviderKey(selected.providerKey)}\u0000${selected.externalId}`;
    const job = jobs.get(identity);
    if (job && normalizeProviderKey(selected.providerKey) === normalizeProviderKey(preview.providerKey)) matchedJobs.set(identity, job);
  }

  const unavailableHydration = new Set<string>();
  const provider = (dependencies?.getProvider ?? getAtsProvider)(preview.providerKey);
  if (provider?.hydrateJobs && matchedJobs.size) {
    try {
      const hydrated = await provider.hydrateJobs({ careersPage: { url: preview.sourceUrl }, jobs: [...matchedJobs.values()] });
      jobs = new Map(jobs);
      for (const result of hydrated) {
        const identity = result.status === "ready"
          ? `${normalizeProviderKey(result.job.providerKey)}\u0000${result.job.externalId}`
          : `${normalizeProviderKey(result.providerKey)}\u0000${result.externalId}`;
        if (result.status === "ready") jobs.set(identity, result.job);
        else unavailableHydration.add(identity);
      }
    } catch {
      return { status: "retrieval-failed", message: SAFE_PREVIEW_MESSAGES["retrieval-failed"] };
    }
  }

  const database = dependencies ?? defaultDependencies();
  let savedMappings: AtsLocationMapping[] = [];
  if (database && input.employerAccountId) {
    try {
      const locationKeys = [...new Set([...matchedJobs.values()].map((job) => job.location ? normalizeAtsLocationKey(job.location) : "").filter(Boolean))];
      savedMappings = await database.findLocationMappings(input.employerAccountId, normalizeProviderKey(preview.providerKey), locationKeys);
    } catch {
      return { status: "retrieval-failed", message: SAFE_PREVIEW_MESSAGES["retrieval-failed"] };
    }
  }
  const mappings = new Map(savedMappings.filter((mapping) =>
    normalizeProviderKey(mapping.ats_provider) === normalizeProviderKey(preview.providerKey) &&
    mapping.ats_location_key === normalizeAtsLocationKey(mapping.ats_location_value) &&
    mapping.employer_stores?.id === mapping.employer_store_id &&
    mapping.employer_stores.employer_account_id === input.employerAccountId &&
    mapping.employer_stores.active && mapping.employer_stores.is_assignable_location &&
    Boolean(mapping.employer_stores.city?.trim() && mapping.employer_stores.state?.trim()),
  ).map((mapping) => [mapping.ats_location_key, {
    ...mapping, city: mapping.employer_stores!.city!.trim(), state: mapping.employer_stores!.state!.trim().toUpperCase(),
  }]));
  const items = input.selectedJobKeys.map((selected): PreparedImportItem => {
    const identity = `${normalizeProviderKey(selected.providerKey)}\u0000${selected.externalId}`;
    if (seen.has(identity)) return { status: "unavailable", ...selected, message: "This job was selected more than once." };
    seen.add(identity);
    if (normalizeProviderKey(selected.providerKey) !== normalizeProviderKey(preview.providerKey)) return { status: "unavailable", ...selected, message: "This job does not belong to the job system found on the careers page." };
    const job = jobs.get(identity);
    if (!job || unavailableHydration.has(identity)) return { status: "unavailable", ...selected, message: "This job is no longer available from the careers page." };
    return prepareJob(job, job.location ? mappings.get(normalizeAtsLocationKey(job.location)) : undefined);
  });
  return {
    status: "prepared", providerKey: preview.providerKey, sourceUrl: preview.sourceUrl, items,
    summary: {
      requested: input.selectedJobKeys.length,
      ready: items.filter((item) => item.status === "ready").length,
      needsReview: items.filter((item) => item.status === "needs-review").length,
      unavailable: items.filter((item) => item.status === "unavailable").length,
    },
  };
}

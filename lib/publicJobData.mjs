export const PUBLIC_JOB_SOURCE_FIELDS = "source_type,external_apply_url,company_id";

/**
 * Normalize the ownership fields read from Supabase without allowing a legacy
 * DTO or fallback query to discard the sourced-job discriminator.
 * @param {Record<string, unknown>} record
 */
export function mapPublicJobRecord(record) {
  const sourceType = record.source_type === "rnh_sourced" ? "rnh_sourced" : "employer";
  return {
    ...record,
    source_type: sourceType,
    external_apply_url: typeof record.external_apply_url === "string" ? record.external_apply_url : null,
    company_id: typeof record.company_id === "string" ? record.company_id : null,
  };
}

/** @param {{source_type: "employer" | "rnh_sourced", external_apply_url?: string | null}} job */
export function getPublicJobApplicationMode(job) {
  return job.source_type === "rnh_sourced"
    ? { kind: "external", applyUrl: job.external_apply_url ?? null }
    : { kind: "candidate_interest", applyUrl: null };
}

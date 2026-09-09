import type { getSupabaseAdminClient } from "./supabaseAdmin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const PAID_PERIOD_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

type AnalyticsJob = Record<string, unknown> & {
  id?: unknown;
  source_type?: unknown;
  ats_provider?: unknown;
  approved_at?: unknown;
  expires_at?: unknown;
  views?: unknown;
};

export function getCurrentPaidPeriodStart(job: AnalyticsJob): Date | null {
  if (job.source_type !== "employer" || job.ats_provider != null || typeof job.expires_at !== "string") return null;

  const expiration = new Date(job.expires_at);
  if (!Number.isFinite(expiration.getTime())) return null;

  const derivedStart = new Date(expiration.getTime() - PAID_PERIOD_MILLISECONDS);
  if (typeof job.approved_at !== "string") return derivedStart;

  const approval = new Date(job.approved_at);
  // Approval is authoritative if a first-period record has a shortened or
  // otherwise nonstandard expiration. Renewed periods use expires_at - 30 days.
  return Number.isFinite(approval.getTime()) && approval > derivedStart ? approval : derivedStart;
}

export async function applyCurrentPeriodEmployerViews(
  supabaseAdmin: SupabaseAdminClient,
  jobs: AnalyticsJob[],
) {
  const periodStarts = new Map<string, Date>();
  for (const job of jobs) {
    const id = typeof job.id === "string" ? job.id : null;
    const start = getCurrentPaidPeriodStart(job);
    if (id && start) periodStarts.set(id, start);
  }

  if (periodStarts.size === 0) return jobs;

  const earliestStart = new Date(Math.min(...Array.from(periodStarts.values(), (date) => date.getTime()))).toISOString();
  const { data, error } = await supabaseAdmin
    .from("job_events")
    .select("job_id,created_at")
    .in("job_id", Array.from(periodStarts.keys()))
    .eq("source_type", "employer")
    .eq("event_type", "job_view")
    .gte("created_at", earliestStart);

  if (error) throw new Error(error.message || "Could not load current-period job views.");

  const counts = new Map<string, number>();
  for (const event of data ?? []) {
    const start = periodStarts.get(event.job_id);
    const createdAt = new Date(event.created_at);
    if (start && Number.isFinite(createdAt.getTime()) && createdAt >= start) {
      counts.set(event.job_id, (counts.get(event.job_id) ?? 0) + 1);
    }
  }

  return jobs.map((job) => {
    const id = typeof job.id === "string" ? job.id : "";
    return periodStarts.has(id) ? { ...job, views: counts.get(id) ?? 0 } : job;
  });
}

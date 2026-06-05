import { canUserAccessJob } from "./employerJobAccess";
import type { EmployerAccountContext } from "./employerAccounts";
import { isMissingViewsColumnError } from "./jobStatus";
import type { getSupabaseAdminClient } from "./supabaseAdmin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

type JobsQueryVariant = {
  fields: string;
  includesViews: boolean;
};

const JOB_QUERY_VARIANTS: JobsQueryVariant[] = [
  {
    fields: "id,title,restaurant_name,city,state,active,status,created_at,views,employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails",
    includesViews: true,
  },
  {
    fields: "id,title,restaurant_name,city,state,active,status,created_at,employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails",
    includesViews: false,
  },
];

function uniqueJobs(rows: Array<Record<string, unknown>>) {
  const jobsById = new Map<string, Record<string, unknown>>();

  rows.forEach((job) => {
    const id = String(job.id ?? "");
    if (id) jobsById.set(id, job);
  });

  return Array.from(jobsById.values()).sort((a, b) => {
    const aCreated = new Date(String(a.created_at ?? "")).getTime();
    const bCreated = new Date(String(b.created_at ?? "")).getTime();
    return bCreated - aCreated;
  });
}

export async function loadEmployerJobsForDashboard(supabaseAdmin: SupabaseAdminClient, context: EmployerAccountContext) {
  let liveJobs: Array<Record<string, unknown>> | null = null;
  let selectedVariant: JobsQueryVariant | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (const variant of JOB_QUERY_VARIANTS) {
    const queries = context.accountId
      ? [
          supabaseAdmin
            .from("jobs")
            .select(variant.fields)
            .eq("employer_account_id", context.accountId)
            .order("created_at", { ascending: false }),
        ]
      : [
          supabaseAdmin
            .from("jobs")
            .select(variant.fields)
            .eq("employer_user_id", context.ownerUserId)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("jobs")
            .select(variant.fields)
            .eq("employer_email", context.ownerEmail)
            .order("created_at", { ascending: false }),
        ];

    const results = await Promise.all(queries);
    const variantError = results.find((result) => result.error)?.error ?? null;

    if (!variantError) {
      liveJobs = uniqueJobs(results.flatMap((result) => ((result.data ?? []) as unknown) as Array<Record<string, unknown>>));
      selectedVariant = variant;
      lastError = null;
      break;
    }

    lastError = variantError;
    if (isMissingViewsColumnError(variantError)) continue;
    break;
  }

  if (lastError || !liveJobs || !selectedVariant) {
    throw new Error(lastError?.message || "Could not load employer job listings.");
  }

  return { jobs: liveJobs, includesViews: selectedVariant.includesViews };
}

export function filterEmployerVisibleJobs(user: { email: string }, context: EmployerAccountContext, jobs: Array<Record<string, unknown>>) {
  return jobs.filter((job) =>
    canUserAccessJob(
      { email: user.email, userType: context.userType, assignedStoreIds: context.assignedStoreIds },
      context.role,
      job,
    ),
  );
}

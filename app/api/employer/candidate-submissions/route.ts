import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { canUserAccessJob } from "../../../../lib/employerJobAccess";
import { filterEmployerVisibleJobs, loadEmployerJobsForDashboard } from "../../../../lib/employerVisibleJobs";

const ALLOWED_STATUSES = new Set(["new", "reviewed", "contacted", "archived"]);

const CANDIDATE_SUBMISSION_SELECT = "id,job_id,employer_user_id,employer_email,candidate_name,candidate_email,candidate_phone,message,resume_filename,status,created_at,jobs!inner(title,restaurant_name,city,state,role_category,employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails)";

function uniqueSubmissionRows(rows: Array<Record<string, unknown>>) {
  const rowsById = new Map<string, Record<string, unknown>>();

  rows.forEach((row) => {
    const id = String(row.id ?? "");
    if (id) rowsById.set(id, row);
  });

  return Array.from(rowsById.values()).sort((a, b) => {
    const aCreated = new Date(String(a.created_at ?? "")).getTime();
    const bCreated = new Date(String(b.created_at ?? "")).getTime();
    return bCreated - aCreated;
  });
}

function serializeSubmission(row: Record<string, unknown>) {
  const job = row.jobs && typeof row.jobs === "object" ? (row.jobs as Record<string, unknown>) : null;
  return {
    id: String(row.id ?? ""),
    job_id: String(row.job_id ?? ""),
    candidate_name: String(row.candidate_name ?? ""),
    candidate_email: String(row.candidate_email ?? ""),
    candidate_phone: String(row.candidate_phone ?? ""),
    message: typeof row.message === "string" ? row.message : null,
    resume_filename: typeof row.resume_filename === "string" ? row.resume_filename : null,
    status: typeof row.status === "string" ? row.status : "new",
    created_at: String(row.created_at ?? ""),
    job_title: typeof job?.title === "string" ? job.title : "Untitled job",
    restaurant_name: typeof job?.restaurant_name === "string" ? job.restaurant_name : null,
    city: typeof job?.city === "string" ? job.city : null,
    state: typeof job?.state === "string" ? job.state : null,
    role_category: typeof job?.role_category === "string" ? job.role_category : null,
  };
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canViewCandidates) return NextResponse.json({ error: "Not authorized to view candidates." }, { status: 403 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { jobs } = await loadEmployerJobsForDashboard(supabaseAdmin, context);
    const visibleJobs = filterEmployerVisibleJobs(user, context, jobs);
    const visibleJobIds = Array.from(new Set(visibleJobs.map((job) => String(job.id ?? "").trim()).filter(Boolean)));

    if (visibleJobIds.length === 0) {
      return NextResponse.json({ candidates: [] });
    }

    const candidateQueries = chunkValues(visibleJobIds, 100).map((jobIds) =>
      supabaseAdmin
        .from("candidate_submissions")
        .select(CANDIDATE_SUBMISSION_SELECT)
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(500),
    );

    const candidateResults = await Promise.all(candidateQueries);
    const queryError = candidateResults.find((result) => result.error)?.error ?? null;
    if (queryError) throw new Error(queryError.message || "Could not load candidate submissions.");

    const visibleJobIdSet = new Set(visibleJobIds);
    const candidateRows = uniqueSubmissionRows(candidateResults.flatMap((result) => (result.data ?? []) as Array<Record<string, unknown>>));
    const visibleRows = candidateRows.filter((row) => visibleJobIdSet.has(String(row.job_id ?? "")));

    return NextResponse.json({ candidates: visibleRows.map((row) => serializeSubmission(row as Record<string, unknown>)) });
  } catch (error) {
    console.error("Employer candidate submissions load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load candidate submissions." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canUpdateCandidateStatuses) return NextResponse.json({ error: "Not authorized to update candidates." }, { status: 403 });

    const payload = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
    const id = payload?.id?.trim();
    const status = payload?.status?.trim().toLowerCase();

    if (!id || !status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Choose a valid candidate status." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("candidate_submissions")
      .select("id,employer_user_id,employer_email,jobs!inner(employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails)")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message || "Could not load candidate submission.");
    const row = existing as Record<string, unknown> | null;
    const job = row?.jobs && typeof row.jobs === "object" ? (row.jobs as Record<string, unknown>) : null;
    const ownsSubmission =
      row?.employer_user_id === user.id ||
      row?.employer_user_id === context.ownerUserId ||
      String(row?.employer_email ?? "").toLowerCase() === user.email.toLowerCase() ||
      String(row?.employer_email ?? "").toLowerCase() === context.ownerEmail.toLowerCase() ||
      job?.employer_user_id === user.id ||
      job?.employer_user_id === context.ownerUserId ||
      String(job?.employer_email ?? "").toLowerCase() === user.email.toLowerCase() ||
      String(job?.employer_email ?? "").toLowerCase() === context.ownerEmail.toLowerCase() ||
      (context.accountId && job?.employer_account_id === context.accountId);

    if (!row || !ownsSubmission || !canUserAccessJob({ email: user.email, userType: context.userType, assignedStoreIds: context.assignedStoreIds }, context.role, job)) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("candidate_submissions")
      .update({ status })
      .eq("id", id)
      .select("id,status")
      .single();

    if (error) throw new Error(error.message || "Could not update candidate status.");
    return NextResponse.json({ candidate: data });
  } catch (error) {
    console.error("Employer candidate status update failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update candidate status." },
      { status: 500 },
    );
  }
}

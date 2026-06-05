import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { canUserAccessJob } from "../../../../lib/employerJobAccess";

const ALLOWED_STATUSES = new Set(["new", "reviewed", "contacted", "archived"]);

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
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canViewCandidates) return NextResponse.json({ error: "Not authorized to view candidates." }, { status: 403 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("candidate_submissions")
      .select("id,job_id,employer_user_id,employer_email,candidate_name,candidate_email,candidate_phone,message,resume_filename,status,created_at,jobs!inner(title,restaurant_name,city,state,employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message || "Could not load candidate submissions.");

    const userEmail = user.email.toLowerCase();
    const visibleRows = (data ?? []).filter((entry) => {
      const row = entry as Record<string, unknown>;
      const job = row.jobs && typeof row.jobs === "object" ? (row.jobs as Record<string, unknown>) : null;
      const belongsToEmployerAccount = Boolean(
        row.employer_user_id === user.id ||
        row.employer_user_id === context.ownerUserId ||
        String(row.employer_email ?? "").toLowerCase() === userEmail ||
        String(row.employer_email ?? "").toLowerCase() === context.ownerEmail.toLowerCase() ||
        job?.employer_user_id === user.id ||
        job?.employer_user_id === context.ownerUserId ||
        String(job?.employer_email ?? "").toLowerCase() === userEmail ||
        String(job?.employer_email ?? "").toLowerCase() === context.ownerEmail.toLowerCase() ||
        (context.accountId && job?.employer_account_id === context.accountId)
      );

      // Team Members/Viewers are location/email-scoped by the job's candidate interest email field.
      return belongsToEmployerAccount && canUserAccessJob({ email: user.email, userType: context.userType, assignedStoreIds: context.assignedStoreIds }, context.role, job);
    });

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

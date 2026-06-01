import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";
import { getEmployerAccountContext } from "../../../../../../lib/employerAccounts";
import { canUserAccessJob } from "../../../../../../lib/employerJobAccess";

const RESUME_BUCKET = "candidate-resumes";

type RouteContext = { params: { id?: string } | Promise<{ id?: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const accountContext = await getEmployerAccountContext(user);
    if (!accountContext.canViewCandidates) return NextResponse.json({ error: "Not authorized to view candidates." }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const id = params.id?.trim();
    if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("candidate_submissions")
      .select("id,resume_path,employer_user_id,employer_email,jobs!inner(employer_user_id,employer_email,employer_account_id,candidate_notification_email,candidate_notification_emails)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message || "Could not load resume.");
    const row = data as Record<string, unknown> | null;
    const job = row?.jobs && typeof row.jobs === "object" ? (row.jobs as Record<string, unknown>) : null;
    const resumePath = typeof row?.resume_path === "string" ? row.resume_path : "";
    const ownsSubmission =
      row?.employer_user_id === user.id ||
      row?.employer_user_id === accountContext.ownerUserId ||
      String(row?.employer_email ?? "").toLowerCase() === user.email.toLowerCase() ||
      String(row?.employer_email ?? "").toLowerCase() === accountContext.ownerEmail.toLowerCase() ||
      job?.employer_user_id === user.id ||
      job?.employer_user_id === accountContext.ownerUserId ||
      String(job?.employer_email ?? "").toLowerCase() === user.email.toLowerCase() ||
      String(job?.employer_email ?? "").toLowerCase() === accountContext.ownerEmail.toLowerCase() ||
      (accountContext.accountId && job?.employer_account_id === accountContext.accountId);

    if (!row || !ownsSubmission || !canUserAccessJob(user, accountContext.role, job) || !resumePath) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const { data: signed, error: signedUrlError } = await supabaseAdmin.storage
      .from(RESUME_BUCKET)
      .createSignedUrl(resumePath, 60 * 5);

    if (signedUrlError || !signed?.signedUrl) throw new Error(signedUrlError?.message || "Could not create resume link.");

    return NextResponse.json({ url: signed.signedUrl });
  } catch (error) {
    console.error("Employer candidate resume link failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create resume link." },
      { status: 500 },
    );
  }
}

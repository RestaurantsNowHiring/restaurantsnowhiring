import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../../../lib/adminAuth";
import { isMissingApprovedAtColumnError, isMissingStatusColumnError } from "../../../../../../lib/jobStatus";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";
import { evaluateBillingAccess, getBillingRecord, syncSubscriptionQuantityForEmployer } from "../../../../../../lib/billing";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const jobId = id?.trim();

  if (!jobId) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);
  if (!adminCheck.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: adminCheck.code === "not_admin" ? 403 : 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 }
    );
  }

  const { data: jobOwner, error: ownerError } = await supabaseAdmin
    .from("jobs")
    .select("employer_user_id,employer_email")
    .eq("id", jobId)
    .maybeSingle();

  if (ownerError) {
    return NextResponse.json({ error: ownerError.message || "Could not verify job owner before approval." }, { status: 500 });
  }

  const employerUserId = typeof jobOwner?.employer_user_id === "string" ? jobOwner.employer_user_id : null;
  if (!employerUserId) {
    return NextResponse.json(
      { error: "This job is missing employer_user_id, so billing cannot be verified before approval." },
      { status: 409 },
    );
  }

  const billing = await getBillingRecord(employerUserId);
  const billingAccess = evaluateBillingAccess(billing);
  if (!billingAccess.allowed) {
    return NextResponse.json(
      { error: "Employer billing is not active. Ask the employer to start or reactivate billing before approving this job." },
      { status: 402 },
    );
  }

  const approvedAt = new Date().toISOString();
  const updateWithStatusAndApprovedAt = await supabaseAdmin
    .from("jobs")
    .update({ active: true, status: "active", approved_at: approvedAt })
    .eq("id", jobId);

  let updateResult = updateWithStatusAndApprovedAt;

  if (isMissingApprovedAtColumnError(updateWithStatusAndApprovedAt.error)) {
    updateResult = await supabaseAdmin.from("jobs").update({ active: true, status: "active" }).eq("id", jobId);
  }

  const { error } = isMissingStatusColumnError(updateResult.error)
    ? await supabaseAdmin.from("jobs").update({ active: true }).eq("id", jobId)
    : updateResult;

  if (error) {
    return NextResponse.json({ error: error.message || "Approval update failed." }, { status: 500 });
  }

  await syncSubscriptionQuantityForEmployer(employerUserId).catch((syncError) => {
    console.error("Failed to sync Stripe quantity after approval", { syncError, jobId, employerUserId });
  });

  return NextResponse.json({ ok: true });
}

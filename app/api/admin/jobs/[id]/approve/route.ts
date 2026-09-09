import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../../../lib/adminAuth";
import { isMissingApprovedAtColumnError, isMissingStatusColumnError } from "../../../../../../lib/jobStatus";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";
import { evaluateBillingAccess, getBillingRecord, syncSubscriptionQuantityForEmployer } from "../../../../../../lib/billing";
import { getDefaultJobExpirationIso } from "../../../../../../lib/jobListingDuration";

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
    .select("id,source_type,active,status,approved_at,expires_at,employer_user_id,employer_email")
    .eq("id", jobId)
    .maybeSingle();

  if (ownerError) {
    return NextResponse.json({ error: ownerError.message || "Could not verify job owner before approval." }, { status: 500 });
  }

  if (jobOwner?.source_type === "outreach_free") {
    const alreadyApproved = jobOwner.active === true
      && jobOwner.status === "active"
      && typeof jobOwner.approved_at === "string"
      && typeof jobOwner.expires_at === "string";

    if (alreadyApproved) {
      return NextResponse.json({ ok: true, job: jobOwner });
    }

    if (jobOwner.active !== false || jobOwner.status !== "pending" || jobOwner.approved_at !== null || jobOwner.expires_at !== null) {
      return NextResponse.json({ error: "Only a valid pending Free First Job can be approved." }, { status: 409 });
    }

    const approvedAt = new Date();
    const promotionalUpdate = await supabaseAdmin
      .from("jobs")
      .update({
        active: true,
        status: "active",
        approved_at: approvedAt.toISOString(),
        expires_at: getDefaultJobExpirationIso(approvedAt),
      })
      .eq("id", jobId)
      .eq("source_type", "outreach_free")
      .eq("active", false)
      .eq("status", "pending")
      .is("approved_at", null)
      .is("expires_at", null)
      .select("id,source_type,active,status,approved_at,expires_at")
      .maybeSingle();

    if (promotionalUpdate.error) {
      return NextResponse.json({ error: promotionalUpdate.error.message || "Approval update failed." }, { status: 500 });
    }
    if (promotionalUpdate.data) {
      return NextResponse.json({ ok: true, job: promotionalUpdate.data });
    }

    // A concurrent approval may have won the conditional update. Return its
    // original approval window rather than creating or extending another one.
    const concurrent = await supabaseAdmin
      .from("jobs")
      .select("id,source_type,active,status,approved_at,expires_at")
      .eq("id", jobId)
      .maybeSingle();
    if (concurrent.error) {
      return NextResponse.json({ error: concurrent.error.message || "Could not confirm approval state." }, { status: 500 });
    }
    if (concurrent.data?.source_type === "outreach_free"
      && concurrent.data.active === true
      && concurrent.data.status === "active"
      && typeof concurrent.data.approved_at === "string"
      && typeof concurrent.data.expires_at === "string") {
      return NextResponse.json({ ok: true, job: concurrent.data });
    }
    return NextResponse.json({ error: "The Free First Job changed state before it could be approved." }, { status: 409 });
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

  const approvedAt = new Date();
  const updateWithStatusAndApprovedAt = await supabaseAdmin
    .from("jobs")
    .update({ active: true, status: "active", approved_at: approvedAt.toISOString(), expires_at: getDefaultJobExpirationIso(approvedAt) })
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

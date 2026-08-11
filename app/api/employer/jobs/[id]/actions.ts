import { NextResponse } from "next/server";
import { evaluateBillingAccess, getAuthUserFromRequest, getBillingRecord, syncSubscriptionQuantityForEmployer } from "../../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../../lib/employerAccounts";
import { canUserAccessJob } from "../../../../../lib/employerJobAccess";
import { getDefaultJobExpirationIso } from "../../../../../lib/jobListingDuration";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

const JOB_FIELDS = "id,title,restaurant_name,city,state,active,status,source_type,ats_inactive_reason,created_at,expires_at,employer_user_id,employer_email,employer_account_id,employer_store_id,candidate_notification_email,candidate_notification_emails";
const BILLING_WARNING = "The job status was updated, but we could not confirm the billing update. Please retry billing sync or contact support if the issue continues.";

type Action = "pause" | "resume" | "renew";

function expired(expiresAt: string | null | undefined) {
  if (!expiresAt) return true;
  const time = new Date(expiresAt).getTime();
  return !Number.isFinite(time) || time <= Date.now();
}

export async function handleEmployerJobAction(request: Request, context: { params: Promise<{ id: string }> }, action: Action) {
  try {
    const { id } = await context.params;
    const jobId = id?.trim();
    if (!jobId) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const accountContext = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!accountContext.canManageJobs) return NextResponse.json({ error: "Your employer role cannot manage jobs." }, { status: 403 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: job, error: loadError } = await supabaseAdmin.from("jobs").select(JOB_FIELDS).eq("id", jobId).maybeSingle();
    if (loadError) throw new Error(loadError.message || "Could not load job.");
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    if (!canUserAccessJob({ email: user.email, userType: accountContext.userType, assignedStoreIds: accountContext.assignedStoreIds }, accountContext.role, job)) {
      return NextResponse.json({ error: "You do not have permission to manage this job." }, { status: 403 });
    }

    if ((action === "resume" || action === "renew")) {
      const billing = await getBillingRecord(accountContext.ownerUserId);
      const billingAccess = evaluateBillingAccess(billing);
      if (!billingAccess.allowed) return NextResponse.json({ error: "Start or reactivate billing before reactivating this job ad." }, { status: 402 });
    }

    if (action === "resume" && expired(job.expires_at as string | null)) {
      return NextResponse.json({ error: "This paused job's listing period has ended. Use Renew & Reactivate to start a new 30-day listing period.", code: "renew_required" }, { status: 409 });
    }

    const update = action === "pause"
      ? { active: false, status: "paused", ...(job.source_type === "ats" ? { ats_inactive_reason: "employer_deactivated" } : {}) }
      : action === "resume"
        ? { active: true, status: "active", ...(job.source_type === "ats" ? { ats_inactive_reason: null } : {}) }
        : { active: true, status: "active", expires_at: getDefaultJobExpirationIso(), ...(job.source_type === "ats" ? { ats_inactive_reason: null } : {}) };

    const { data: updatedJob, error: updateError } = await supabaseAdmin.from("jobs").update(update).eq("id", jobId).select(JOB_FIELDS).single();
    if (updateError) throw new Error(updateError.message || "Could not update job status.");

    let billingWarning: string | null = null;
    try {
      await syncSubscriptionQuantityForEmployer(accountContext.ownerUserId);
    } catch (syncError) {
      billingWarning = BILLING_WARNING;
      console.error("Failed to sync Stripe quantity after employer job action", { syncError, jobId, employerUserId: accountContext.ownerUserId, action });
    }

    return NextResponse.json({ ok: true, job: updatedJob, billing: { synced: !billingWarning, warning: billingWarning } });
  } catch (error) {
    console.error("Employer job action failed", { error, action });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update job." }, { status: 500 });
  }
}

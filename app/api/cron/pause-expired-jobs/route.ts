import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import {
  ExpirationEmailJob,
  SupabaseAdminLike,
  sendExpirationReminderBatch,
} from "../../../../lib/jobExpirationEmails";
import { syncSubscriptionQuantityForEmployer } from "../../../../lib/billing";

type PauseExpiredJobsRpcResult = {
  paused_count?: number;
};

type ReminderCounts = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

const JOB_EMAIL_FIELDS = "id,title,restaurant_name,city,state,employer_email,employer_user_id,employer_account_id,posted_by_email,apply_email,candidate_notification_email,candidate_notification_emails,candidate_notification_routing,approved_at,created_at";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const headerToken = request.headers.get("x-cron-secret")?.trim() ?? "";
  const queryToken = new URL(request.url).searchParams.get("secret")?.trim() ?? "";

  return bearerToken === cronSecret || headerToken === cronSecret || queryToken === cronSecret;
}

function sumReminderCounts(...counts: ReminderCounts[]): ReminderCounts {
  return counts.reduce(
    (totals, count) => ({
      attempted: totals.attempted + count.attempted,
      sent: totals.sent + count.sent,
      skipped: totals.skipped + count.skipped,
      failed: totals.failed + count.failed,
    }),
    { attempted: 0, sent: 0, skipped: 0, failed: 0 },
  );
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function fetchActiveApprovedJobsInWindow(
  supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  fromApprovedAt: string,
  toApprovedAt: string,
) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(JOB_EMAIL_FIELDS)
    .eq("status", "active")
    .eq("active", true)
    .not("approved_at", "is", null)
    .gte("approved_at", fromApprovedAt)
    .lt("approved_at", toApprovedAt)
    .order("approved_at", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch expiration reminder jobs.");
  return (data ?? []) as ExpirationEmailJob[];
}

async function fetchExpiredActiveApprovedJobs(
  supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  expiresBeforeApprovedAt: string,
) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(JOB_EMAIL_FIELDS)
    .eq("status", "active")
    .eq("active", true)
    .not("approved_at", "is", null)
    .lte("approved_at", expiresBeforeApprovedAt)
    .order("approved_at", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch expired jobs.");
  return (data ?? []) as ExpirationEmailJob[];
}

async function pauseExpiredJobs(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const fiveDayReminderJobs = await fetchActiveApprovedJobsInWindow(
      supabaseAdmin,
      daysAgo(26),
      daysAgo(25),
    );
    const oneDayReminderJobs = await fetchActiveApprovedJobsInWindow(
      supabaseAdmin,
      daysAgo(30),
      daysAgo(29),
    );
    const jobsDueToPause = await fetchExpiredActiveApprovedJobs(supabaseAdmin, daysAgo(30));

    const expirationEmailClient = supabaseAdmin as unknown as SupabaseAdminLike;
    const fiveDayEmails = await sendExpirationReminderBatch(expirationEmailClient, fiveDayReminderJobs, "five_day");
    const oneDayEmails = await sendExpirationReminderBatch(expirationEmailClient, oneDayReminderJobs, "one_day");

    const { data, error } = await supabaseAdmin.rpc("pause_expired_job_ads");

    if (error) {
      return NextResponse.json({ error: error.message || "Expired job pause failed." }, { status: 500 });
    }

    const autoPausedEmails = await sendExpirationReminderBatch(expirationEmailClient, jobsDueToPause, "auto_paused");
    const employerUserIds = Array.from(
      new Set(
        jobsDueToPause.flatMap((job) => {
          const employerUserId = (job as unknown as { employer_user_id?: unknown }).employer_user_id;
          return typeof employerUserId === "string" && employerUserId ? [employerUserId] : [];
        }),
      ),
    );

    await Promise.all(
      employerUserIds.map((employerUserId) =>
        syncSubscriptionQuantityForEmployer(employerUserId).catch((syncError) => {
          console.error("Failed to sync Stripe quantity after auto-pause", { syncError, employerUserId });
        }),
      ),
    );

    const rpcResult = Array.isArray(data) ? (data[0] as PauseExpiredJobsRpcResult | undefined) : null;
    const pausedCount = typeof rpcResult?.paused_count === "number" ? rpcResult.paused_count : 0;

    const reminderTotals = sumReminderCounts(fiveDayEmails, oneDayEmails, autoPausedEmails);

    return NextResponse.json({
      ok: true,
      reminders_attempted: reminderTotals.attempted,
      reminders_sent: reminderTotals.sent,
      reminders_skipped: reminderTotals.skipped,
      reminders_failed: reminderTotals.failed,
      jobs_auto_paused: pausedCount,
      paused_count: pausedCount,
      reminders: {
        five_day: fiveDayEmails,
        one_day: oneDayEmails,
        auto_paused: autoPausedEmails,
      },
    });
  } catch (error) {
    console.error("Expired job cron failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Expired job cron failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return pauseExpiredJobs(request);
}

export async function POST(request: Request) {
  return pauseExpiredJobs(request);
}

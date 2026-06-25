import { EMAIL_PATTERN, normalizeCandidateNotificationEmails } from "./candidateNotificationEmails";
import { absoluteUrl } from "./seo";

export type ExpirationReminderType = "five_day" | "one_day" | "auto_paused";

export type ExpirationEmailJob = {
  id: string;
  title: string | null;
  restaurant_name?: string | null;
  city: string | null;
  state: string | null;
  employer_email: string | null;
  employer_account_id?: string | null;
  posted_by_email?: string | null;
  apply_email?: string | null;
  candidate_notification_email?: string | string[] | null;
  candidate_notification_emails?: string[] | string | null;
  candidate_notification_routing?: string | null;
  approved_at: string | null;
  created_at?: string | null;
};

type SupabaseEmailEventQuery = {
  eq: (column: string, value: string) => SupabaseEmailEventQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

type SupabaseEmailEventTable = {
  select: (fields: string) => SupabaseEmailEventQuery;
  insert: (payload: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;
};

type SupabaseTeamMemberQuery = {
  in: (column: string, values: string[]) => SupabaseTeamMemberQuery;
  eq: (column: string, value: string) => SupabaseTeamMemberQuery;
  returns: <T>() => Promise<{ data: T | null; error: { message?: string } | null }>;
};

type SupabaseTeamMemberTable = {
  select: (fields: string) => SupabaseTeamMemberQuery;
};

export type SupabaseAdminLike = {
  from: {
    (table: "job_expiration_email_events"): SupabaseEmailEventTable;
    (table: "employer_team_members"): SupabaseTeamMemberTable;
  };
};


export type ExpirationEmailSendResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

const EVENT_TYPE_LABELS: Record<ExpirationReminderType, string> = {
  five_day: "5-day expiration reminder",
  one_day: "1-day expiration reminder",
  auto_paused: "auto-pause notice",
};

function normalizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLocation(job: ExpirationEmailJob) {
  const city = job.city?.trim();
  const state = job.state?.trim();
  return [city, state].filter(Boolean).join(", ") || "Location not provided";
}

function formatExpirationDate(job: ExpirationEmailJob) {
  const baseDate = job.approved_at ?? job.created_at;
  if (!baseDate) return "soon";

  const expiresAt = new Date(baseDate);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(expiresAt);
}

function getSubject(type: ExpirationReminderType, jobTitle: string) {
  if (type === "five_day") return `Your job ad expires in 5 days: ${jobTitle}`;
  if (type === "one_day") return `Your job ad expires tomorrow: ${jobTitle}`;
  return `Your job ad was auto-paused: ${jobTitle}`;
}

function getIntro(type: ExpirationReminderType, expirationDate: string) {
  if (type === "five_day") {
    return `Your approved job ad is scheduled to auto-pause on ${expirationDate}.`;
  }

  if (type === "one_day") {
    return `Your approved job ad is scheduled to auto-pause tomorrow, ${expirationDate}.`;
  }

  return "Your job ad reached its 30-day active window and has been auto-paused.";
}

function buildEmailHtml(type: ExpirationReminderType, job: ExpirationEmailJob) {
  const jobTitle = escapeHtml(normalizeText(job.title, "Restaurant job"));
  const restaurantName = escapeHtml(normalizeText(job.restaurant_name, "Restaurants Now Hiring"));
  const location = escapeHtml(formatLocation(job));
  const manageUrl = absoluteUrl("/employer-dashboard");
  const expirationDate = escapeHtml(formatExpirationDate(job));
  const intro = escapeHtml(getIntro(type, expirationDate));
  const eyebrow = type === "auto_paused" ? "Job auto-paused" : "Expiration reminder";
  const buttonLabel = type === "auto_paused" ? "Reactivate or Manage Jobs" : "Manage This Job";

  return `
  <div style="margin:0;padding:0;background:#f6f5f3;font-family:Inter,Arial,sans-serif;color:#1f1f1f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5f3;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid rgba(0,0,0,.10);border-radius:22px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.08);">
            <tr>
              <td style="background:#35806e;color:#ffffff;padding:22px 24px;">
                <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;opacity:.9;">Restaurants Now Hiring</div>
                <div style="font-size:28px;line-height:1.1;font-weight:900;margin-top:6px;">${eyebrow}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;font-weight:700;color:rgba(0,0,0,.72);">${intro}</p>
                <div style="border:1px solid rgba(53,128,110,.18);background:rgba(53,128,110,.08);border-radius:18px;padding:18px;margin:18px 0;">
                  <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#35806e;">Job ad</div>
                  <div style="font-size:22px;line-height:1.25;font-weight:900;color:#202020;margin-top:6px;">${jobTitle}</div>
                  <div style="font-size:15px;line-height:1.5;font-weight:700;color:rgba(0,0,0,.68);margin-top:8px;">${restaurantName} • ${location}</div>
                </div>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;font-weight:700;color:rgba(0,0,0,.68);">Only active approved public ads are billable. You can pause, remove, or reactivate jobs anytime from your employer dashboard.</p>
                <a href="${manageUrl}" style="display:inline-block;background:#35806e;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 18px;font-size:15px;font-weight:900;">${buttonLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;line-height:1.5;color:rgba(0,0,0,.55);font-weight:700;">
                You are receiving this account email because this job was submitted through RestaurantsNowHiring.com.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function buildEmailText(type: ExpirationReminderType, job: ExpirationEmailJob) {
  const jobTitle = normalizeText(job.title, "Restaurant job");
  const location = formatLocation(job);
  const expirationDate = formatExpirationDate(job);
  const intro = getIntro(type, expirationDate);

  return [
    "Restaurants Now Hiring",
    EVENT_TYPE_LABELS[type],
    "",
    intro,
    "",
    `Job: ${jobTitle}`,
    `Location: ${location}`,
    "",
    `Manage or reactivate jobs: ${absoluteUrl("/employer-dashboard")}`,
  ].join("\n");
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || (error?.message ?? "").toLowerCase().includes("duplicate key");
}

async function wasReminderAlreadySent(
  supabaseAdmin: SupabaseAdminLike,
  jobId: string,
  reminderType: ExpirationReminderType,
) {
  const { data, error } = await supabaseAdmin
    .from("job_expiration_email_events")
    .select("id")
    .eq("job_id", jobId)
    .eq("reminder_type", reminderType)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message || "Failed to check expiration email event.");
  }

  return !!data;
}

async function recordReminderSent(
  supabaseAdmin: SupabaseAdminLike,
  jobId: string,
  reminderType: ExpirationReminderType,
) {
  const { error } = await supabaseAdmin.from("job_expiration_email_events").insert({
    job_id: jobId,
    reminder_type: reminderType,
  });

  if (isUniqueViolation(error)) return false;
  if (error) throw new Error(error.message || "Failed to record expiration email event.");
  return true;
}

type EmployerTeamMemberEmailRow = {
  account_id: string | null;
  email: string | null;
};

function addValidUniqueEmail(recipients: string[], candidate: string | null | undefined, context: Record<string, unknown>) {
  const email = candidate?.trim().toLowerCase();
  if (!email) return;

  if (!EMAIL_PATTERN.test(email)) {
    console.warn("Skipping invalid expiration reminder recipient", { ...context, email });
    return;
  }

  if (!recipients.includes(email)) recipients.push(email);
}

export async function fetchActiveAccountOwnerEmailsByAccount(
  supabaseAdmin: SupabaseAdminLike,
  accountIds: string[],
) {
  const uniqueAccountIds = Array.from(new Set(accountIds.map((id) => id.trim()).filter(Boolean)));
  const emailsByAccount = new Map<string, string[]>();
  if (uniqueAccountIds.length === 0) return emailsByAccount;

  const { data, error } = await supabaseAdmin
    .from("employer_team_members")
    .select("account_id,email")
    .in("account_id", uniqueAccountIds)
    .eq("role", "account_owner")
    .eq("status", "active")
    .returns<EmployerTeamMemberEmailRow[]>();

  if (error) throw new Error(error.message || "Failed to fetch active account owner emails.");

  for (const row of data ?? []) {
    if (!row.account_id) continue;
    const accountEmails = emailsByAccount.get(row.account_id) ?? [];
    addValidUniqueEmail(accountEmails, row.email, { accountId: row.account_id, source: "account_owner" });
    emailsByAccount.set(row.account_id, accountEmails);
  }

  return emailsByAccount;
}

function resolveCandidateRoutingEmails(job: ExpirationEmailJob, accountOwnerEmails: string[]) {
  const routing = job.candidate_notification_routing || "job_poster";
  const customEmails = normalizeCandidateNotificationEmails(
    normalizeCandidateNotificationEmails(job.candidate_notification_emails).length > 0
      ? job.candidate_notification_emails
      : job.candidate_notification_email,
  );

  if (routing === "custom_job_email" && customEmails.length > 0) return customEmails;
  if (routing === "account_owner") return [...accountOwnerEmails, job.employer_email, job.apply_email];
  if (routing === "company_support") return [job.apply_email, job.employer_email];
  if (routing === "custom_job_email") return [job.apply_email, job.employer_email];
  return [job.posted_by_email, job.apply_email, job.employer_email];
}

export function resolveExpirationRecipientEmails(job: ExpirationEmailJob, accountOwnerEmails: string[] = []) {
  const recipients: string[] = [];
  const context = { jobId: job.id };

  for (const email of accountOwnerEmails) addValidUniqueEmail(recipients, email, { ...context, source: "account_owner" });
  for (const email of resolveCandidateRoutingEmails(job, accountOwnerEmails)) {
    addValidUniqueEmail(recipients, email, { ...context, source: "candidate_notification_routing" });
  }
  addValidUniqueEmail(recipients, job.posted_by_email ?? job.employer_email, { ...context, source: "original_poster" });

  return recipients;
}

async function sendResendEmail(type: ExpirationReminderType, job: ExpirationEmailJob, recipients: string[]) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.EXPIRATION_REMINDER_FROM ??
    process.env.CONTACT_NOTIFICATION_FROM ??
    "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";

  if (!resendApiKey) throw new Error("Missing RESEND_API_KEY.");
  if (recipients.length === 0) throw new Error("Missing expiration reminder recipients.");

  const jobTitle = normalizeText(job.title, "Restaurant job");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject: getSubject(type, jobTitle),
      text: buildEmailText(type, job),
      html: buildEmailHtml(type, job),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend request failed with status ${response.status}: ${details}`);
  }
}

export async function sendExpirationReminderBatch(
  supabaseAdmin: SupabaseAdminLike,
  jobs: ExpirationEmailJob[],
  reminderType: ExpirationReminderType,
): Promise<ExpirationEmailSendResult> {
  const result: ExpirationEmailSendResult = {
    attempted: jobs.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const accountOwnerEmailsByAccount = await fetchActiveAccountOwnerEmailsByAccount(
    supabaseAdmin,
    jobs.flatMap((job) => (job.employer_account_id ? [job.employer_account_id] : [])),
  );

  for (const job of jobs) {
    try {
      const recipients = resolveExpirationRecipientEmails(
        job,
        job.employer_account_id ? accountOwnerEmailsByAccount.get(job.employer_account_id) ?? [] : [],
      );

      if (recipients.length === 0) {
        result.skipped += 1;
        continue;
      }

      if (await wasReminderAlreadySent(supabaseAdmin, job.id, reminderType)) {
        result.skipped += 1;
        continue;
      }

      await sendResendEmail(reminderType, job, recipients);
      const recorded = await recordReminderSent(supabaseAdmin, job.id, reminderType);

      if (recorded) result.sent += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Expiration reminder email failed", {
        jobId: job.id,
        reminderType,
        error,
      });
    }
  }

  return result;
}

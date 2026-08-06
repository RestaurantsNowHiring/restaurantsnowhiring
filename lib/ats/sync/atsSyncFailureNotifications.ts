import "server-only";

import { buildBrandedEmailHtml, buildBrandedEmailText } from "../../emailTemplates";
import { getSupabaseAdminClient } from "../../supabaseAdmin";
import type { RunEmployerAtsSyncResult } from "./runEmployerAtsSync";

const FAILURE_THRESHOLD = 3;
const SUBJECT = "We're having trouble syncing your jobs";

type DbResult<T> = { data: T | null; error: unknown | null };
type Connection = { id: string; employer_account_id: string; consecutive_failure_count: number; failure_notification_sent_at: string | null };
type Owner = { email: string | null; role: string | null };

export type AtsSyncFailureNotificationDatabase = {
  getConnection(connectionId: string): Promise<DbResult<Connection>>;
  listAccountOwners(accountId: string): Promise<DbResult<Owner[]>>;
  markNotificationSent(connectionId: string, sentAt: string): Promise<DbResult<{ id: string }>>;
  clearNotificationSent(connectionId: string, clearedAt: string): Promise<DbResult<{ id: string }>>;
};

export type AtsSyncFailureNotificationMailer = (input: { to: string[]; subject: string; text: string; html: string }) => Promise<{ ok: boolean }>;
export type AtsSyncFailureNotificationDependencies = { database?: AtsSyncFailureNotificationDatabase | null; mailer?: AtsSyncFailureNotificationMailer; now?: () => Date };
export type AtsSyncFailureNotificationResult = { status: "sent" | "skipped" | "failed" | "reset"; reason?: string };

function defaultDatabase(): AtsSyncFailureNotificationDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async getConnection(connectionId) {
      return await client.from("employer_ats_connections").select("id,employer_account_id,consecutive_failure_count,failure_notification_sent_at").eq("id", connectionId).maybeSingle() as DbResult<Connection>;
    },
    async listAccountOwners(accountId) {
      return await client.from("employer_team_members").select("email,role").eq("account_id", accountId).eq("role", "account_owner") as DbResult<Owner[]>;
    },
    async markNotificationSent(connectionId, sentAt) {
      return await client.from("employer_ats_connections").update({ failure_notification_sent_at: sentAt, updated_at: sentAt }).eq("id", connectionId).is("failure_notification_sent_at", null).select("id").maybeSingle() as DbResult<{ id: string }>;
    },
    async clearNotificationSent(connectionId, clearedAt) {
      return await client.from("employer_ats_connections").update({ failure_notification_sent_at: null, updated_at: clearedAt }).eq("id", connectionId).select("id").maybeSingle() as DbResult<{ id: string }>;
    },
  };
}

function uniqueValidEmails(rows: Owner[]) {
  const emails = new Set<string>();
  for (const row of rows) {
    if (row.role !== "account_owner") continue;
    const email = row.email?.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) emails.add(email);
  }
  return [...emails];
}

function emailContent() {
  const intro = "Automatic synchronization for your ATS connection has failed multiple times.";
  const bodyHtml = "<p style=\"margin:0 0 12px;\">You can use Sync Now to try again manually, and you can review your ATS connection settings from your employer dashboard.</p><p style=\"margin:0;\">If the issue continues, contact support and we’ll help you get your jobs syncing again.</p>";
  return {
    text: buildBrandedEmailText({
      title: "We’re having trouble syncing your jobs",
      intro,
      contextRows: [
        { label: "What happened", value: "Automatic synchronization has failed multiple times." },
        { label: "What you can do", value: "Use Sync Now or review your ATS connection settings." },
        { label: "Need help", value: "Contact support if the issue continues." },
      ],
      footerNote: "This service notification does not include provider error details for security.",
    }),
    html: buildBrandedEmailHtml({
      preheader: "Automatic ATS synchronization has failed multiple times.",
      title: "We’re having trouble syncing your jobs",
      intro,
      bodyHtml,
      footerNote: "This service notification does not include provider error details for security.",
    }),
  };
}

async function defaultMailer(input: { to: string[]; subject: string; text: string; html: string }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false };
  const fromEmail = process.env.ATS_SYNC_NOTIFICATION_FROM ?? process.env.TEAM_INVITE_FROM ?? process.env.CONTACT_NOTIFICATION_FROM ?? "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: fromEmail, to: input.to, subject: input.subject, text: input.text, html: input.html }) });
  if (!response.ok) console.error("Employer ATS sync failure notification email failed", { status: response.status });
  return { ok: response.ok };
}

export async function handleAtsSyncFailureNotification(connectionId: string, syncResult: RunEmployerAtsSyncResult, dependencies: AtsSyncFailureNotificationDependencies = {}): Promise<AtsSyncFailureNotificationResult> {
  const database = dependencies.database === undefined ? defaultDatabase() : dependencies.database;
  const mailer = dependencies.mailer ?? defaultMailer;
  const now = dependencies.now ?? (() => new Date());
  if (!database) return { status: "failed", reason: "missing_database" };
  try {
    if (syncResult.status === "completed") {
      const clearedAt = now().toISOString();
      const cleared = await database.clearNotificationSent(connectionId, clearedAt);
      return cleared.error ? { status: "failed", reason: "reset_failed" } : { status: "reset" };
    }
    const loaded = await database.getConnection(connectionId);
    if (loaded.error || !loaded.data) return { status: "failed", reason: "connection_unavailable" };
    const connection = loaded.data;
    if (connection.consecutive_failure_count < FAILURE_THRESHOLD || connection.failure_notification_sent_at) return { status: "skipped" };
    const owners = await database.listAccountOwners(connection.employer_account_id);
    if (owners.error) return { status: "failed", reason: "owners_unavailable" };
    const to = uniqueValidEmails(owners.data ?? []);
    if (to.length === 0) return { status: "skipped", reason: "no_owner_recipients" };
    const content = emailContent();
    const sent = await mailer({ to, subject: SUBJECT, text: content.text, html: content.html });
    if (!sent.ok) return { status: "failed", reason: "email_failed" };
    const sentAt = now().toISOString();
    const marked = await database.markNotificationSent(connection.id, sentAt);
    if (marked.error || !marked.data) return { status: "failed", reason: "mark_failed" };
    return { status: "sent" };
  } catch (error) {
    console.warn("Employer ATS sync failure notification handling failed", { error, connectionId });
    return { status: "failed", reason: "unexpected_failure" };
  }
}

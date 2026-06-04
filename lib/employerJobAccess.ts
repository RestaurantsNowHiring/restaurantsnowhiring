import { normalizeCandidateNotificationEmails } from "./candidateNotificationEmails";
import type { EmployerRole } from "./employerAccounts";

export type EmployerDashboardRole = EmployerRole | "admin" | "team_member" | string | null | undefined;

export type CandidateInterestEmailJob = {
  candidate_notification_email?: string | string[] | null;
  candidate_notification_emails?: string[] | string | null;
};

export type EmployerAccessUser = {
  email?: string | null;
};

const FULL_ACCOUNT_ACCESS_ROLES = new Set(["account_owner", "admin"]);
const EMAIL_SCOPED_ROLES = new Set(["hiring_manager", "team_member", "viewer"]);

export function parseJobCandidateInterestEmails(job: CandidateInterestEmailJob | null | undefined) {
  if (!job) return [];

  return normalizeCandidateNotificationEmails([
    ...normalizeCandidateNotificationEmails(job.candidate_notification_emails),
    ...normalizeCandidateNotificationEmails(job.candidate_notification_email),
  ]);
}

export function isFullAccountAccessRole(role: EmployerDashboardRole) {
  return FULL_ACCOUNT_ACCESS_ROLES.has(String(role ?? "").toLowerCase());
}

export function isCandidateInterestEmailScopedRole(role: EmployerDashboardRole) {
  return EMAIL_SCOPED_ROLES.has(String(role ?? "").toLowerCase());
}

export function canUserAccessJob(user: EmployerAccessUser | null | undefined, role: EmployerDashboardRole, job: CandidateInterestEmailJob | null | undefined) {
  if (isFullAccountAccessRole(role)) return true;

  const normalizedRole = String(role ?? "").toLowerCase();
  if (!isCandidateInterestEmailScopedRole(normalizedRole)) return false;

  const userEmail = user?.email?.trim().toLowerCase();
  if (!userEmail) return false;

  // Team Members/Viewers are location/email-scoped by the job's
  // "Where should candidate interest emails be sent?" candidate email field.
  // That field can be stored as candidate_notification_email or
  // candidate_notification_emails and can contain one or more comma-separated emails.
  return parseJobCandidateInterestEmails(job).includes(userEmail);
}

import { normalizeCandidateNotificationEmails } from "./candidateNotificationEmails";
import type { EmployerAccessScope, EmployerRole } from "./employerAccounts";

export type EmployerDashboardRole = EmployerRole | "admin" | "team_member" | string | null | undefined;

export type CandidateInterestEmailJob = {
  candidate_notification_email?: string | string[] | null;
  candidate_notification_emails?: string[] | string | null;
  employer_store_id?: string | null;
};

export type EmployerAccessUser = {
  email?: string | null;
  accessScope?: EmployerAccessScope | null;
  assignedStoreIds?: string[] | null;
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
  const accessScope = user?.accessScope ?? null;
  if (accessScope === "full_account_access" || (!accessScope && isFullAccountAccessRole(role))) return true;

  const normalizedRole = String(role ?? "").toLowerCase();
  if (!isCandidateInterestEmailScopedRole(normalizedRole) && !isFullAccountAccessRole(normalizedRole)) return false;

  const jobStoreId = typeof job?.employer_store_id === "string" ? job.employer_store_id.trim() : "";
  const assignedStoreIds = new Set((user?.assignedStoreIds ?? []).map((id) => id.trim()).filter(Boolean));
  if ((accessScope === "single_location" || accessScope === "multi_location") && jobStoreId && assignedStoreIds.has(jobStoreId)) {
    return true;
  }

  const userEmail = user?.email?.trim().toLowerCase();
  if (!userEmail) return false;

  // Preserve existing store-login behavior for jobs that are not linked to a store yet:
  // location-scoped users can still see jobs routed to their candidate interest email.
  return parseJobCandidateInterestEmails(job).includes(userEmail);
}

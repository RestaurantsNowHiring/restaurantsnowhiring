export const AUTO_RENEWAL_PERIOD_DAYS = 30;

export type AutoRenewalJob = {
  source_type?: string | null;
  active: boolean;
  status: string | null | undefined;
  approved_at: string | null | undefined;
  expires_at: string | null | undefined;
};

export function isEligibleForAutoRenewal(job: AutoRenewalJob, now: Date): boolean {
  const expiresAt = job.expires_at ? new Date(job.expires_at) : null;
  return (job.source_type == null || job.source_type === "employer" || job.source_type === "ats")
    && job.status === "active"
    && job.active === true
    && Boolean(job.approved_at)
    && Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime());
}

export function getNextAutoRenewalDate(expiresAt: Date, now: Date): Date {
  const periodMs = AUTO_RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const periodsToAdvance = Math.floor((now.getTime() - expiresAt.getTime()) / periodMs) + 1;
  return new Date(expiresAt.getTime() + periodsToAdvance * periodMs);
}

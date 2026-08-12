/**
 * Canonical fields and defaults shared by jobs inserted through the Post Job flow.
 * Feature-specific persistence may extend this payload, but should not redefine it.
 */
export const NEW_JOB_ACTIVE = false;
export const NEW_JOB_STATUS = "pending" as const;
export const DEFAULT_CANDIDATE_NOTIFICATION_ROUTING = "job_poster" as const;

/** Stable employer-account identities eligible for immediate approval. */
export function getAutoApproveEmployerAccountIds(value = process.env.MISSION_BBQ_AUTO_APPROVE_ACCOUNT_IDS) {
  return new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

export function shouldAutoApproveJob(employerAccountId: string | null | undefined, configuredIds?: ReadonlySet<string>) {
  const id = employerAccountId?.trim();
  return Boolean(id && (configuredIds ?? getAutoApproveEmployerAccountIds()).has(id));
}

export function getNewJobApprovalFields(
  employerAccountId: string | null | undefined,
  now = new Date(),
  configuredIds?: ReadonlySet<string>,
) {
  if (!shouldAutoApproveJob(employerAccountId, configuredIds)) {
    return { active: NEW_JOB_ACTIVE, status: NEW_JOB_STATUS } as const;
  }

  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  return {
    active: true,
    status: "active" as const,
    approved_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export type CanonicalJobInsertInput = {
  restaurantName: string;
  title: string;
  roleCategory: string;
  city: string;
  state: string;
  applyEmail: string;
  employmentType: string;
  description: string;
  employerEmail: string;
  employerUserId: string;
  employerAccountId: string | null;
  postedByUserId: string;
  postedByEmail: string;
  howToApply?: string | null;
  companyWebsite?: string | null;
  payRange?: string | null;
  address?: string | null;
  candidateNotificationEmail?: string | null;
  candidateNotificationEmails?: string[] | null;
  candidateNotificationRouting?: "account_owner" | "job_poster" | "company_support" | "custom_job_email";
  employerStoreId?: string | null;
  employerJobTemplateId?: string | null;
  approvalDate?: Date;
};

export function buildCanonicalJobInsertPayload(input: CanonicalJobInsertInput) {
  return {
    restaurant_name: input.restaurantName,
    title: input.title,
    role_category: input.roleCategory,
    city: input.city,
    state: input.state,
    apply_email: input.applyEmail,
    company_website: input.companyWebsite ?? null,
    employment_type: input.employmentType,
    pay_range: input.payRange ?? null,
    address: input.address ?? null,
    how_to_apply: input.howToApply ?? null,
    description: input.description,
    ...getNewJobApprovalFields(input.employerAccountId, input.approvalDate),
    employer_email: input.employerEmail,
    employer_user_id: input.employerUserId,
    employer_account_id: input.employerAccountId,
    posted_by_user_id: input.postedByUserId,
    posted_by_email: input.postedByEmail,
    candidate_notification_email: input.candidateNotificationEmail ?? null,
    candidate_notification_emails: input.candidateNotificationEmails?.length ? input.candidateNotificationEmails : null,
    candidate_notification_routing: input.candidateNotificationRouting ?? DEFAULT_CANDIDATE_NOTIFICATION_ROUTING,
    employer_store_id: input.employerStoreId ?? null,
    employer_job_template_id: input.employerJobTemplateId ?? null,
  };
}

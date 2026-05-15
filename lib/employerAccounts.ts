import { getSupabaseAdminClient } from "./supabaseAdmin";

export type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
export type CandidateNotificationRouting = "account_owner" | "job_poster" | "company_support" | "custom_job_email";

export type EmployerAccountContext = {
  accountId: string | null;
  role: EmployerRole;
  userId: string;
  email: string;
  ownerUserId: string;
  ownerEmail: string;
  canManageProfile: boolean;
  canManageBilling: boolean;
  canManageJobs: boolean;
  canViewCandidates: boolean;
  canUpdateCandidateStatuses: boolean;
  canManageTeam: boolean;
  canManageNotificationRouting: boolean;
  defaultCandidateNotificationRouting: CandidateNotificationRouting;
  supportEmail: string | null;
};

const ROLE_PERMISSIONS: Record<EmployerRole, Pick<EmployerAccountContext,
  | "canManageProfile"
  | "canManageBilling"
  | "canManageJobs"
  | "canViewCandidates"
  | "canUpdateCandidateStatuses"
  | "canManageTeam"
  | "canManageNotificationRouting"
>> = {
  account_owner: {
    canManageProfile: true,
    canManageBilling: true,
    canManageJobs: true,
    canViewCandidates: true,
    canUpdateCandidateStatuses: true,
    canManageTeam: true,
    canManageNotificationRouting: true,
  },
  hiring_manager: {
    canManageProfile: false,
    canManageBilling: false,
    canManageJobs: true,
    canViewCandidates: true,
    canUpdateCandidateStatuses: true,
    canManageTeam: false,
    canManageNotificationRouting: false,
  },
  viewer: {
    canManageProfile: false,
    canManageBilling: false,
    canManageJobs: false,
    canViewCandidates: true,
    canUpdateCandidateStatuses: true,
    canManageTeam: false,
    canManageNotificationRouting: false,
  },
};

function normalizeRole(value: unknown): EmployerRole {
  return value === "hiring_manager" || value === "viewer" || value === "account_owner" ? value : "account_owner";
}

function normalizeRouting(value: unknown): CandidateNotificationRouting {
  return value === "job_poster" || value === "company_support" || value === "custom_job_email" || value === "account_owner"
    ? value
    : "job_poster";
}

export function getRolePermissions(role: EmployerRole) {
  return ROLE_PERMISSIONS[role];
}

export async function getEmployerAccountContext(user: { id: string; email: string }): Promise<EmployerAccountContext> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("employer_team_members")
    .select("account_id,user_id,email,role,status,can_manage_notification_routing,employer_accounts!inner(id,owner_user_id,owner_email,default_candidate_notification_routing,support_email)")
    .or(`user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError && membershipError.code !== "42P01" && membershipError.code !== "42703") {
    throw new Error(membershipError.message || "Could not load employer team access.");
  }

  const memberRow = membership as Record<string, unknown> | null;
  const account = memberRow?.employer_accounts && typeof memberRow.employer_accounts === "object"
    ? (memberRow.employer_accounts as Record<string, unknown>)
    : null;

  const role = normalizeRole(memberRow?.role);
  const permissions = ROLE_PERMISSIONS[role];
  const canManageNotificationRouting =
    permissions.canManageNotificationRouting || Boolean(memberRow?.can_manage_notification_routing);

  if (memberRow && account) {
    return {
      accountId: String(account.id),
      role,
      userId: user.id,
      email: user.email,
      ownerUserId: String(account.owner_user_id || user.id),
      ownerEmail: String(account.owner_email || user.email),
      ...permissions,
      canManageNotificationRouting,
      defaultCandidateNotificationRouting: normalizeRouting(account.default_candidate_notification_routing),
      supportEmail: typeof account.support_email === "string" ? account.support_email : null,
    };
  }

  return {
    accountId: null,
    role: "account_owner",
    userId: user.id,
    email: user.email,
    ownerUserId: user.id,
    ownerEmail: user.email,
    ...ROLE_PERMISSIONS.account_owner,
    defaultCandidateNotificationRouting: "job_poster",
    supportEmail: null,
  };
}

export function assertEmployerPermission(context: EmployerAccountContext, permission: keyof ReturnType<typeof getRolePermissions>) {
  if (!context[permission]) {
    const message = context.role === "viewer"
      ? "Viewers can see dashboard and candidates, but cannot make this change. Contact your account admin to make changes."
      : "Your employer role cannot access this employer account setting.";
    const error = new Error(message);
    error.name = "EmployerPermissionError";
    throw error;
  }
}

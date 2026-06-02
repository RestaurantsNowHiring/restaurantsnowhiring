import { getSupabaseAdminClient } from "./supabaseAdmin";

export type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
export type CandidateNotificationRouting = "account_owner" | "job_poster" | "company_support" | "custom_job_email";

export type EmployerAccountMembership = {
  accountId: string;
  accountName: string;
  locationName: string | null;
  role: EmployerRole;
};

export type EmployerAccountContext = {
  accountId: string | null;
  accountName: string | null;
  restaurantBrandName: string | null;
  locationName: string | null;
  role: EmployerRole;
  memberships: EmployerAccountMembership[];
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

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeRole(value: unknown): EmployerRole {
  return value === "hiring_manager" || value === "viewer" || value === "account_owner" ? value : "account_owner";
}

function normalizeRouting(value: unknown): CandidateNotificationRouting {
  return value === "job_poster" || value === "company_support" || value === "custom_job_email" || value === "account_owner"
    ? value
    : "job_poster";
}

function accountDisplayName(account: Record<string, unknown> | null) {
  return cleanString(account?.account_name, 180) ?? cleanString(account?.company_name, 180) ?? "Employer Account";
}

export function getRolePermissions(role: EmployerRole) {
  return ROLE_PERMISSIONS[role];
}

async function activateInvitedEmployerTeamMemberships(user: { id: string; email: string }) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const lowerEmail = user.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const { data: invitedRows, error: invitedRowsError } = await supabaseAdmin
    .from("employer_team_members")
    .select("account_id,email,status,user_id")
    .ilike("email", lowerEmail);

  if (invitedRowsError) {
    if (invitedRowsError.code === "42P01" || invitedRowsError.code === "42703") return false;
    throw new Error(invitedRowsError.message || "Could not check invited employer team access.");
  }

  const accountIds = (invitedRows ?? [])
    .map((row) => cleanString(row.account_id, 80))
    .filter((accountId): accountId is string => Boolean(accountId));

  if (accountIds.length === 0) return false;

  const { error: activateError } = await supabaseAdmin
    .from("employer_team_members")
    .update({
      user_id: user.id,
      status: "active",
      invite_accepted_at: now,
      updated_at: now,
    })
    .ilike("email", lowerEmail)
    .in("account_id", accountIds);

  if (activateError) throw new Error(activateError.message || "Could not activate invited employer team access.");

  return true;
}

async function provisionNewEmployerAccount(user: { id: string; email: string }) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const wasInvitedTeamMember = await activateInvitedEmployerTeamMemberships(user);
  if (wasInvitedTeamMember) return null;

  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (authUserError) throw new Error(authUserError.message || "Could not load employer signup details.");

  const metadata = authUserData.user?.user_metadata ?? {};
  const accountName = cleanString(metadata.employer_account_name, 180) ?? cleanString(metadata.company_name, 180) ?? "Employer Account";
  const restaurantBrandName = cleanString(metadata.restaurant_brand_name, 180) ?? cleanString(metadata.company_name, 180) ?? accountName;
  const firstName = cleanString(metadata.first_name, 120);
  const lastName = cleanString(metadata.last_name, 120);
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const now = new Date().toISOString();

  const { data: account, error: accountError } = await supabaseAdmin
    .from("employer_accounts")
    .insert({
      owner_user_id: user.id,
      owner_email: user.email.toLowerCase(),
      account_name: accountName,
      restaurant_brand_name: restaurantBrandName,
      company_name: restaurantBrandName,
      support_email: cleanString(metadata.support_email, 180) ?? user.email.toLowerCase(),
      updated_at: now,
    })
    .select("id")
    .single();

  if (accountError) throw new Error(accountError.message || "Could not create employer account.");
  const accountId = String(account.id);

  const { error: memberError } = await supabaseAdmin
    .from("employer_team_members")
    .upsert(
      {
        account_id: accountId,
        user_id: user.id,
        email: user.email.toLowerCase(),
        role: "account_owner",
        status: "active",
        can_manage_notification_routing: true,
        updated_at: now,
      },
      { onConflict: "account_id,email" },
    );

  if (memberError) throw new Error(memberError.message || "Could not create employer account owner access.");

  await supabaseAdmin
    .from("employer_profiles")
    .upsert(
      {
        user_id: user.id,
        login_email: user.email,
        employer_account_id: accountId,
        company_name: restaurantBrandName,
        contact_name: contactName,
        first_name: firstName,
        last_name: lastName,
        job_title: cleanString(metadata.job_title, 160),
        jobs_open: cleanString(metadata.jobs_open, 40),
        support_email: user.email,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

  await supabaseAdmin
    .from("employer_billing")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        employer_account_id: accountId,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );

  return accountId;
}

export async function getEmployerAccountContext(user: { id: string; email: string }): Promise<EmployerAccountContext> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
  const admin = supabaseAdmin;

  async function loadMemberships() {
    const { data, error } = await admin
      .from("employer_team_members")
      .select("account_id,user_id,email,location_name,role,status,can_manage_notification_routing,employer_accounts!inner(id,owner_user_id,owner_email,account_name,restaurant_brand_name,company_name,default_candidate_notification_routing,support_email)")
      .or(`user_id.eq.${user.id},email.ilike.${user.email.trim().toLowerCase()}`)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error && error.code !== "42P01" && error.code !== "42703") {
      throw new Error(error.message || "Could not load employer team access.");
    }

    if (error?.code === "42703") {
      const fallback = await admin
        .from("employer_team_members")
        .select("account_id,user_id,email,role,status,can_manage_notification_routing,employer_accounts!inner(id,owner_user_id,owner_email,company_name,default_candidate_notification_routing,support_email)")
        .or(`user_id.eq.${user.id},email.ilike.${user.email.trim().toLowerCase()}`)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (fallback.error && fallback.error.code !== "42P01") {
        throw new Error(fallback.error.message || "Could not load employer team access.");
      }

      return (fallback.data ?? []) as Array<Record<string, unknown>>;
    }

    return (data ?? []) as Array<Record<string, unknown>>;
  }

  let memberships = await loadMemberships();
  const wasInvitedTeamMember = await activateInvitedEmployerTeamMemberships(user);
  if (wasInvitedTeamMember) {
    memberships = await loadMemberships();
  }

  if (memberships.length === 0) {
    await provisionNewEmployerAccount(user);
    memberships = await loadMemberships();
  }

  const memberRow = memberships[0] ?? null;
  const account = memberRow?.employer_accounts && typeof memberRow.employer_accounts === "object"
    ? (memberRow.employer_accounts as Record<string, unknown>)
    : null;

  const role = normalizeRole(memberRow?.role);
  const permissions = ROLE_PERMISSIONS[role];
  const canManageNotificationRouting =
    permissions.canManageNotificationRouting || Boolean(memberRow?.can_manage_notification_routing);
  const membershipSummaries = memberships
    .map((membership) => {
      const membershipAccount = membership.employer_accounts && typeof membership.employer_accounts === "object"
        ? (membership.employer_accounts as Record<string, unknown>)
        : null;
      const accountId = cleanString(membership.account_id, 80) ?? cleanString(membershipAccount?.id, 80);
      if (!accountId) return null;
      return {
        accountId,
        accountName: accountDisplayName(membershipAccount),
        locationName: cleanString(membership.location_name, 180),
        role: normalizeRole(membership.role),
      };
    })
    .filter((membership): membership is EmployerAccountMembership => Boolean(membership));

  if (memberRow && account) {
    return {
      accountId: String(account.id),
      accountName: accountDisplayName(account),
      restaurantBrandName: cleanString(account.restaurant_brand_name, 180) ?? cleanString(account.company_name, 180),
      locationName: cleanString(memberRow.location_name, 180),
      role,
      memberships: membershipSummaries,
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
    accountName: null,
    restaurantBrandName: null,
    locationName: null,
    role: "account_owner",
    memberships: [],
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

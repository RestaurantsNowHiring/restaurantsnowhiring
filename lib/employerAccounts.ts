import { getSupabaseAdminClient } from "./supabaseAdmin";

export type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
export type CandidateNotificationRouting = "account_owner" | "job_poster" | "company_support" | "custom_job_email";

export type EmployerAccountMembership = {
  accountId: string;
  accountName: string;
  locationName: string | null;
  role: EmployerRole;
  status: string;
  invitationPending: boolean;
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
    canUpdateCandidateStatuses: false,
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
  return cleanString(account?.account_name, 180) ?? cleanString(account?.restaurant_brand_name, 180) ?? cleanString(account?.company_name, 180) ?? "Employer Account";
}

function normalizeStatus(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "active";
}

function isActiveAccessStatus(status: string) {
  return status === "active" || status === "accepted";
}

function isPendingAccessStatus(status: string) {
  return status === "invited" || status === "pending";
}

export function getSelectedEmployerAccountIdFromRequest(request: Request) {
  const headerValue = request.headers.get("x-employer-account-id")?.trim();
  if (headerValue) return headerValue;

  const queryValue = new URL(request.url).searchParams.get("employerAccountId")?.trim();
  return queryValue || null;
}

export function getRolePermissions(role: EmployerRole) {
  return ROLE_PERMISSIONS[role];
}

export async function acceptPendingTeamInvitesForAuthUser(user: { id: string; email: string }) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
  const admin = supabaseAdmin;

  const lowerEmail = user.email.trim().toLowerCase();
  if (!lowerEmail) return false;

  const now = new Date().toISOString();

  const { data: invitedRows, error: invitedRowsError } = await admin
    .from("employer_team_members")
    .select("id,email,status")
    .in("status", ["invited", "pending"]);

  if (invitedRowsError) {
    if (invitedRowsError.code === "42P01" || invitedRowsError.code === "42703") return false;
    throw new Error(invitedRowsError.message || "Could not check invited employer team access.");
  }

  const inviteIds = (invitedRows ?? [])
    .filter((row) => cleanString(row.email, 254)?.toLowerCase() === lowerEmail)
    .map((row) => cleanString(row.id, 80))
    .filter((id): id is string => Boolean(id));

  if (inviteIds.length === 0) return false;

  async function runUpdate(payload: Record<string, string>) {
    return admin
      .from("employer_team_members")
      .update(payload)
      .in("id", inviteIds)
      .in("status", ["invited", "pending"]);
  }

  let { error: activateError } = await runUpdate({
    user_id: user.id,
    auth_user_id: user.id,
    status: "active",
    invite_accepted_at: now,
    updated_at: now,
  });

  if (activateError?.code === "PGRST204" || activateError?.code === "42703" || (activateError?.message ?? "").toLowerCase().includes("auth_user_id")) {
    ({ error: activateError } = await runUpdate({
      user_id: user.id,
      status: "active",
      invite_accepted_at: now,
      updated_at: now,
    }));
  }

  if (activateError) throw new Error(activateError.message || "Could not activate invited employer team access.");

  return true;
}

async function activateInvitedEmployerTeamMemberships(user: { id: string; email: string }) {
  return acceptPendingTeamInvitesForAuthUser(user);
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
        auth_user_id: user.id,
        email: user.email.toLowerCase(),
        role: "account_owner",
        status: "active",
        can_manage_notification_routing: true,
        updated_at: now,
      },
      { onConflict: "account_id,lower(btrim(email))" },
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

export async function getEmployerAccountContext(user: { id: string; email: string }, selectedAccountId?: string | null): Promise<EmployerAccountContext> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
  const admin = supabaseAdmin;

  async function loadMemberships() {
    const lowerEmail = user.email.trim().toLowerCase();
    const membershipRowsByAccountId = new Map<string, Record<string, unknown>>();

    async function addTeamMembershipRows(selectFields: string) {
      const { data, error } = await admin
        .from("employer_team_members")
        .select(selectFields)
        .or(`user_id.eq.${user.id},email.ilike.${lowerEmail}`)
        .in("status", ["active", "accepted", "invited", "pending"])
        .order("created_at", { ascending: true });

      if (error && error.code !== "42P01" && error.code !== "42703") {
        throw new Error(error.message || "Could not load employer team access.");
      }

      if (error) return false;

      (data ?? []).forEach((membership) => {
        const row = membership as unknown as Record<string, unknown>;
        const account = row.employer_accounts && typeof row.employer_accounts === "object"
          ? (row.employer_accounts as Record<string, unknown>)
          : null;
        const accountId = cleanString(row.account_id, 80) ?? cleanString(account?.id, 80);
        const status = normalizeStatus(row.status);
        if (!accountId || !account || (!isActiveAccessStatus(status) && !isPendingAccessStatus(status))) return;
        membershipRowsByAccountId.set(accountId, row);
      });

      return true;
    }

    const loadedTeamRows = await addTeamMembershipRows("account_id,user_id,email,location_name,role,status,can_manage_notification_routing,employer_accounts!inner(id,owner_user_id,owner_email,account_name,restaurant_brand_name,company_name,default_candidate_notification_routing,support_email)");
    if (!loadedTeamRows) {
      await addTeamMembershipRows("account_id,user_id,email,role,status,can_manage_notification_routing,employer_accounts!inner(id,owner_user_id,owner_email,company_name,default_candidate_notification_routing,support_email)");
    }

    const { data: ownedAccounts, error: ownedAccountsError } = await admin
      .from("employer_accounts")
      .select("id,owner_user_id,owner_email,account_name,restaurant_brand_name,company_name,default_candidate_notification_routing,support_email")
      .or(`owner_user_id.eq.${user.id},owner_email.ilike.${lowerEmail}`)
      .order("created_at", { ascending: true });

    if (ownedAccountsError && ownedAccountsError.code !== "42P01" && ownedAccountsError.code !== "42703") {
      throw new Error(ownedAccountsError.message || "Could not load owned employer accounts.");
    }

    (ownedAccounts ?? []).forEach((accountRow) => {
      const account = accountRow as Record<string, unknown>;
      const accountId = cleanString(account.id, 80);
      if (!accountId) return;
      membershipRowsByAccountId.set(accountId, {
        account_id: accountId,
        user_id: user.id,
        email: user.email,
        location_name: null,
        role: "account_owner",
        status: "active",
        can_manage_notification_routing: true,
        employer_accounts: account,
      });
    });

    return Array.from(membershipRowsByAccountId.values());
  }

  await activateInvitedEmployerTeamMemberships(user);
  let memberships = await loadMemberships();

  if (memberships.length === 0) {
    await provisionNewEmployerAccount(user);
    memberships = await loadMemberships();
  }

  const normalizedSelectedAccountId = selectedAccountId?.trim() || null;
  const selectedMembership = normalizedSelectedAccountId
    ? memberships.find((membership) => {
        const membershipAccount = membership.employer_accounts && typeof membership.employer_accounts === "object"
          ? (membership.employer_accounts as Record<string, unknown>)
          : null;
        const membershipAccountId = cleanString(membership.account_id, 80) ?? cleanString(membershipAccount?.id, 80);
        return membershipAccountId === normalizedSelectedAccountId && isActiveAccessStatus(normalizeStatus(membership.status));
      })
    : null;
  const memberRow = selectedMembership ?? memberships.find((membership) => isActiveAccessStatus(normalizeStatus(membership.status))) ?? memberships[0] ?? null;
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
        status: normalizeStatus(membership.status),
        invitationPending: isPendingAccessStatus(normalizeStatus(membership.status)),
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

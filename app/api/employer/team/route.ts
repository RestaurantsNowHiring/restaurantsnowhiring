import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { EmployerAccessScope, EmployerRole, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { sendTeamInviteEmail } from "../../../../lib/teamInviteEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<EmployerRole>(["account_owner", "hiring_manager", "viewer"]);
const ACCESS_SCOPES = new Set<EmployerAccessScope>(["single_location", "multi_location", "full_account_access"]);

type TeamPayload = {
  id?: string;
  email?: string;
  role?: EmployerRole;
  can_manage_notification_routing?: boolean;
  location_name?: string | null;
  user_type?: EmployerAccessScope;
  assigned_store_ids?: string[];
};

type TeamMemberRow = {
  id: string;
  email: string;
  location_name: string | null;
  user_id: string | null;
  role: EmployerRole;
  user_type: EmployerAccessScope;
  assigned_store_ids?: string[];
  employer_store_id?: string | null;
  status: string;
  can_manage_notification_routing: boolean;
  created_at: string;
  updated_at: string;
  invite_token: string | null;
};

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function cleanRole(value: unknown): EmployerRole | null {
  return ROLES.has(value as EmployerRole) ? (value as EmployerRole) : null;
}

function cleanLocationName(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : null;
}

function cleanAccessScope(value: unknown, role?: EmployerRole): EmployerAccessScope {
  if (role === "account_owner") return "full_account_access";
  return ACCESS_SCOPES.has(value as EmployerAccessScope) ? (value as EmployerAccessScope) : "single_location";
}

function cleanStoreIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)));
}

function normalizeMatchText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const TEAM_MEMBER_SELECT = "id,email,location_name,user_id,role,user_type,status,can_manage_notification_routing,created_at,updated_at,invite_token";
const SINGLE_LOCATION_ERROR = "Select one assigned store location before saving Single Location access.";

async function loadTeamMemberForSingleLocationMatch(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, accountId: string, memberId: string) {
  let result = await admin
    .from("employer_team_members")
    .select("id,email,location_name,employer_store_id")
    .eq("id", memberId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (result.error?.code === "PGRST204" || result.error?.code === "42703" || (result.error?.message ?? "").toLowerCase().includes("employer_store_id")) {
    result = await admin
      .from("employer_team_members")
      .select("id,email,location_name")
      .eq("id", memberId)
      .eq("account_id", accountId)
      .maybeSingle();
  }

  if (result.error) throw new Error(result.error.message || "Could not load team user for location matching.");
  return (result.data ?? null) as Pick<TeamMemberRow, "id" | "email" | "location_name" | "employer_store_id"> | null;
}


async function loadTeamMemberForSingleLocationMatchByEmail(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, accountId: string, email: string) {
  let result = await admin
    .from("employer_team_members")
    .select("id,email,location_name,employer_store_id")
    .eq("account_id", accountId)
    .ilike("email", email)
    .maybeSingle();

  if (result.error?.code === "PGRST204" || result.error?.code === "42703" || (result.error?.message ?? "").toLowerCase().includes("employer_store_id")) {
    result = await admin
      .from("employer_team_members")
      .select("id,email,location_name")
      .eq("account_id", accountId)
      .ilike("email", email)
      .maybeSingle();
  }

  if (result.error) throw new Error(result.error.message || "Could not load team user for location matching.");
  return (result.data ?? null) as Pick<TeamMemberRow, "id" | "email" | "location_name" | "employer_store_id"> | null;
}

async function autoDetectSingleAssignedStoreId(input: {
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
  accountId: string;
  member: Pick<TeamMemberRow, "email" | "location_name" | "employer_store_id">;
}) {
  const { admin, accountId, member } = input;
  const { data, error } = await admin
    .from("employer_stores")
    .select("id,location_name,store_email,ta_email,gm_op_email")
    .eq("employer_account_id", accountId)
    .eq("active", true)
    .eq("is_assignable_location", true);

  if (error) throw new Error(error.message || "Could not match an assigned store location.");

  const activeStores = (data ?? []).map((store) => ({
    id: String(store.id ?? ""),
    locationName: normalizeMatchText(store.location_name),
    emails: [store.store_email, store.ta_email, store.gm_op_email].map(normalizeMatchText).filter(Boolean),
  })).filter((store) => store.id);

  const linkedStoreId = typeof member.employer_store_id === "string" ? member.employer_store_id.trim() : "";
  if (linkedStoreId && activeStores.some((store) => store.id === linkedStoreId)) return linkedStoreId;

  const memberLocationName = normalizeMatchText(member.location_name);
  if (memberLocationName) {
    const locationMatches = activeStores.filter((store) => store.locationName === memberLocationName);
    if (locationMatches.length === 1) return locationMatches[0].id;
    if (locationMatches.length > 1) throw new Error(SINGLE_LOCATION_ERROR);
  }

  const memberEmail = normalizeMatchText(member.email);
  if (memberEmail) {
    const emailMatches = activeStores.filter((store) => store.emails.includes(memberEmail));
    if (emailMatches.length === 1) return emailMatches[0].id;
    if (emailMatches.length > 1) throw new Error(SINGLE_LOCATION_ERROR);
  }

  throw new Error(SINGLE_LOCATION_ERROR);
}

async function resolveAssignedStoreIdsForAccessScope(input: {
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
  accountId: string;
  userType: EmployerAccessScope;
  assignedStoreIds: string[];
  member?: Pick<TeamMemberRow, "email" | "location_name" | "employer_store_id"> | null;
}) {
  const { admin, accountId, userType, assignedStoreIds, member } = input;
  if (userType === "full_account_access") return [];
  if (userType === "multi_location") return assignedStoreIds;
  if (assignedStoreIds.length === 1) return assignedStoreIds;
  if (assignedStoreIds.length > 1) throw new Error(SINGLE_LOCATION_ERROR);
  if (!member) throw new Error(SINGLE_LOCATION_ERROR);
  return [await autoDetectSingleAssignedStoreId({ admin, accountId, member })];
}

async function validateAssignableStoreIds(admin: ReturnType<typeof getSupabaseAdminClient>, accountId: string, storeIds: string[]) {
  if (!admin || storeIds.length === 0) return [];
  const { data, error } = await admin
    .from("employer_stores")
    .select("id")
    .eq("employer_account_id", accountId)
    .eq("active", true)
    .eq("is_assignable_location", true)
    .in("id", storeIds);
  if (error) throw new Error(error.message || "Could not validate assigned locations.");
  const validIds = new Set((data ?? []).map((row) => String(row.id)));
  if (validIds.size !== storeIds.length) throw new Error("Assigned locations must be active, assignable stores on this employer account.");
  return storeIds.filter((id) => validIds.has(id));
}

async function syncStoreAssignments(input: { admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>; accountId: string; memberId: string; storeIds: string[]; createdByUserId: string }) {
  const { admin, accountId, memberId, storeIds, createdByUserId } = input;
  const validStoreIds = await validateAssignableStoreIds(admin, accountId, storeIds);
  const { error: deleteError } = await admin.from("employer_team_member_stores").delete().eq("team_member_id", memberId);
  if (deleteError) throw new Error(deleteError.message || "Could not update assigned locations.");
  if (validStoreIds.length === 0) return [];
  const { data, error } = await admin
    .from("employer_team_member_stores")
    .insert(validStoreIds.map((storeId) => ({ employer_account_id: accountId, team_member_id: memberId, store_id: storeId, created_by_user_id: createdByUserId })))
    .select("store_id");
  if (error) throw new Error(error.message || "Could not save assigned locations.");
  return (data ?? []).map((row) => String(row.store_id));
}

async function attachStoreAssignments(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, members: TeamMemberRow[]) {
  const memberIds = members.map((member) => member.id).filter(Boolean);
  if (memberIds.length === 0) return members;
  const { data, error } = await admin
    .from("employer_team_member_stores")
    .select("team_member_id,store_id")
    .in("team_member_id", memberIds);
  if (error) {
    if (error.code === "42P01" || error.code === "42703") return members.map((member) => ({ ...member, assigned_store_ids: [] }));
    throw new Error(error.message || "Could not load assigned locations.");
  }
  const assignments = new Map<string, string[]>();
  (data ?? []).forEach((row) => {
    const memberId = String(row.team_member_id ?? "");
    const storeId = String(row.store_id ?? "");
    if (!memberId || !storeId) return;
    assignments.set(memberId, [...(assignments.get(memberId) ?? []), storeId]);
  });
  return members.map((member) => ({ ...member, assigned_store_ids: assignments.get(member.id) ?? [] }));
}

async function sendInviteForMember(input: {
  member: TeamMemberRow;
  accountName: string | null;
  inviterEmail: string | null;
}) {
  const result = await sendTeamInviteEmail({
    toEmail: input.member.email,
    accountName: input.accountName,
    role: input.member.role,
    inviterEmail: input.inviterEmail,
    inviteToken: input.member.invite_token ?? input.member.id,
  });

  if (!result.ok) {
    console.warn("Employer team invite email was not sent", {
      reason: result.reason,
      memberId: input.member.id,
      toEmail: input.member.email,
      accountName: input.accountName,
    });
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const teamMembersResultWithStore = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,location_name,user_id,role,user_type,status,can_manage_notification_routing,created_at,updated_at,invite_token,employer_store_id")
      .eq("account_id", context.accountId)
      .in("status", ["active", "invited", "pending"])
      .order("created_at", { ascending: true });

    let data: unknown[] | null = teamMembersResultWithStore.data as unknown[] | null;
    let error = teamMembersResultWithStore.error;

    if (error?.code === "PGRST204" || error?.code === "42703" || (error?.message ?? "").toLowerCase().includes("employer_store_id")) {
      const teamMembersResult = await supabaseAdmin
        .from("employer_team_members")
        .select(TEAM_MEMBER_SELECT)
        .eq("account_id", context.accountId)
        .in("status", ["active", "invited", "pending"])
        .order("created_at", { ascending: true });
      data = teamMembersResult.data as unknown[] | null;
      error = teamMembersResult.error;
    }

    if (error) throw new Error(error.message || "Could not load team users.");
    const membersWithAssignments = await attachStoreAssignments(supabaseAdmin, (data ?? []) as TeamMemberRow[]);
    return NextResponse.json({ members: membersWithAssignments });
  } catch (error) {
    console.error("Employer team load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load team users." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as TeamPayload | null;
    const email = cleanEmail(payload?.email);
    const role = cleanRole(payload?.role);
    const userType = cleanAccessScope(payload?.user_type, role ?? undefined);
    const assignedStoreIds = userType === "multi_location" || userType === "single_location" ? cleanStoreIds(payload?.assigned_store_ids) : [];

    if (!email || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid team user email." }, { status: 400 });
    if (!role) return NextResponse.json({ error: "Choose a valid access level." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
    const admin = supabaseAdmin;

    const preResolvedAssignedStoreIds = userType === "single_location" && assignedStoreIds.length === 0
      ? await resolveAssignedStoreIdsForAccessScope({
          admin,
          accountId: context.accountId,
          userType,
          assignedStoreIds,
          member: await loadTeamMemberForSingleLocationMatchByEmail(admin, context.accountId, email) ?? { email, location_name: cleanLocationName(payload?.location_name), employer_store_id: null },
        })
      : null;

    const { data: users } = await admin.auth.admin.listUsers();
    const matchedUser = users.users.find((candidate) => candidate.email?.toLowerCase() === email);

    const now = new Date().toISOString();
    const upsertPayload = {
      account_id: context.accountId,
      email,
      user_id: matchedUser?.id ?? null,
      auth_user_id: matchedUser?.id ?? null,
      role,
      user_type: userType,
      status: matchedUser ? "active" : "invited",
      invite_token: randomUUID(),
      invite_accepted_at: matchedUser ? now : null,
      can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing),
      invited_by_user_id: user.id,
      updated_at: now,
    };

    async function upsertTeamMember(payloadToSave: Record<string, unknown>) {
      return admin
        .from("employer_team_members")
        .upsert(payloadToSave, { onConflict: "account_id,email" })
        .select(TEAM_MEMBER_SELECT)
        .single();
    }

    let { data, error } = await upsertTeamMember(upsertPayload);
    if (error?.code === "PGRST204" || error?.code === "42703" || (error?.message ?? "").toLowerCase().includes("auth_user_id")) {
      const fallbackPayload = { ...upsertPayload } as Record<string, unknown>;
      delete fallbackPayload.auth_user_id;
      ({ data, error } = await upsertTeamMember(fallbackPayload));
    }

    if (error) throw new Error(error.message || "Could not save team user.");
    const storeIdsToSave = preResolvedAssignedStoreIds ?? await resolveAssignedStoreIdsForAccessScope({
      admin,
      accountId: context.accountId,
      userType,
      assignedStoreIds,
      member: data as TeamMemberRow,
    });
    const savedAssignedStoreIds = await syncStoreAssignments({ admin, accountId: context.accountId, memberId: String((data as TeamMemberRow).id), storeIds: storeIdsToSave, createdByUserId: user.id });
    data = { ...(data as TeamMemberRow), assigned_store_ids: savedAssignedStoreIds } as typeof data;

    const inviteEmail = await sendInviteForMember({
      member: data as TeamMemberRow,
      accountName: context.accountName,
      inviterEmail: user.email,
    });

    return NextResponse.json({
      member: data,
      inviteEmailSent: inviteEmail.ok,
      inviteEmailWarning: inviteEmail.ok ? null : "Warning: Team access was saved, but the invitation email could not be sent. Use Resend invite to try again.",
    });
  } catch (error) {
    console.error("Employer team save failed", { error });
    const message = error instanceof Error ? error.message : "Could not save team user.";
    return NextResponse.json({ error: message }, { status: message === SINGLE_LOCATION_ERROR ? 400 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as TeamPayload | null;
    const id = payload?.id?.trim();
    const role = cleanRole(payload?.role);
    const userType = cleanAccessScope(payload?.user_type, role ?? undefined);
    const assignedStoreIds = userType === "multi_location" || userType === "single_location" ? cleanStoreIds(payload?.assigned_store_ids) : [];
    const locationName = cleanLocationName(payload?.location_name);
    if (!id || !role) return NextResponse.json({ error: "Choose a team member and valid access level." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const currentMember = await loadTeamMemberForSingleLocationMatch(supabaseAdmin, context.accountId, id);
    if (!currentMember) return NextResponse.json({ error: "Team user was not found." }, { status: 404 });
    const storeIdsToSave = await resolveAssignedStoreIdsForAccessScope({
      admin: supabaseAdmin,
      accountId: context.accountId,
      userType,
      assignedStoreIds,
      member: { ...currentMember, location_name: locationName ?? currentMember.location_name },
    });

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .update({
        role,
        user_type: userType,
        location_name: locationName,
        can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select(TEAM_MEMBER_SELECT)
      .single();

    if (error) throw new Error(error.message || "Could not update team user.");
    const savedAssignedStoreIds = await syncStoreAssignments({ admin: supabaseAdmin, accountId: context.accountId, memberId: String((data as TeamMemberRow).id), storeIds: storeIdsToSave, createdByUserId: user.id });
    return NextResponse.json({ member: { ...(data as TeamMemberRow), assigned_store_ids: savedAssignedStoreIds } });
  } catch (error) {
    console.error("Employer team update failed", { error });
    const message = error instanceof Error ? error.message : "Could not update team user.";
    return NextResponse.json({ error: message }, { status: message === SINGLE_LOCATION_ERROR ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Choose a team member to remove." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: member, error: memberError } = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,user_id,role,status")
      .eq("id", id)
      .eq("account_id", context.accountId)
      .maybeSingle();

    if (memberError) throw new Error(memberError.message || "Could not find team user.");
    if (!member) return NextResponse.json({ error: "Team user was not found or was already removed." }, { status: 404 });
    if (member.role === "account_owner" || member.user_id === context.ownerUserId) {
      return NextResponse.json({ error: "Account Owners cannot be removed from team access." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("employer_team_members")
      .delete()
      .eq("id", member.id)
      .eq("account_id", context.accountId);

    if (error) throw new Error(error.message || "Could not remove team user.");
    return NextResponse.json({ ok: true, removedMemberId: member.id });
  } catch (error) {
    console.error("Employer team remove failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove team user." }, { status: 500 });
  }
}

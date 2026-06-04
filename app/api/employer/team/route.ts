import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { EmployerAccessScope, EmployerRole, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { sendTeamInviteEmail } from "../../../../lib/teamInviteEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<EmployerRole>(["account_owner", "hiring_manager", "viewer"]);
const ACCESS_SCOPES = new Set<EmployerAccessScope>(["single_location", "multi_location", "full_account_access"]);
const TEAM_SELECT = "id,email,location_name,user_id,role,user_type,status,can_manage_notification_routing,created_at,updated_at,invite_token";

type TeamPayload = {
  id?: string;
  email?: string;
  role?: EmployerRole;
  user_type?: EmployerAccessScope;
  access_scope?: EmployerAccessScope;
  can_manage_notification_routing?: boolean;
  location_name?: string | null;
  assigned_store_ids?: unknown;
};

type TeamMemberRow = {
  id: string;
  email: string;
  location_name: string | null;
  user_id: string | null;
  role: EmployerRole;
  user_type?: EmployerAccessScope;
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

function cleanAccessScope(value: unknown, role: EmployerRole): EmployerAccessScope {
  if (role === "account_owner") return "full_account_access";
  return ACCESS_SCOPES.has(value as EmployerAccessScope) ? (value as EmployerAccessScope) : "multi_location";
}

function cleanStoreIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)));
}

async function validateStoreAssignments(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, accountId: string, accessScope: EmployerAccessScope, storeIds: string[]) {
  if (accessScope === "full_account_access") return { ok: true as const, storeIds: [] as string[] };
  if (accessScope === "single_location" && storeIds.length !== 1) return { ok: false as const, error: "Single Location access requires exactly one active store location." };
  if (accessScope === "multi_location" && storeIds.length < 1) return { ok: false as const, error: "Multi Location access requires at least one active store location." };

  const { data, error } = await admin
    .from("employer_stores")
    .select("id")
    .eq("employer_account_id", accountId)
    .eq("active", true)
    .in("id", storeIds);
  if (error) throw new Error(error.message || "Could not validate assigned locations.");

  const validIds = new Set((data ?? []).map((store) => String(store.id)));
  if (storeIds.some((storeId) => !validIds.has(storeId))) {
    return { ok: false as const, error: "Assigned locations must be active stores in this employer account." };
  }
  return { ok: true as const, storeIds };
}

async function saveAssignments(input: { admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>; accountId: string; teamMemberId: string; storeIds: string[]; createdByUserId: string }) {
  const { admin, accountId, teamMemberId, storeIds, createdByUserId } = input;
  const { error: deleteError } = await admin
    .from("employer_team_member_stores")
    .delete()
    .eq("employer_account_id", accountId)
    .eq("team_member_id", teamMemberId);
  if (deleteError) throw new Error(deleteError.message || "Could not update assigned locations.");

  if (storeIds.length === 0) return;
  const { error: insertError } = await admin.from("employer_team_member_stores").insert(
    storeIds.map((storeId) => ({ employer_account_id: accountId, team_member_id: teamMemberId, store_id: storeId, created_by_user_id: createdByUserId })),
  );
  if (insertError) throw new Error(insertError.message || "Could not save assigned locations.");
}

async function loadAssignments(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, accountId: string, memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, string[]>();
  const { data, error } = await admin
    .from("employer_team_member_stores")
    .select("team_member_id,store_id")
    .eq("employer_account_id", accountId)
    .in("team_member_id", memberIds);
  if (error) throw new Error(error.message || "Could not load assigned locations.");
  return (data ?? []).reduce((map, assignment) => {
    const memberId = String(assignment.team_member_id ?? "");
    const storeId = String(assignment.store_id ?? "");
    if (!memberId || !storeId) return map;
    map.set(memberId, [...(map.get(memberId) ?? []), storeId]);
    return map;
  }, new Map<string, string[]>());
}

async function withAssignments(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, accountId: string, members: TeamMemberRow[]) {
  const assignments = await loadAssignments(admin, accountId, members.map((member) => member.id));
  return members.map((member) => ({
    ...member,
    user_type: member.user_type ?? (member.role === "account_owner" ? "full_account_access" : "multi_location"),
    assigned_store_ids: assignments.get(member.id) ?? [],
  }));
}

async function sendInviteForMember(input: { member: TeamMemberRow; accountName: string | null; inviterEmail: string | null }) {
  const result = await sendTeamInviteEmail({
    toEmail: input.member.email,
    accountName: input.accountName,
    role: input.member.role,
    inviterEmail: input.inviterEmail,
    inviteToken: input.member.invite_token ?? input.member.id,
  });

  if (!result.ok) {
    console.warn("Employer team invite email was not sent", { reason: result.reason, memberId: input.member.id, toEmail: input.member.email, accountName: input.accountName });
  }

  return result;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });

    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await admin
      .from("employer_team_members")
      .select(TEAM_SELECT)
      .eq("account_id", context.accountId)
      .in("status", ["active", "invited", "pending"])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message || "Could not load team users.");
    return NextResponse.json({ members: await withAssignments(admin, context.accountId, (data ?? []) as TeamMemberRow[]) });
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
    if (!context.canManageTeam || !context.accountId) return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });

    const payload = (await request.json().catch(() => null)) as TeamPayload | null;
    const email = cleanEmail(payload?.email);
    const role = cleanRole(payload?.role);
    if (!email || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid team user email." }, { status: 400 });
    if (!role) return NextResponse.json({ error: "Choose a valid access level." }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured on the server.");
    const userType = cleanAccessScope(payload?.user_type ?? payload?.access_scope, role);
    const storeValidation = await validateStoreAssignments(admin, context.accountId, userType, cleanStoreIds(payload?.assigned_store_ids));
    if (!storeValidation.ok) return NextResponse.json({ error: storeValidation.error }, { status: 400 });
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

    let { data, error } = await admin.from("employer_team_members").upsert(upsertPayload, { onConflict: "account_id,email" }).select(TEAM_SELECT).single();
    if (error?.code === "PGRST204" || error?.code === "42703" || (error?.message ?? "").toLowerCase().includes("auth_user_id")) {
      const fallbackPayload = { ...upsertPayload } as Record<string, unknown>;
      delete fallbackPayload.auth_user_id;
      ({ data, error } = await admin.from("employer_team_members").upsert(fallbackPayload, { onConflict: "account_id,email" }).select(TEAM_SELECT).single());
    }
    if (error || !data) throw new Error(error?.message || "Could not save team user.");

    await saveAssignments({ admin, accountId: context.accountId, teamMemberId: String(data.id), storeIds: storeValidation.storeIds, createdByUserId: user.id });
    const [member] = await withAssignments(admin, context.accountId, [data as TeamMemberRow]);
    const inviteEmail = await sendInviteForMember({ member: data as TeamMemberRow, accountName: context.accountName, inviterEmail: user.email });
    return NextResponse.json({ member, inviteEmailSent: inviteEmail.ok, inviteEmailWarning: inviteEmail.ok ? null : "Warning: Team access was saved, but the invitation email could not be sent. Use Resend invite to try again." });
  } catch (error) {
    console.error("Employer team save failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save team user." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });

    const payload = (await request.json().catch(() => null)) as TeamPayload | null;
    const id = payload?.id?.trim();
    const role = cleanRole(payload?.role);
    if (!id || !role) return NextResponse.json({ error: "Choose a team member and valid access level." }, { status: 400 });

    const userType = cleanAccessScope(payload?.user_type ?? payload?.access_scope, role);
    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured on the server.");
    const storeValidation = await validateStoreAssignments(admin, context.accountId, userType, cleanStoreIds(payload?.assigned_store_ids));
    if (!storeValidation.ok) return NextResponse.json({ error: storeValidation.error }, { status: 400 });

    const { data, error } = await admin
      .from("employer_team_members")
      .update({ role, user_type: userType, can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select(TEAM_SELECT)
      .single();

    if (error || !data) throw new Error(error?.message || "Could not update team user.");
    await saveAssignments({ admin, accountId: context.accountId, teamMemberId: id, storeIds: storeValidation.storeIds, createdByUserId: user.id });
    const [member] = await withAssignments(admin, context.accountId, [data as TeamMemberRow]);
    return NextResponse.json({ member });
  } catch (error) {
    console.error("Employer team update failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update team user." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageTeam || !context.accountId) return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });

    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Choose a team member to remove." }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured on the server.");
    const { data: member, error: memberError } = await admin.from("employer_team_members").select("id,email,user_id,role,status").eq("id", id).eq("account_id", context.accountId).maybeSingle();
    if (memberError) throw new Error(memberError.message || "Could not find team user.");
    if (!member) return NextResponse.json({ error: "Team user was not found or was already removed." }, { status: 404 });
    if (member.role === "account_owner" || member.user_id === context.ownerUserId) return NextResponse.json({ error: "Account Owners cannot be removed from team access." }, { status: 400 });

    const { error } = await admin.from("employer_team_members").delete().eq("id", member.id).eq("account_id", context.accountId);
    if (error) throw new Error(error.message || "Could not remove team user.");
    return NextResponse.json({ ok: true, removedMemberId: member.id });
  } catch (error) {
    console.error("Employer team remove failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove team user." }, { status: 500 });
  }
}

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { EmployerRole, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { sendTeamInviteEmail } from "../../../../lib/teamInviteEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<EmployerRole>(["account_owner", "hiring_manager", "viewer"]);

type TeamPayload = {
  id?: string;
  email?: string;
  role?: EmployerRole;
  can_manage_notification_routing?: boolean;
  location_name?: string | null;
};

type TeamMemberRow = {
  id: string;
  email: string;
  location_name: string | null;
  user_id: string | null;
  role: EmployerRole;
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

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,location_name,user_id,role,status,can_manage_notification_routing,created_at,updated_at,invite_token")
      .eq("account_id", context.accountId)
      .in("status", ["active", "invited", "pending"])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message || "Could not load team users.");
    return NextResponse.json({ members: data ?? [] });
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

    if (!email || !EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid team user email." }, { status: 400 });
    if (!role) return NextResponse.json({ error: "Choose a valid access level." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
    const admin = supabaseAdmin;

    const { data: users } = await admin.auth.admin.listUsers();
    const matchedUser = users.users.find((candidate) => candidate.email?.toLowerCase() === email);

    const now = new Date().toISOString();
    const upsertPayload = {
      account_id: context.accountId,
      email,
      user_id: matchedUser?.id ?? null,
      auth_user_id: matchedUser?.id ?? null,
      role,
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
        .upsert(payloadToSave, { onConflict: "account_id,lower(btrim(email))" })
        .select("id,email,location_name,user_id,role,status,can_manage_notification_routing,created_at,updated_at,invite_token")
        .single();
    }

    let { data, error } = await upsertTeamMember(upsertPayload);
    if (error?.code === "PGRST204" || error?.code === "42703" || (error?.message ?? "").toLowerCase().includes("auth_user_id")) {
      const fallbackPayload = { ...upsertPayload } as Record<string, unknown>;
      delete fallbackPayload.auth_user_id;
      ({ data, error } = await upsertTeamMember(fallbackPayload));
    }

    if (error) throw new Error(error.message || "Could not save team user.");

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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save team user." }, { status: 500 });
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
    const locationName = cleanLocationName(payload?.location_name);
    if (!id || !role) return NextResponse.json({ error: "Choose a team member and valid access level." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .update({
        role,
        location_name: locationName,
        can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select("id,email,location_name,user_id,role,status,can_manage_notification_routing,created_at,updated_at,invite_token")
      .single();

    if (error) throw new Error(error.message || "Could not update team user.");
    return NextResponse.json({ member: data });
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

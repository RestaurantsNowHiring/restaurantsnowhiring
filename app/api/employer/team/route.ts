import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { EmployerRole, getEmployerAccountContext } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { sendTeamInviteEmail } from "../../../../lib/teamInviteEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set<EmployerRole>(["account_owner", "hiring_manager", "viewer"]);

type TeamPayload = {
  id?: string;
  email?: string;
  role?: EmployerRole;
  can_manage_notification_routing?: boolean;
};

type TeamMemberRow = {
  id: string;
  email: string;
  user_id: string | null;
  role: EmployerRole;
  status: string;
  can_manage_notification_routing: boolean;
  created_at: string;
  updated_at: string;
};

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function cleanRole(value: unknown): EmployerRole | null {
  return ROLES.has(value as EmployerRole) ? (value as EmployerRole) : null;
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

    const context = await getEmployerAccountContext(user);
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,user_id,role,status,can_manage_notification_routing,created_at,updated_at")
      .eq("account_id", context.accountId)
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

    const context = await getEmployerAccountContext(user);
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

    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = users.users.find((candidate) => candidate.email?.toLowerCase() === email);

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .upsert(
        {
          account_id: context.accountId,
          email,
          user_id: matchedUser?.id ?? null,
          role,
          status: "active",
          can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing),
          invited_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,email" },
      )
      .select("id,email,user_id,role,status,can_manage_notification_routing,created_at,updated_at")
      .single();

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

    const context = await getEmployerAccountContext(user);
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as TeamPayload | null;
    const id = payload?.id?.trim();
    const role = cleanRole(payload?.role);
    if (!id || !role) return NextResponse.json({ error: "Choose a team member and valid access level." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .update({
        role,
        can_manage_notification_routing: Boolean(payload?.can_manage_notification_routing),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select("id,email,user_id,role,status,can_manage_notification_routing,created_at,updated_at")
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

    const context = await getEmployerAccountContext(user);
    if (!context.canManageTeam || !context.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Choose a team member to remove." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { error } = await supabaseAdmin
      .from("employer_team_members")
      .delete()
      .eq("id", id)
      .eq("account_id", context.accountId)
      .neq("user_id", context.ownerUserId);

    if (error) throw new Error(error.message || "Could not remove team user.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Employer team remove failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove team user." }, { status: 500 });
  }
}

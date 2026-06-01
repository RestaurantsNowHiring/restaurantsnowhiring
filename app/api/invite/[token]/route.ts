import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { EmployerRole } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

const ROLE_LABELS: Record<EmployerRole, string> = {
  account_owner: "Account Owner",
  hiring_manager: "Hiring Manager",
  viewer: "Viewer",
};

type RouteContext = {
  params: Promise<{ token?: string }> | { token?: string };
};

type InviteMemberRow = {
  id: string;
  invite_token: string | null;
  account_id: string;
  email: string;
  user_id: string | null;
  role: EmployerRole;
  status: string;
  invited_by_user_id: string | null;
  employer_accounts: {
    id: string;
    account_name: string | null;
    restaurant_brand_name: string | null;
    company_name: string | null;
  } | null;
};

function cleanToken(value: string | undefined) {
  return (value ?? "").trim();
}

function accountDisplayName(account: InviteMemberRow["employer_accounts"]) {
  return account?.account_name?.trim() || account?.restaurant_brand_name?.trim() || account?.company_name?.trim() || "this employer account";
}

async function findInvite(token: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const { data, error } = await supabaseAdmin
    .from("employer_team_members")
    .select("id,invite_token,account_id,email,user_id,role,status,invited_by_user_id,employer_accounts(id,account_name,restaurant_brand_name,company_name)")
    .eq("invite_token", token)
    .in("status", ["invited", "active"])
    .maybeSingle();

  if (error) throw new Error(error.message || "Could not load invitation.");
  return (data ?? null) as InviteMemberRow | null;
}

async function getInviterEmail(inviterUserId: string | null) {
  if (!inviterUserId) return "Your account owner";
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(inviterUserId);
  if (error || !data.user?.email) return "Your account owner";
  return data.user.email;
}

async function invitePayload(invite: InviteMemberRow) {
  const inviterEmail = await getInviterEmail(invite.invited_by_user_id);

  return {
    invitedEmail: invite.email,
    employerAccountName: accountDisplayName(invite.employer_accounts),
    accessLevel: ROLE_LABELS[invite.role] ?? invite.role,
    invitedBy: inviterEmail,
    status: invite.status,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const params = await Promise.resolve(context.params);
    const token = cleanToken(params.token);
    if (!token) return NextResponse.json({ error: "Invitation link is missing a token." }, { status: 400 });

    const invite = await findInvite(token);
    if (!invite) return NextResponse.json({ error: "This invitation link is invalid or has expired." }, { status: 404 });

    return NextResponse.json({ invite: await invitePayload(invite) });
  } catch (error) {
    console.error("Invite load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load invitation." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Log in or create an account to accept this invitation." }, { status: 401 });

    const params = await Promise.resolve(context.params);
    const token = cleanToken(params.token);
    if (!token) return NextResponse.json({ error: "Invitation link is missing a token." }, { status: 400 });

    const invite = await findInvite(token);
    if (!invite) return NextResponse.json({ error: "This invitation link is invalid or has expired." }, { status: 404 });

    const invitedEmail = invite.email.trim().toLowerCase();
    const userEmail = user.email.trim().toLowerCase();
    if (userEmail !== invitedEmail) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.email}. Please use that email address to accept the invitation.` },
        { status: 403 },
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { error } = await supabaseAdmin
      .from("employer_team_members")
      .update({
        user_id: user.id,
        status: "active",
        invite_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .eq("invite_token", token);

    if (error) throw new Error(error.message || "Could not accept invitation.");

    return NextResponse.json({ ok: true, redirectTo: "/employer-dashboard" });
  } catch (error) {
    console.error("Invite acceptance failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not accept invitation." }, { status: 500 });
  }
}

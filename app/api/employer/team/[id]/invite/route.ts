import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../../../lib/billing";
import { EmployerRole, getEmployerAccountContext } from "../../../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";
import { sendTeamInviteEmail } from "../../../../../../lib/teamInviteEmail";

type RouteContext = {
  params: Promise<{ id?: string }> | { id?: string };
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
  invite_token: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const accountContext = await getEmployerAccountContext(user);
    if (!accountContext.canManageTeam || !accountContext.accountId) {
      return NextResponse.json({ error: "Only Account Owners can manage team access." }, { status: 403 });
    }

    const params = await Promise.resolve(context.params);
    const memberId = params.id?.trim();
    if (!memberId) return NextResponse.json({ error: "Choose a team member to invite." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: member, error } = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,user_id,role,status,can_manage_notification_routing,created_at,updated_at,invite_token")
      .eq("id", memberId)
      .eq("account_id", accountContext.accountId)
      .single();

    if (error) throw new Error(error.message || "Could not load team user.");

    const result = await sendTeamInviteEmail({
      toEmail: (member as TeamMemberRow).email,
      accountName: accountContext.accountName,
      role: (member as TeamMemberRow).role,
      inviterEmail: user.email,
      inviteToken: (member as TeamMemberRow).invite_token ?? (member as TeamMemberRow).id,
    });

    if (!result.ok) {
      console.warn("Employer team invite resend failed", {
        reason: result.reason,
        memberId,
        toEmail: (member as TeamMemberRow).email,
        accountName: accountContext.accountName,
      });

      return NextResponse.json(
        { error: "The team member is still saved, but the invitation email could not be sent. Check Resend configuration and try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Employer team invite resend failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resend team invite." }, { status: 500 });
  }
}

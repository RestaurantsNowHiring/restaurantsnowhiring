import { NextResponse } from "next/server";
import { getAuthUserFromRequest, getSiteUrl } from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${getSiteUrl()}/reset-password`,
    });

    if (error) throw new Error(error.message || "Could not send password reset email.");

    return NextResponse.json({ message: `Password reset email sent to ${user.email}.` });
  } catch (error) {
    console.error("Employer password reset failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Employer password reset failed." },
      { status: 500 },
    );
  }
}

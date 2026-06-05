import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type EmployerAccessScope = "single_location" | "multi_location" | "full_account_access";

type HiringManagerRow = {
  id: string;
  email: string;
  location_name: string | null;
  status: string;
  user_type: EmployerAccessScope;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ managers: [] });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_team_members")
      .select("id,email,location_name,status,user_type")
      .eq("account_id", context.accountId)
      .in("status", ["active", "invited", "pending"])
      .neq("user_type", "single_location")
      .order("location_name", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true });

    if (error) throw new Error(error.message || "Could not load hiring managers.");

    const managers = (data ?? []) as HiringManagerRow[];

    return NextResponse.json({ managers });
  } catch (error) {
    console.error("Employer hiring manager load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load hiring managers." }, { status: 500 });
  }
}

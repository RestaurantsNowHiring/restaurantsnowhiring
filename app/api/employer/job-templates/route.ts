import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getEmployerAccountContext } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user);
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    let query = supabaseAdmin
      .from("employer_job_templates")
      .select("id,employer_account_id,template_name,job_title,role_category,employment_type,schedule,pay_defaults,job_description,benefits,active,is_default,created_at,updated_at")
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("template_name", { ascending: true });

    if (context.accountId) {
      query = query.or(`employer_account_id.is.null,employer_account_id.eq.${context.accountId}`);
    } else {
      query = query.is("employer_account_id", null);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message || "Could not load job templates.");

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("Employer job template load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load job templates." }, { status: 500 });
  }
}

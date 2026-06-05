import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { filterEmployerVisibleJobs, loadEmployerJobsForDashboard } from "../../../../lib/employerVisibleJobs";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { jobs, includesViews } = await loadEmployerJobsForDashboard(supabaseAdmin, context);
    const visibleJobs = filterEmployerVisibleJobs(user, context, jobs);

    return NextResponse.json({ jobs: visibleJobs, includesViews });
  } catch (error) {
    console.error("Employer jobs load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load employer job listings." },
      { status: 500 },
    );
  }
}

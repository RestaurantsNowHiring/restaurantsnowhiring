import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../../../lib/adminAuth";
import { isMissingStatusColumnError } from "../../../../../../lib/jobStatus";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const jobId = id?.trim();

  if (!jobId) {
    return NextResponse.json({ error: "Missing job id." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);
  if (!adminCheck.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: adminCheck.code === "not_admin" ? 403 : 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 }
    );
  }

  const updateWithStatus = await supabaseAdmin.from("jobs").update({ active: false, status: "rejected" }).eq("id", jobId);

  const { error } = isMissingStatusColumnError(updateWithStatus.error)
    ? await supabaseAdmin.from("jobs").update({ active: false }).eq("id", jobId)
    : updateWithStatus;

  if (error) {
    return NextResponse.json({ error: error.message || "Reject update failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../../../lib/adminAuth";
import { isMissingStatusColumnError, normalizePersistedStatus } from "../../../../../../lib/jobStatus";
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

  const updateWithStatus = await supabaseAdmin
    .from("jobs")
    .update({ active: false, status: "rejected" })
    .eq("id", jobId)
    .select("id,active,status")
    .single();

  const writeResult = isMissingStatusColumnError(updateWithStatus.error)
    ? await supabaseAdmin.from("jobs").update({ active: false }).eq("id", jobId).select("id,active").single()
    : updateWithStatus;

  const { error } = writeResult;

  if (error) {
    return NextResponse.json({ error: error.message || "Reject update failed." }, { status: 500 });
  }

  if (!isMissingStatusColumnError(updateWithStatus.error)) {
    const persistedStatus = normalizePersistedStatus(updateWithStatus.data?.status);
    if (persistedStatus !== "rejected") {
      return NextResponse.json(
        { error: `Reject did not persist as rejected (saved status: ${updateWithStatus.data?.status ?? "null"}).` },
        { status: 409 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: jobId,
      active: Boolean(writeResult.data?.active ?? false),
      status: "rejected",
    },
  });
}

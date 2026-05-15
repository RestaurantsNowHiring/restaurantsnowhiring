import { NextResponse } from "next/server";
import { getAdminUserFromAccessToken } from "../../../../lib/adminAuth";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    const admin = token ? await getAdminUserFromAccessToken(token) : { ok: false as const, code: "invalid_session" as const };
    if (!admin.ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("candidate_submissions")
      .select("id,job_id,employer_user_id,employer_email,candidate_name,candidate_email,candidate_phone,message,resume_filename,resume_mime_type,status,created_at,jobs(title,restaurant_name,city,state)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message || "Could not load candidate submissions.");
    return NextResponse.json({ candidates: data ?? [] });
  } catch (error) {
    console.error("Admin candidate submissions load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load candidate submissions." },
      { status: 500 },
    );
  }
}

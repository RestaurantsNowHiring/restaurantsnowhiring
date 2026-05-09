import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type PauseExpiredJobsRpcResult = {
  paused_count?: number;
};

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const headerToken = request.headers.get("x-cron-secret")?.trim() ?? "";

  return bearerToken === cronSecret || headerToken === cronSecret;
}

async function pauseExpiredJobs(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("pause_expired_job_ads");

  if (error) {
    return NextResponse.json({ error: error.message || "Expired job pause failed." }, { status: 500 });
  }

  const rpcResult = Array.isArray(data) ? (data[0] as PauseExpiredJobsRpcResult | undefined) : null;
  const pausedCount = typeof rpcResult?.paused_count === "number" ? rpcResult.paused_count : 0;

  return NextResponse.json({ ok: true, paused_count: pausedCount });
}

export async function GET(request: Request) {
  return pauseExpiredJobs(request);
}

export async function POST(request: Request) {
  return pauseExpiredJobs(request);
}

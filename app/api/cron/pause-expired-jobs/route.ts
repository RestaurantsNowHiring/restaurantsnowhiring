import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type RenewExpiredJobsRpcResult = {
  renewed_count?: number;
};

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const headerToken = request.headers.get("x-cron-secret")?.trim() ?? "";
  const queryToken = new URL(request.url).searchParams.get("secret")?.trim() ?? "";

  return bearerToken === cronSecret || headerToken === cronSecret || queryToken === cronSecret;
}

async function renewExpiredJobs(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("renew_expired_job_ads");

    if (error) {
      return NextResponse.json({ error: error.message || "Expired job renewal failed." }, { status: 500 });
    }

    const rpcResult = Array.isArray(data) ? (data[0] as RenewExpiredJobsRpcResult | undefined) : null;
    const renewedCount = typeof rpcResult?.renewed_count === "number" ? rpcResult.renewed_count : 0;

    return NextResponse.json({
      ok: true,
      jobs_auto_renewed: renewedCount,
      renewed_count: renewedCount,
    });
  } catch (error) {
    console.error("Expired job renewal cron failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Expired job renewal cron failed." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return renewExpiredJobs(request);
}

export async function POST(request: Request) {
  return renewExpiredJobs(request);
}

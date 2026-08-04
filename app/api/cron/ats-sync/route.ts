import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runScheduledAtsSyncs } from "../../../../lib/ats/sync/runScheduledAtsSyncs";

function safeSecretEquals(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isAtsSyncCronAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  return Boolean(cronSecret && bearerToken && safeSecretEquals(bearerToken, cronSecret));
}

export async function GET(request: Request) {
  if (!isAtsSyncCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runScheduledAtsSyncs();
  if (result.status === "failed") {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}

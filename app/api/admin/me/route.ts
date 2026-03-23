import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../lib/adminAuth";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ ok: false, reason: "not_signed_in" }, { status: 401 });
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);

  if (!adminCheck.ok) {
    const status = adminCheck.code === "not_admin" ? 403 : 401;
    return NextResponse.json({ ok: false, reason: adminCheck.code }, { status });
  }

  return NextResponse.json({ ok: true, email: adminCheck.email });
}

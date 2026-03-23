import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../lib/adminAuth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { accessToken?: string } | null;
  const accessToken = body?.accessToken?.trim();

  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 400 });
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);

  if (!adminCheck.ok) {
    return NextResponse.json({ error: "You are not authorized to access admin." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true, email: adminCheck.email });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}

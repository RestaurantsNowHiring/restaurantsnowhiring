import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "./adminAuth";

export async function requireAdminApi() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  const admin = await getAdminUserFromAccessToken(token);
  if (!admin.ok) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized." }, { status: admin.code === "not_admin" ? 403 : 401 }) };
  return { ok: true as const, admin };
}

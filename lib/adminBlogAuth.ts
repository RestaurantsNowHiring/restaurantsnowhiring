import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromAccessToken,
  isPrimaryBootstrapAdminEmail,
} from "./adminAuth";

export async function getPrimaryBlogAdmin() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    return { ok: false as const, code: "not_signed_in" as const };
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);
  if (!adminCheck.ok) {
    return { ok: false as const, code: adminCheck.code };
  }

  if (!isPrimaryBootstrapAdminEmail(adminCheck.email)) {
    return { ok: false as const, code: "not_primary_admin" as const };
  }

  return { ok: true as const, admin: adminCheck };
}

export async function requirePrimaryBlogAdminApi() {
  const admin = await getPrimaryBlogAdmin();

  if (!admin.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Only team@restaurantsnowhiring.com can manage blog drafts." },
        { status: admin.code === "not_signed_in" ? 401 : 403 },
      ),
    };
  }

  return { ok: true as const, admin: admin.admin };
}

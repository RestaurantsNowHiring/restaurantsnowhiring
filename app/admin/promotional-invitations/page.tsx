import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../lib/adminAuth";
import PromotionalInvitationsClient from "./PromotionalInvitationsClient";

export const metadata = { title: "Promotional Invitations Admin", robots: { index: false, follow: false } };

export default async function PromotionalInvitationsPage() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login?next=/admin/promotional-invitations");
  const admin = await getAdminUserFromAccessToken(token);
  if (!admin.ok) redirect(admin.code === "not_admin" ? "/admin/unauthorized" : "/admin/login?next=/admin/promotional-invitations");
  return <PromotionalInvitationsClient />;
}

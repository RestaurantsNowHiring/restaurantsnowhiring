import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../lib/adminAuth";
import CandidateResourcesAdmin from "./CandidateResourcesAdmin";
export default async function Page() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) redirect("/admin/login?next=/admin/candidate-resources");
  const admin = await getAdminUserFromAccessToken(token);
  if (!admin.ok) redirect(admin.code === "not_admin" ? "/admin/unauthorized" : "/admin/login?next=/admin/candidate-resources");
  return <CandidateResourcesAdmin />;
}

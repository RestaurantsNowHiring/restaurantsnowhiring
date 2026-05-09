import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminPageClient from "./AdminPageClient";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../lib/adminAuth";

export const metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    redirect("/admin/login?next=/admin");
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);

  if (!adminCheck.ok) {
    if (adminCheck.code === "not_admin") {
      redirect("/admin/unauthorized");
    }

    redirect("/admin/login?next=/admin");
  }

  return <AdminPageClient />;
}

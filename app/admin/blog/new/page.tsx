import { redirect } from "next/navigation";
import { getPrimaryBlogAdmin } from "../../../../lib/adminBlogAuth";
import { BlogAdminShell } from "../BlogAdminShell";
import BlogEditorClient from "../BlogEditorClient";

export const metadata = {
  title: "New Blog Draft",
  robots: { index: false, follow: false },
};

export default async function NewBlogDraftPage() {
  const admin = await getPrimaryBlogAdmin();
  if (!admin.ok) {
    if (admin.code === "not_signed_in") redirect("/admin/login?next=/admin/blog/new");
    redirect("/admin/unauthorized");
  }

  return (
    <BlogAdminShell>
      <BlogEditorClient />
    </BlogAdminShell>
  );
}

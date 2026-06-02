import { notFound, redirect } from "next/navigation";
import { getPrimaryBlogAdmin } from "../../../../lib/adminBlogAuth";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import type { BlogPost } from "../../../../lib/blogPosts";
import { BlogAdminShell } from "../BlogAdminShell";
import BlogEditorClient from "../BlogEditorClient";
import { homeCardStyle } from "../../../styles/homepageDesignSystem";

export const metadata = {
  title: "Edit Blog Draft",
  robots: { index: false, follow: false },
};

export default async function EditBlogDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await getPrimaryBlogAdmin();
  if (!admin.ok) {
    if (admin.code === "not_signed_in") redirect(`/admin/login?next=/admin/blog/${encodeURIComponent(id)}`);
    redirect("/admin/unauthorized");
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return (
      <BlogAdminShell>
        <section style={homeCardStyle}>Supabase service role is not configured on the server.</section>
      </BlogAdminShell>
    );
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select("id,title,slug,category,excerpt,content,status,meta_title,meta_description,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  return (
    <BlogAdminShell>
      <BlogEditorClient post={data as BlogPost} />
    </BlogAdminShell>
  );
}

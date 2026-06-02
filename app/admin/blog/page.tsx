import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getPrimaryBlogAdmin } from "../../../lib/adminBlogAuth";
import { getSupabaseAdminClient } from "../../../lib/supabaseAdmin";
import type { BlogPost } from "../../../lib/blogPosts";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";
import { BlogAdminShell } from "./BlogAdminShell";

export const metadata = {
  title: "Admin Blog Drafts",
  robots: { index: false, follow: false },
};

function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(isoDate));
}

export default async function AdminBlogPage() {
  const admin = await getPrimaryBlogAdmin();
  if (!admin.ok) {
    if (admin.code === "not_signed_in") redirect("/admin/login?next=/admin/blog");
    redirect("/admin/unauthorized");
  }

  const supabaseAdmin = getSupabaseAdminClient();
  let posts: BlogPost[] = [];
  let error: string | null = null;

  if (!supabaseAdmin) {
    error = "Supabase service role is not configured on the server.";
  } else {
    const result = await supabaseAdmin
      .from("blog_posts")
      .select("id,title,slug,category,excerpt,content,status,meta_title,meta_description,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (result.error) error = result.error.message || "Could not load blog drafts.";
    else posts = (result.data ?? []) as BlogPost[];
  }

  const tableWrap: CSSProperties = {
    overflowX: "auto",
    borderRadius: 14,
    border: `1px solid ${homeTheme.border}`,
    backgroundColor: "#fff",
  };

  const thTdCommon: CSSProperties = {
    textAlign: "left",
    padding: "12px 14px",
    borderBottom: `1px solid ${homeTheme.border}`,
    fontSize: 14,
    fontFamily: "var(--font-body)",
    color: homeTheme.text,
    whiteSpace: "nowrap",
  };

  return (
    <BlogAdminShell>
      <section style={homeCardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 8, color: homeTheme.text }}>Saved blog drafts</h2>
            <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
              Drafts stay private until public blog or career center routes are intentionally added later.
            </p>
          </div>
          <Link href="/admin/blog/new" style={homePrimaryButton} className="rn-btn-primary">
            Create New Draft
          </Link>
        </div>

        {error ? (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(173,67,67,.24)", color: "#8a2f2f", backgroundColor: "rgba(173,67,67,.08)", fontWeight: 700 }}>
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
            No blog drafts saved yet. Create the first draft to start building the private content library.
          </div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "rgba(0,0,0,.03)" }}>
                  <th style={thTdCommon}>Title</th>
                  <th style={thTdCommon}>Category</th>
                  <th style={thTdCommon}>Status</th>
                  <th style={thTdCommon}>Updated</th>
                  <th style={thTdCommon}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td style={{ ...thTdCommon, whiteSpace: "normal", minWidth: 280 }}>
                      <strong>{post.title || "Untitled draft"}</strong>
                    </td>
                    <td style={thTdCommon}>{post.category || "—"}</td>
                    <td style={thTdCommon}>{post.status || "draft"}</td>
                    <td style={thTdCommon}>{formatDate(post.updated_at)}</td>
                    <td style={thTdCommon}>
                      <Link href={`/admin/blog/${post.id}`} style={{ ...homeSecondaryButton, padding: "8px 12px", fontSize: 12 }} className="rn-btn-secondary">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </BlogAdminShell>
  );
}

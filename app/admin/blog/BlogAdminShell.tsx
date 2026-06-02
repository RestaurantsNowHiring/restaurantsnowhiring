import Link from "next/link";
import type { ReactNode } from "react";
import {
  homeCardStyle,
  homeSecondaryButton,
  homeTheme,
} from "../../styles/homepageDesignSystem";

export function BlogAdminShell({ children }: { children: ReactNode }) {
  return (
    <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "96px 18px 72px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, color: homeTheme.green, fontSize: 50, lineHeight: 1, fontFamily: "var(--font-heading)" }}>
                Blog Drafts
              </h1>
              <p style={{ marginTop: 12, marginBottom: 0, color: homeTheme.muted, maxWidth: 760, fontWeight: 700, fontSize: 16, lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
                Private writing workspace for future RestaurantsNowHiring career and employer content. Drafts are not linked from or visible on the public site.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/admin" style={homeSecondaryButton} className="rn-btn-secondary">
                Admin Dashboard
              </Link>
              <Link href="/admin/blog" style={homeSecondaryButton} className="rn-btn-secondary">
                Blog Drafts
              </Link>
            </div>
          </div>
          <div style={{ marginTop: 16, border: "1px solid rgba(53,128,110,.22)", backgroundColor: "rgba(53,128,110,.08)", color: homeTheme.green, borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-body)" }}>
            Access is restricted to team@restaurantsnowhiring.com only.
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}

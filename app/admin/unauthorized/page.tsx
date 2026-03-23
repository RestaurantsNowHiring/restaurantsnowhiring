import Link from "next/link";
import { homeCardStyle, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

export default function AdminUnauthorizedPage() {
  return (
    <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh", paddingTop: 110, paddingBottom: 80 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, maxWidth: 680, margin: "0 auto" }}>
          <h1 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 42 }}>Unauthorized</h1>
          <p style={{ marginTop: 12, color: homeTheme.muted, fontWeight: 700, lineHeight: 1.6 }}>
            You are signed in, but this account is not approved for admin access. Contact the site owner to be added to
            ADMIN_ALLOWLIST_EMAILS.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/admin/login?reason=unauthorized" style={homeSecondaryButton} className="rn-btn-secondary">
              Back to Admin Login
            </Link>
            <Link href="/" style={homeSecondaryButton} className="rn-btn-secondary">
              Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

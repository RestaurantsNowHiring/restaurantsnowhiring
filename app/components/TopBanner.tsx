import Link from "next/link";
import TopBannerAuth from "./TopBannerAuth";

const navLinkStyle: React.CSSProperties = {
  color: "#fef5ea",
  fontWeight: 800,
  letterSpacing: 0.4,
  textDecoration: "none",
  fontSize: 13,
  whiteSpace: "nowrap",
};

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="banner-link" style={navLinkStyle}>
      {children}
    </Link>
  );
}


export default function TopBanner() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: 50,
        zIndex: 1000,
        backgroundColor: "#35806e",
        borderTop: "1px solid #eae7e2",
        borderBottom: "1px solid #eae7e2",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          height: "100%",
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <nav aria-label="Primary" style={{ display: "flex", gap: 30 }}>
          <NavLink href="/jobs">AVAILABLE JOBS</NavLink>
          <TopBannerAuth slot="primary" />
        </nav>

        <nav aria-label="Account" style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <TopBannerAuth slot="account" />
        </nav>
      </div>
    </div>
  );
}

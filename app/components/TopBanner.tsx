"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase"; // ✅ if TopBanner is in app/components
import { acceptPendingTeamInvitesForCurrentUser } from "../../lib/teamInviteAcceptance";

type BannerLink = {
  href: string;
  label: string;
};

export default function TopBanner() {
  const router = useRouter();
  const pathname = usePathname();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await acceptPendingTeamInvitesForCurrentUser();
      setIsLoggedIn(!!data.session);
      setIsReady(true);
    });

    // Keep UI updated on auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void acceptPendingTeamInvitesForCurrentUser();
      setIsLoggedIn(!!session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setIsMobileMenuOpen(false);

    // Optional: If they were on /post-job, send them to login
    if (pathname === "/post-job") {
      router.replace("/employer-login");
    }
  }

  const navLinks: BannerLink[] = [
  { href: "/jobs", label: "AVAILABLE JOBS" },
  { href: "/companies", label: "COMPANIES" },
  { href: !isLoggedIn ? "/employer-login?next=/post-job" : "/post-job", label: "POST A JOB" },
    ...(isLoggedIn ? [{ href: "/employer-dashboard", label: "DASHBOARD" }] : []),
    { href: "/pricing", label: "PRICING" },
    { href: "/about", label: "ABOUT" },
    { href: "/contact", label: "CONTACT" },
  ];

  return (
    <>
      <div
        className={`top-banner${isMobileMenuOpen ? " top-banner--menu-open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: 58,
          zIndex: 1000,
          backgroundColor: "#35806e",
          borderTop: "1px solid #eae7e2",
          borderBottom: "1px solid #eae7e2",
        }}
      >
        <div
          className="top-banner__inner"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            height: "100%",
            padding: "7px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="top-banner__mobile-header">
            <Link href="/" className="top-banner__brand" onClick={() => setIsMobileMenuOpen(false)}>
              Restaurants Now Hiring
            </Link>
            <button
              type="button"
              className="top-banner__menu-button"
              aria-expanded={isMobileMenuOpen}
              aria-controls="top-banner-menu"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            >
              {isMobileMenuOpen ? "CLOSE" : "MENU"}
            </button>
          </div>

          <div id="top-banner-menu" className="top-banner__menu">
            {/* LEFT SIDE */}
            <div className="top-banner__nav" style={{ display: "flex", gap: 34 }}>
              {navLinks.map((link) => (
                <NavLink
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>

            {/* RIGHT SIDE */}
            <div
              className="top-banner__auth"
              style={{ display: "flex", alignItems: "center", gap: 20 }}
            >
              {/* Prevent flicker before auth check completes */}
              {!isReady ? null : !isLoggedIn ? (
                <Link
                  href="/employer-login"
                  className="banner-link--login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{
                    fontFamily: "var(--font-coldsmith)",
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    fontSize: 25,
                    textDecoration: "none",
                    fontWeight: 200,
                  }}
                >
                  EMPLOYER LOGIN / SIGN UP
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="banner-link--login top-banner__sign-out"
                  style={{
                    fontFamily: "var(--font-coldsmith)",
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    fontSize: 25,
                    textDecoration: "none",
                    fontWeight: 200,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    lineHeight: 1,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  SIGN OUT
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        className={`top-banner__mobile-spacer${isMobileMenuOpen ? " top-banner__mobile-spacer--menu-open" : ""}`}
        aria-hidden="true"
      />
    </>
  );
}

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      className="banner-link"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-coldsmith)",
        letterSpacing: 1.1,
        textTransform: "uppercase",
        textDecoration: "none",
        fontSize: 20,
        fontWeight: 400,
        lineHeight: 1,
      }}
    >
      {children}
    </Link>
  );
}

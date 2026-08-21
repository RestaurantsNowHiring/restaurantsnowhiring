"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [isEmployerMenuOpen, setIsEmployerMenuOpen] = useState(false);
  const employerMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function closeEmployerMenu(event: MouseEvent) {
      if (!employerMenuRef.current?.contains(event.target as Node)) {
        setIsEmployerMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsEmployerMenuOpen(false);
    }

    document.addEventListener("mousedown", closeEmployerMenu);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", closeEmployerMenu);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setIsMobileMenuOpen(false);
    setIsEmployerMenuOpen(false);

    // Optional: If they were on /post-job, send them to login
    if (pathname === "/post-job") {
      router.replace("/employer-login");
    }
  }

  const navLinks: BannerLink[] = [
  { href: "/jobs", label: "AVAILABLE JOBS" },
  { href: "/candidate-resources", label: "CANDIDATE RESOURCES" },
  { href: "/companies", label: "COMPANIES" },
    { href: "/contact", label: "CONTACT" },
  ];

  const postJobHref = !isLoggedIn ? "/employer-login?next=/post-job" : "/post-job";

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
                <NavLink key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)}>
                  {link.label}
                </NavLink>
              ))}
            </div>

            {/* RIGHT SIDE */}
            <div
              className="top-banner__auth"
              style={{ display: "flex", alignItems: "center", gap: 20 }}
            >
              <div
                className={`top-banner__employer-menu${isEmployerMenuOpen ? " is-open" : ""}`}
                ref={employerMenuRef}
                onMouseEnter={() => setIsEmployerMenuOpen(true)}
                onMouseLeave={() => setIsEmployerMenuOpen(false)}
              >
                <div className="top-banner__employer-trigger">
                  <button
                    type="button"
                    className="top-banner__employer-button"
                    aria-label="Toggle For Employers menu"
                    aria-haspopup="menu"
                    aria-expanded={isEmployerMenuOpen}
                    aria-controls="employer-dropdown"
                    onClick={() => setIsEmployerMenuOpen((isOpen) => !isOpen)}
                  >
                    FOR EMPLOYERS <span aria-hidden="true">⌄</span>
                  </button>
                </div>
                <div id="employer-dropdown" className="top-banner__employer-dropdown" role="menu">
                  <Link href={postJobHref} role="menuitem" onClick={() => { setIsEmployerMenuOpen(false); setIsMobileMenuOpen(false); }}>Post a Job</Link>
                  <Link href="/pricing" role="menuitem" onClick={() => { setIsEmployerMenuOpen(false); setIsMobileMenuOpen(false); }}>Pricing</Link>
                  <Link href="/about" role="menuitem" onClick={() => { setIsEmployerMenuOpen(false); setIsMobileMenuOpen(false); }}>About</Link>
                  {isReady && (isLoggedIn ? (
                    <>
                      <Link href="/employer-dashboard" role="menuitem" onClick={() => { setIsEmployerMenuOpen(false); setIsMobileMenuOpen(false); }}>Dashboard</Link>
                      <button type="button" role="menuitem" className="top-banner__employer-dropdown-action" onClick={handleSignOut}>Sign Out</button>
                    </>
                  ) : (
                    <Link href="/employer-login" role="menuitem" onClick={() => { setIsEmployerMenuOpen(false); setIsMobileMenuOpen(false); }}>Employer Login / Sign Up</Link>
                  ))}
                </div>
              </div>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase"; // ✅ if TopBanner is in app/components

export default function TopBanner() {
  const router = useRouter();
  const pathname = usePathname();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
      setIsReady(true);
    });

    // Keep UI updated on auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();

    // Optional: If they were on /post-job, send them to login
    if (pathname === "/post-job") {
      router.replace("/employer-login");
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: 50,
        zIndex: 1000,
        backgroundColor: "#000",
        borderTop: "1px solid #ff7a00",
        borderBottom: "1px solid #ff7a00",
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
        {/* LEFT SIDE */}
        <div style={{ display: "flex", gap: 30 }}>
          <NavLink href="/jobs">AVAILABLE JOBS</NavLink>

          {/* If logged out, Post a Job sends them to login with redirect */}
          {!isLoggedIn ? (
            <NavLink href="/employer-login?next=/post-job">POST A JOB</NavLink>
          ) : (
            <NavLink href="/post-job">POST A JOB</NavLink>
          )}

          <NavLink href="/about">ABOUT</NavLink>
          <NavLink href="/contact">CONTACT</NavLink>
        </div>

        {/* RIGHT SIDE */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Prevent flicker before auth check completes */}
          {!isReady ? null : !isLoggedIn ? (
            <Link
              href="/employer-login"
              className="banner-link--login"
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
              className="banner-link--login"
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
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="banner-link"
      style={{
        fontFamily: "var(--font-coldsmith)",
        letterSpacing: 1.1,
        textTransform: "uppercase",
        textDecoration: "none",
        fontSize: 20,
        fontWeight: 400,
      }}
    >
      {children}
    </Link>
  );
}

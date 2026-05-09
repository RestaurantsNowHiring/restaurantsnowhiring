"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";


const navLinkStyle: React.CSSProperties = {
  color: "#fef5ea",
  fontWeight: 800,
  letterSpacing: 0.4,
  textDecoration: "none",
  fontSize: 13,
  whiteSpace: "nowrap",
};

function AuthNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="banner-link" style={navLinkStyle}>
      {children}
    </Link>
  );
}

function AuthNavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="banner-link"
      style={{
        ...navLinkStyle,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      {children}
    </button>
  );
}

type TopBannerAuthProps = {
  slot: "primary" | "account";
};

type SupabaseModule = typeof import("../../lib/supabase");

let supabaseModulePromise: Promise<SupabaseModule> | null = null;

function loadSupabase() {
  supabaseModulePromise ??= import("../../lib/supabase");
  return supabaseModulePromise;
}

export default function TopBannerAuth({ slot }: TopBannerAuthProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const loadAuthState = async () => {
      const { supabase } = await loadSupabase();
      if (!mounted) return;

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsLoggedIn(Boolean(data.session));

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setIsLoggedIn(Boolean(session));
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    };

    const timeoutId = globalThis.setTimeout(() => {
      void loadAuthState();
    }, 1500);

    return () => {
      mounted = false;
      globalThis.clearTimeout(timeoutId);
      unsubscribe?.();
    };
  }, []);

  async function handleSignOut() {
    const { supabase } = await loadSupabase();
    await supabase.auth.signOut();
    setIsLoggedIn(false);

    if (pathname === "/post-job") {
      router.replace("/employer-login");
    }
  }

  if (slot === "primary") {
    return isLoggedIn ? (
      <AuthNavLink href="/post-job">POST A JOB</AuthNavLink>
    ) : (
      <AuthNavLink href="/employer-login?next=/post-job">POST A JOB</AuthNavLink>
    );
  }

  return isLoggedIn ? (
    <>
      <AuthNavLink href="/employer-dashboard">DASHBOARD</AuthNavLink>
      <AuthNavButton onClick={handleSignOut}>SIGN OUT</AuthNavButton>
    </>
  ) : (
    <AuthNavLink href="/employer-login">EMPLOYER LOGIN</AuthNavLink>
  );
}

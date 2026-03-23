"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/admin";
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailLooksValid = useMemo(() => {
    const value = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }, [email]);

  useEffect(() => {
    if (reason === "unauthorized") {
      setMessage("You are signed in, but this account is not on the admin allowlist.");
    }
  }, [reason]);

  useEffect(() => {
    let mounted = true;

    async function checkAdminSession() {
      const response = await fetch("/api/admin/me", { method: "GET", credentials: "include" });
      if (mounted && response.ok) {
        router.replace(nextUrl);
      }
    }

    checkAdminSession();

    return () => {
      mounted = false;
    };
  }, [nextUrl, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!emailLooksValid) {
      setMessage("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.session?.access_token) {
        setMessage(error?.message ?? "Could not sign in.");
        return;
      }

      const sessionResponse = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });

      if (!sessionResponse.ok) {
        await supabase.auth.signOut();
        setMessage("This account is not authorized for admin access.");
        return;
      }

      router.replace(nextUrl);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh", paddingTop: 110, paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, maxWidth: 560, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(53,128,110,0.2)",
              backgroundColor: "rgba(53,128,110,0.08)",
              color: homeTheme.green,
              fontWeight: 800,
              fontSize: 12,
              fontFamily: "var(--font-body)",
              marginBottom: 14,
            }}
          >
            ADMIN ACCESS
          </div>

          <h1 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1 }}>
            Admin Login
          </h1>
          <p
            style={{
              marginTop: 12,
              color: homeTheme.muted,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              lineHeight: 1.5,
            }}
          >
            Sign in with an approved admin account to access the admin workspace.
          </p>

          <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, letterSpacing: 0.5, fontWeight: 800, color: homeTheme.muted }}>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,.1)",
                  padding: "0 14px",
                  fontSize: 15,
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, letterSpacing: 0.5, fontWeight: 800, color: homeTheme.muted }}>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,.1)",
                  padding: "0 14px",
                  fontSize: 15,
                }}
              />
            </label>

            {message && (
              <div
                role="status"
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(173,67,67,.25)",
                  backgroundColor: "rgba(173,67,67,.08)",
                  color: "#8a2f2f",
                  padding: "10px 12px",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {message}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} style={homePrimaryButton} className="rn-btn-primary">
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <Link href="/" style={homeSecondaryButton} className="rn-btn-secondary">
              Home
            </Link>
            <Link href="/employer-login" style={homeSecondaryButton} className="rn-btn-secondary">
              Employer Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

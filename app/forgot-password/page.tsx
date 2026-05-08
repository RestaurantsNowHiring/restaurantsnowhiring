"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";

type AccountType = "employer" | "admin";

function getAccountType(value: string | null): AccountType {
  return value === "admin" ? "admin" : "employer";
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const accountType = getAccountType(searchParams.get("type"));
  const loginHref = accountType === "admin" ? "/admin/login" : "/employer-login";
  const accountLabel = accountType === "admin" ? "admin" : "employer";

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailLooksValid = useMemo(() => {
    const value = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }, [email]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (!emailLooksValid) {
      setMessageType("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password?type=${accountType}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
        return;
      }

      setMessageType("success");
      setMessage("If an account exists for that email, Supabase will send password reset instructions shortly.");
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
              textTransform: "uppercase",
            }}
          >
            {accountLabel} password reset
          </div>

          <h1 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1 }}>
            Forgot your password?
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
            Enter your email and we’ll send a secure link to reset your password.
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

            {message && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  borderRadius: 12,
                  border: messageType === "error" ? "1px solid rgba(173,67,67,.25)" : "1px solid rgba(53,128,110,.25)",
                  backgroundColor: messageType === "error" ? "rgba(173,67,67,.08)" : "rgba(53,128,110,.08)",
                  color: messageType === "error" ? "#8a2f2f" : homeTheme.green,
                  padding: "10px 12px",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {message}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} style={homePrimaryButton} className="rn-btn-primary">
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <Link href={loginHref} style={homeSecondaryButton} className="rn-btn-secondary">
              Back to Login
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

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}

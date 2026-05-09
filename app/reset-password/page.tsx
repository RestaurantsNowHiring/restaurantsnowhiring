"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";

type AccountType = "employer" | "admin";

function getAccountType(value: string | null): AccountType {
  return value === "admin" ? "admin" : "employer";
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const accountType = getAccountType(searchParams.get("type"));
  const loginHref = accountType === "admin" ? "/admin/login" : "/employer-login";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const passwordsMatch = useMemo(() => password === confirmPassword, [confirmPassword, password]);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setHasRecoverySession(Boolean(data.session));
      }
    }

    checkRecoverySession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessageType("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (!passwordsMatch) {
      setMessageType("error");
      setMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessageType("error");
        setMessage(error.message);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setHasRecoverySession(true);
      setMessageType("success");
      setMessage("Your password has been updated. You can now return to login.");
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
            Update password
          </div>

          <h1 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1 }}>
            Create a new password
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
            Enter and confirm your new password to finish the reset process.
          </p>

          {!hasRecoverySession && (
            <div
              role="status"
              style={{
                marginTop: 16,
                borderRadius: 12,
                border: "1px solid rgba(173,67,67,.25)",
                backgroundColor: "rgba(173,67,67,.08)",
                color: "#8a2f2f",
                padding: "10px 12px",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Use the reset link from your email to update your password. If the link expired, request a new one.
            </div>
          )}

          <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, letterSpacing: 0.5, fontWeight: 800, color: homeTheme.muted }}>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                style={homeInputStyle}
              />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, letterSpacing: 0.5, fontWeight: 800, color: homeTheme.muted }}>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                style={homeInputStyle}
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

            <button type="submit" disabled={isSubmitting || !hasRecoverySession} style={homePrimaryButton} className="rn-btn-primary">
              {isSubmitting ? "Updating…" : "Update password"}
            </button>
          </form>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <Link href={loginHref} style={homeSecondaryButton} className="rn-btn-secondary">
              Back to Login
            </Link>
            <Link href={`/forgot-password?type=${accountType}`} style={homeSecondaryButton} className="rn-btn-secondary">
              Request New Link
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

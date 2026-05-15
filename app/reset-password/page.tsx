"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";

type AccountType = "employer" | "admin";
type RecoveryStatus = "checking" | "ready" | "invalid" | "complete";
type ResetUrlState = {
  isRecoveryLink: boolean;
  errorDescription: string | null;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = [
  `At least ${PASSWORD_MIN_LENGTH} characters`,
  "At least one letter",
  "At least one number",
];

function getAccountType(value: string | null): AccountType {
  return value === "admin" ? "admin" : "employer";
}

function getResetUrlState(): ResetUrlState {
  if (typeof window === "undefined") {
    return { isRecoveryLink: false, errorDescription: null, code: null, accessToken: null, refreshToken: null };
  }

  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const linkType = hashParams.get("type") ?? queryParams.get("type");
  const errorDescription =
    hashParams.get("error_description") ??
    queryParams.get("error_description") ??
    hashParams.get("error") ??
    queryParams.get("error");

  return {
    isRecoveryLink: linkType === "recovery" || queryParams.has("code"),
    errorDescription,
    code: queryParams.get("code"),
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
  };
}

function getPasswordValidationMessage(value: string) {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (!/[A-Za-z]/.test(value)) {
    return "Password must include at least one letter.";
  }

  if (!/\d/.test(value)) {
    return "Password must include at least one number.";
  }

  return null;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountType = getAccountType(searchParams.get("type"));
  const loginHref = accountType === "admin" ? "/admin/login" : "/employer-login";
  const successHref = accountType === "admin" ? "/admin" : "/employer-dashboard";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("checking");
  const [isRecoveryLink, setIsRecoveryLink] = useState(false);

  const passwordsMatch = useMemo(() => password === confirmPassword, [confirmPassword, password]);
  const passwordValidationMessage = useMemo(() => getPasswordValidationMessage(password), [password]);
  const canSubmit = recoveryStatus === "ready" && !isSubmitting;

  useEffect(() => {
    let mounted = true;
    const resetUrlState = getResetUrlState();

    setIsRecoveryLink(resetUrlState.isRecoveryLink);

    async function prepareRecoverySession() {
      if (resetUrlState.errorDescription) {
        if (!mounted) return;
        setRecoveryStatus("invalid");
        setMessageType("error");
        setMessage(decodeURIComponent(resetUrlState.errorDescription.replace(/\+/g, " ")));
        return;
      }

      if (resetUrlState.accessToken && resetUrlState.refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: resetUrlState.accessToken,
          refresh_token: resetUrlState.refreshToken,
        });
        if (error) {
          if (!mounted) return;
          setRecoveryStatus("invalid");
          setMessageType("error");
          setMessage(error.message);
          return;
        }
      } else if (resetUrlState.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(resetUrlState.code);
        if (error) {
          if (!mounted) return;
          setRecoveryStatus("invalid");
          setMessageType("error");
          setMessage(error.message);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (resetUrlState.isRecoveryLink && data.session) {
        setRecoveryStatus("ready");
        return;
      }

      setRecoveryStatus("invalid");
    }

    prepareRecoverySession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setIsRecoveryLink(true);
        setRecoveryStatus("ready");
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

    if (recoveryStatus !== "ready") {
      setMessageType("error");
      setMessage("Open the password reset link from your email before choosing a new password.");
      return;
    }

    if (passwordValidationMessage) {
      setMessageType("error");
      setMessage(passwordValidationMessage);
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
      setRecoveryStatus("complete");
      setMessageType("success");
      setMessage("Password updated successfully. Redirecting you now…");

      window.setTimeout(() => {
        router.replace(`${successHref}?passwordUpdated=1`);
      }, 1200);
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

          <h1 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: "clamp(34px, 8vw, 44px)", lineHeight: 1 }}>
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

          {recoveryStatus === "checking" && (
            <div
              role="status"
              style={{
                marginTop: 16,
                borderRadius: 12,
                border: "1px solid rgba(53,128,110,.25)",
                backgroundColor: "rgba(53,128,110,.08)",
                color: homeTheme.green,
                padding: "10px 12px",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Verifying your secure reset link…
            </div>
          )}

          {recoveryStatus === "invalid" && (
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
              {isRecoveryLink
                ? "This reset link is invalid or expired. Please request a new password reset email."
                : "Use the reset link from your email to update your password. If the link expired, request a new one."}
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
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={recoveryStatus === "checking" || recoveryStatus === "complete"}
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
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={recoveryStatus === "checking" || recoveryStatus === "complete"}
                style={homeInputStyle}
              />
            </label>

            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,.08)",
                backgroundColor: "rgba(255,255,255,.55)",
                color: homeTheme.muted,
                padding: "12px 14px",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <p style={{ margin: "0 0 6px 0", fontWeight: 900, color: homeTheme.text }}>Password requirements</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {PASSWORD_REQUIREMENTS.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>

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

            <button type="submit" disabled={!canSubmit} style={homePrimaryButton} className="rn-btn-primary">
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

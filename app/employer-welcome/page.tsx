"use client";

import type React from "react";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

function EmployerWelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email") ?? "";

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(emailFromUrl);
  const [confirmed, setConfirmed] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const displayEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setResendMsg(null);

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!mounted) return;

      if (user?.email) {
        setEmail(user.email.toLowerCase());
      } else if (emailFromUrl) {
        setEmail(emailFromUrl.toLowerCase());
      }

      const isConfirmed = !!user?.email_confirmed_at;
      setConfirmed(isConfirmed);
      setLoading(false);

      if (isConfirmed) {
        router.replace("/post-job");
      }
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [emailFromUrl, router]);

  async function resendConfirmation() {
    setResendMsg(null);

    if (!displayEmail) {
      setResendMsg("Enter your email address above, then resend the confirmation email.");
      return;
    }

    setIsResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: displayEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/check-email`,
        },
      });

      if (error) {
        setResendMsg(`Error: ${error.message}`);
        return;
      }

      setResendMsg("Confirmation email sent. Check your inbox and spam folder.");
    } finally {
      setIsResending(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: homeTheme.muted,
    fontFamily: "var(--font-body)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 52,
    borderRadius: 14,
    border: `1px solid ${homeTheme.border}`,
    padding: "0 14px",
    outline: "none",
    backgroundColor: "#fff",
    color: homeTheme.text,
    colorScheme: "light",
    fontSize: 15,
    fontFamily: "var(--font-body)",
    fontWeight: 700,
  };

  return (
    <main style={{ minHeight: "100vh", backgroundColor: homeTheme.bg, paddingTop: 110, paddingBottom: 80 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid rgba(53,128,110,0.18)",
              backgroundColor: "rgba(53,128,110,0.08)",
              color: homeTheme.green,
              fontWeight: 900,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            EMPLOYER ACCOUNT
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-heading)",
              fontSize: 50,
              lineHeight: 1,
              color: homeTheme.green,
            }}
          >
            Check your email
          </h1>

          <p
            style={{
              margin: "16px auto 0",
              maxWidth: 560,
              color: homeTheme.text,
              fontWeight: 800,
              fontFamily: "var(--font-body)",
              fontSize: 18,
              lineHeight: 1.5,
            }}
          >
            Please confirm your email before posting a job.
          </p>

          <p
            style={{
              margin: "10px auto 0",
              maxWidth: 590,
              color: homeTheme.muted,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              lineHeight: 1.6,
            }}
          >
            Supabase has sent a confirmation link{displayEmail ? ` to ${displayEmail}` : ""}. Click that link to
            unlock job posting for your employer account. If you already confirmed, sign in again and continue to post a
            job.
          </p>

          <div
            style={{
              marginTop: 24,
              padding: 18,
              borderRadius: 18,
              border: `1px solid ${homeTheme.border}`,
              backgroundColor: "#fff",
              textAlign: "left",
            }}
          >
            <label style={labelStyle}>Email address for resend</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={inputStyle}
              placeholder="you@restaurant.com"
            />
            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={isResending}
                style={{
                  ...homePrimaryButton,
                  opacity: isResending ? 0.7 : 1,
                  cursor: isResending ? "not-allowed" : "pointer",
                }}
              >
                {isResending ? "Sending…" : "Resend confirmation"}
              </button>
              <Link href="/employer-login?next=/post-job" style={homeSecondaryButton}>
                Return to login
              </Link>
            </div>

            {resendMsg && (
              <div
                style={{
                  marginTop: 12,
                  color: resendMsg.startsWith("Error") ? "#b00020" : homeTheme.text,
                  fontWeight: 800,
                  fontFamily: "var(--font-body)",
                }}
              >
                {resendMsg}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 18,
              color: homeTheme.muted,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              fontSize: 13,
            }}
          >
            {loading && "Checking your account status…"}
            {!loading && confirmed && "Email confirmed — redirecting you to post a job…"}
            {!loading && !confirmed && "You will not be able to create job posts until your email is confirmed."}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function EmployerWelcomePage() {
  return (
    <Suspense fallback={null}>
      <EmployerWelcomeContent />
    </Suspense>
  );
}

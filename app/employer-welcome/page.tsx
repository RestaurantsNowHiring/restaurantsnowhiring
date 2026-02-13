"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function EmployerWelcomePage() {
  const router = useRouter();

  const BANNER_HEIGHT = 50; // your fixed TopBanner
  const HERO_HEIGHT = 320;

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setResendMsg(null);

      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("WELCOME getSession error:", error);

      const session = data?.session;

      // If logged out, go to login
      if (!session?.user) {
        router.replace("/employer-login");
        return;
      }

      const user = session.user;
      const userEmail = (user.email ?? "").toLowerCase();
      const isConfirmed = !!user.email_confirmed_at;

      if (!mounted) return;

      setEmail(userEmail);
      setConfirmed(isConfirmed);
      setLoading(false);

      // If they ARE confirmed, they shouldn't be here anymore
      if (isConfirmed) {
        router.replace("/");
      }
    }

    load();

    // If auth state changes (confirm link signs them in / out), re-check
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function resendConfirmation() {
    setResendMsg(null);

    if (!email) {
      setResendMsg("Missing email — please log out and log back in.");
      return;
    }

    setIsResending(true);

    try {
      // Supabase JS v2 supports: supabase.auth.resend()
      const anyAuth = supabase.auth as any;

      if (typeof anyAuth.resend !== "function") {
        setResendMsg("Resend not available in this Supabase client.");
        return;
      }

      const { error } = await anyAuth.resend({
        type: "signup",
        email,
      });

      if (error) {
        setResendMsg(`Error: ${error.message}`);
        return;
      }

      setResendMsg("Confirmation email sent. Check your inbox (and spam).");
    } catch (err: any) {
      setResendMsg(`Error: ${err?.message ?? "Unknown error"}`);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* HERO (fixed under banner) */}
      <section
        style={{
          position: "fixed",
          top: BANNER_HEIGHT,
          left: 0,
          width: "100vw",
          height: HERO_HEIGHT,
          zIndex: 900,
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.55) 25%, rgba(0,0,0,.18) 45%, rgba(0,0,0,0) 70%)",
          }}
        />

        <div
          style={{
            position: "relative",
            height: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "42px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 65,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.05,
              fontFamily: "var(--font-coldsmith)",
              letterSpacing: 1,
              textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
              textTransform: "uppercase",
            }}
          >
            {loading ? "Welcome" : confirmed ? "All set" : "Confirm your email"}
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 820,
              color: "rgba(255,255,255,.92)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-coldsmith)",
            }}
          >
            {loading
              ? "Loading your account…"
              : confirmed
              ? "Redirecting you to the homepage…"
              : "Before you can post or manage jobs, please confirm your email address."}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <Link
              href="/"
              className="hero-button"
              style={{
                backgroundColor: "#000000",
                border: "2px solid #000000",
                color: "#ffffff",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 20,
                fontFamily: "var(--font-coldsmith)",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Homepage
            </Link>
          </div>
        </div>
      </section>

      <div style={{ height: BANNER_HEIGHT + HERO_HEIGHT }} />

      {/* Background */}
      <div
        style={{
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "repeat",
          width: "100%",
          minHeight: "100vh",
        }}
      >
        <div style={{ backgroundColor: "rgba(0,0,0,0.10)", width: "100%" }}>
          <section style={{ width: "100vw", padding: "40px 0 80px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              {/* ✅ THE GATE BANNER */}
              {!loading && !confirmed && (
                <div
                  style={{
                    backgroundColor: "rgba(255,255,255,.90)",
                    borderRadius: 14,
                    padding: 18,
                    boxShadow: "0 16px 40px rgba(0,0,0,.35)",
                    border: "2px solid #ff7a00",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-coldsmith)",
                      fontWeight: 900,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontSize: 18,
                      color: "rgba(0,0,0,.88)",
                    }}
                  >
                    Action required: confirm your email
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: "var(--font-coldsmith)",
                      fontWeight: 700,
                      color: "rgba(0,0,0,.78)",
                      lineHeight: 1.6,
                    }}
                  >
                    We sent a confirmation email to{" "}
                    <span style={{ fontWeight: 900 }}>{email}</span>. Please click the link in that email to unlock your
                    employer account.
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={resendConfirmation}
                      disabled={isResending}
                      className="hero-button"
                      style={{
                        height: 46,
                        padding: "0 16px",
                        borderRadius: 10,
                        border: "2px solid #000",
                        backgroundColor: isResending ? "rgba(0,0,0,.20)" : "#ff7a00",
                        color: "#000",
                        fontWeight: 900,
                        cursor: isResending ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-coldsmith)",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {isResending ? "Sending…" : "Resend Email"}
                    </button>

                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="hero-button"
                      style={{
                        height: 46,
                        padding: "0 16px",
                        borderRadius: 10,
                        border: "2px solid #000",
                        backgroundColor: "rgba(0,0,0,.08)",
                        color: "#000",
                        fontWeight: 900,
                        cursor: "pointer",
                        fontFamily: "var(--font-coldsmith)",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      I Confirmed — Refresh
                    </button>
                  </div>

                  {resendMsg && (
                    <div
                      style={{
                        marginTop: 10,
                        fontFamily: "var(--font-coldsmith)",
                        fontWeight: 900,
                        color: resendMsg.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                      }}
                    >
                      {resendMsg}
                    </div>
                  )}
                </div>
              )}

              {/* ✅ Hide everything else until confirmed */}
              {!loading && confirmed && (
                <div
                  style={{
                    backgroundColor: "rgba(255,255,255,.85)",
                    borderRadius: 14,
                    padding: "22px 22px 26px",
                    boxShadow: "0 16px 40px rgba(0,0,0,.35)",
                    border: "1px solid rgba(0,0,0,.10)",
                    fontFamily: "var(--font-coldsmith)",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Email confirmed — redirecting…
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

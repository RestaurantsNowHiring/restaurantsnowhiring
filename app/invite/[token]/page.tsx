"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type InviteDetails = {
  invitedEmail: string;
  employerAccountName: string;
  accessLevel: string;
  invitedBy: string;
  status: string;
};

type Mode = "choose" | "signup" | "login";

const GREEN = "#35806e";
const BG = "#ffffff";
const CARD = "#f6f5f3";
const BORDER = "rgba(0,0,0,.10)";
const TEXT = "rgba(0,0,0,.85)";
const MUTED = "rgba(0,0,0,.62)";
const ERROR = "#b00020";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function InvitePage() {
  const params = useParams<{ token?: string }>();
  const router = useRouter();
  const token = typeof params.token === "string" ? params.token : "";

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const invitedEmail = invite?.invitedEmail ?? "";
  const emailMismatchMessage = useMemo(
    () => (invitedEmail ? `This invite was sent to ${invitedEmail}. Please use that email address to accept the invitation.` : ""),
    [invitedEmail],
  );

  const acceptInvite = useCallback(async (accessToken: string) => {
    const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(payload.error || "Could not accept this invitation.");
      return false;
    }

    router.replace(payload.redirectTo || "/employer-dashboard");
    return true;
  }, [router, token]);

  useEffect(() => {
    let mounted = true;

    async function loadInvite() {
      setLoading(true);
      setMessage(null);

      try {
        const response = await fetch(`/api/invite/${encodeURIComponent(token)}`);
        const payload = await response.json().catch(() => ({}));
        if (!mounted) return;

        if (!response.ok) {
          setMessage(payload.error || "This invitation link is invalid or has expired.");
          setInvite(null);
          return;
        }

        setInvite(payload.invite);
        setEmail(payload.invite.invitedEmail);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (token) loadInvite();
    else {
      setLoading(false);
      setMessage("Invitation link is missing a token.");
    }

    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!invite) return;
    const currentInvite = invite;
    let mounted = true;

    async function acceptExistingSession() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!mounted || !session) return;

      if (normalizeEmail(session.user.email ?? "") !== normalizeEmail(currentInvite.invitedEmail)) {
        setMessage(emailMismatchMessage);
        return;
      }

      await acceptInvite(session.access_token);
    }

    acceptExistingSession();

    return () => {
      mounted = false;
    };
  }, [acceptInvite, invite, emailMismatchMessage]);

  function resetForMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage(null);
    setPassword("");
  }

  function ensureInviteEmail() {
    if (!invite) return false;
    if (normalizeEmail(email) !== normalizeEmail(invite.invitedEmail)) {
      setMessage(emailMismatchMessage);
      return false;
    }
    return true;
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!ensureInviteEmail()) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password });
      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      if (!data.session?.access_token) {
        setMessage("Log in again to accept this invitation.");
        return;
      }

      await acceptInvite(data.session.access_token);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!ensureInviteEmail()) return;

    if (!firstName.trim() || !lastName.trim()) {
      setMessage("Enter your first and last name to create your account.");
      return;
    }

    setSubmitting(true);
    try {
      const signupEmail = normalizeEmail(email);
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/invite/${encodeURIComponent(token)}`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role: "team_member",
            invite_token: token,
          },
        },
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      if (data.session?.access_token) {
        await acceptInvite(data.session.access_token);
        return;
      }

      setMessage(`Check ${signupEmail} to confirm your account, then return to this invitation link to join the team.`);
    } finally {
      setSubmitting(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: MUTED,
    fontFamily: "var(--font-body)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 52,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    padding: "0 14px",
    outline: "none",
    backgroundColor: "#fff",
    color: TEXT,
    colorScheme: "light",
    fontSize: 15,
    fontFamily: "var(--font-body)",
    fontWeight: 700,
  };

  const primaryButton: React.CSSProperties = {
    minHeight: 54,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.08)",
    backgroundColor: GREEN,
    color: "#fff",
    fontWeight: 900,
    cursor: submitting ? "not-allowed" : "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    padding: "0 18px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: submitting ? 0.65 : 1,
  };

  const secondaryButton: React.CSSProperties = {
    ...primaryButton,
    backgroundColor: "#fff",
    color: "rgba(0,0,0,.75)",
    border: `1px solid ${BORDER}`,
  };

  return (
    <main style={{ minHeight: "100vh", backgroundColor: BG, paddingTop: 110, paddingBottom: 80 }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 18px" }}>
        <section
          style={{
            backgroundColor: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 24,
            padding: 30,
            boxShadow: "0 18px 40px rgba(0,0,0,.10)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <img src="/logo-star.png" alt="Restaurants Now Hiring" style={{ height: 30, width: "auto", display: "block" }} />
            <div style={{ fontWeight: 900, color: TEXT, fontFamily: "var(--font-body)", fontSize: 18 }}>
              Restaurants<span style={{ color: GREEN, margin: "0 3px" }}>NOWHiring</span>.com
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid rgba(53,128,110,0.18)",
              backgroundColor: "rgba(53,128,110,0.08)",
              color: GREEN,
              fontWeight: 900,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            TEAM INVITATION
          </div>

          <h1 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: 48, lineHeight: 1.04, color: GREEN }}>
            {invite ? `You’ve been invited to join ${invite.employerAccountName}` : "Accept your team invitation"}
          </h1>

          <p style={{ margin: "14px 0 0", maxWidth: 680, color: TEXT, fontFamily: "var(--font-body)", fontWeight: 750, fontSize: 18, lineHeight: 1.55 }}>
            {invite
              ? `Create an account with ${invite.invitedEmail} to access this team on RestaurantsNOWHiring.com.`
              : "Loading your invitation details…"}
          </p>

          {loading && <p style={{ color: MUTED, fontFamily: "var(--font-body)", fontWeight: 800 }}>Checking your invitation…</p>}

          {invite && (
            <>
              <div
                style={{
                  marginTop: 22,
                  padding: 18,
                  borderRadius: 18,
                  border: "1px solid rgba(53,128,110,0.18)",
                  backgroundColor: "rgba(53,128,110,0.08)",
                  color: TEXT,
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  lineHeight: 1.55,
                }}
              >
                This invitation is only valid for {invite.invitedEmail}. Do not create a new employer workspace. Your
                account will be added to {invite.employerAccountName} automatically.
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
                className="rn-invite-details-grid"
              >
                {[
                  ["Invited email address", invite.invitedEmail],
                  ["Employer account name", invite.employerAccountName],
                  ["Access level", invite.accessLevel],
                  ["Invited by", invite.invitedBy],
                ].map(([label, value]) => (
                  <div key={label} style={{ backgroundColor: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
                    <div style={{ color: MUTED, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", marginBottom: 6 }}>
                      {label}
                    </div>
                    <div style={{ color: TEXT, fontFamily: "var(--font-body)", fontWeight: 900, overflowWrap: "anywhere" }}>{value}</div>
                  </div>
                ))}
              </div>

              <p style={{ margin: "18px 0 0", color: MUTED, fontFamily: "var(--font-body)", fontWeight: 750, lineHeight: 1.6 }}>
                To join this team, create an account using the email address that received this invitation. If you
                already have an account with this email, log in instead.
              </p>

              {mode === "choose" && (
                <div style={{ marginTop: 22, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => resetForMode("signup")} style={primaryButton}>
                    Create Account &amp; Join Team
                  </button>
                  <button type="button" onClick={() => resetForMode("login")} style={secondaryButton}>
                    Log In &amp; Join Team
                  </button>
                </div>
              )}

              {mode === "signup" && (
                <form onSubmit={handleSignup} style={{ display: "grid", gap: 14, marginTop: 22 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="rn-invite-details-grid">
                    <div>
                      <label htmlFor="invite-first-name" style={labelStyle}>First name</label>
                      <input id="invite-first-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} style={inputStyle} autoComplete="given-name" />
                    </div>
                    <div>
                      <label htmlFor="invite-last-name" style={labelStyle}>Last name</label>
                      <input id="invite-last-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} style={inputStyle} autoComplete="family-name" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="invite-signup-email" style={labelStyle}>Email address</label>
                    <input id="invite-signup-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="invite-signup-password" style={labelStyle}>Create password</label>
                    <input id="invite-signup-password" required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} autoComplete="new-password" />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="submit" disabled={submitting} style={primaryButton}>{submitting ? "Working…" : "Create Account & Join Team"}</button>
                    <button type="button" onClick={() => resetForMode("choose")} style={secondaryButton}>Back</button>
                  </div>
                </form>
              )}

              {mode === "login" && (
                <form onSubmit={handleLogin} style={{ display: "grid", gap: 14, marginTop: 22 }}>
                  <div>
                    <label htmlFor="invite-login-email" style={labelStyle}>Email address</label>
                    <input id="invite-login-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="invite-login-password" style={labelStyle}>Password</label>
                    <input id="invite-login-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} autoComplete="current-password" />
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="submit" disabled={submitting} style={primaryButton}>{submitting ? "Working…" : "Log In & Join Team"}</button>
                    <button type="button" onClick={() => resetForMode("choose")} style={secondaryButton}>Back</button>
                  </div>
                </form>
              )}
            </>
          )}

          {message && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                marginTop: 18,
                color: message.startsWith("Error") || message.startsWith("This invite") || message.startsWith("This invitation") ? ERROR : TEXT,
                fontWeight: 850,
                fontFamily: "var(--font-body)",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <Link href="/" style={{ color: GREEN, fontFamily: "var(--font-body)", fontWeight: 900 }}>
              Back to RestaurantsNOWHiring.com
            </Link>
          </div>
        </section>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 720px) {
              .rn-invite-details-grid {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Mode = "login" | "signup";
type SignupStep = 1 | 2 | 3;

function EmployerLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextUrl = searchParams.get("next") || "/post-job";

  const [mode, setMode] = useState<Mode>("login");
  const [signupStep, setSignupStep] = useState<SignupStep>(1);

  // Shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employerAccountName, setEmployerAccountName] = useState("");
  const [restaurantBrandName, setRestaurantBrandName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobsOpen, setJobsOpen] = useState("");

  const JOBS_OPEN_OPTIONS = ["1", "2–5", "6–10", "11–25", "26–50", "50+"];

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";
  const MUTED = "rgba(0,0,0,.62)";
  const ERROR = "#b00020";

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted || !data?.session) return;

      if (!data.session.user.email_confirmed_at) {
        router.replace(`/check-email?email=${encodeURIComponent(data.session.user.email ?? "")}`);
        return;
      }

      router.replace(nextUrl);
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router, nextUrl]);

  const emailLooksValid = useMemo(() => {
    const v = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }, [email]);

  function resetMessages() {
    setMessage(null);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setIsSubmitting(false);
    resetMessages();

    if (nextMode === "signup") {
      setSignupStep(1);
    }
  }

  function handleSignupEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!emailLooksValid) {
      setMessage("Please enter a valid work email.");
      return;
    }

    setSignupStep(2);
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const emailNotConfirmed = error.message.toLowerCase().includes("email not confirmed");
        setMessage(
          emailNotConfirmed
            ? "Please confirm your email before posting a job. Check your inbox for the confirmation link."
            : `Error: ${error.message}`
        );
        return;
      }

      if (!data.user?.email_confirmed_at) {
        router.replace(`/check-email?email=${encodeURIComponent(data.user?.email ?? email.trim())}`);
        return;
      }

      router.replace(nextUrl);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignupCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      if (
        !firstName.trim() ||
        !lastName.trim() ||
        !employerAccountName.trim() ||
        !restaurantBrandName.trim() ||
        !jobTitle.trim() ||
        !jobsOpen
      ) {
        setMessage("Please fill out all required fields.");
        return;
      }

      const signupEmail = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/check-email`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            employer_account_name: employerAccountName.trim(),
            restaurant_brand_name: restaurantBrandName.trim(),
            company_name: restaurantBrandName.trim(),
            job_title: jobTitle.trim(),
            jobs_open: jobsOpen,
            role: "employer",
          },
        },
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      if (data.user?.email_confirmed_at) {
        router.replace(nextUrl);
        return;
      }

      router.replace(`/check-email?email=${encodeURIComponent(signupEmail)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const pageWrap: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: BG,
    paddingTop: 110,
    paddingBottom: 80,
  };

  const container: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 18px",
  };

  const shell: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 520px",
    gap: 22,
    alignItems: "stretch",
  };

  const card: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 18px 40px rgba(0,0,0,.10)",
  };

  const badgeStyle: React.CSSProperties = {
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
  };

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
    height: 50,
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

  const primaryBtnStyle: React.CSSProperties = {
    height: 54,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.08)",
    backgroundColor: GREEN,
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
    fontFamily: "var(--font-body)",
    fontSize: 15,
  };

  const secondaryBtnStyle: React.CSSProperties = {
    height: 54,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    backgroundColor: "#fff",
    color: "rgba(0,0,0,.75)",
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    boxShadow: "0 10px 22px rgba(0,0,0,.07)",
  };

  const toggleBase: React.CSSProperties = {
    flex: 1,
    height: 46,
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    border: `1px solid ${BORDER}`,
    transition: "all 0.18s ease",
  };

  return (
    <main style={pageWrap}>
      <div style={container}>
        <div style={shell} className="rn-employer-auth-shell">
          {/* Left panel */}
          <section style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <img
                src="/logo-star.png"
                alt="Restaurants Now Hiring"
                style={{ height: 28, width: "auto", display: "block" }}
              />
              <div
                style={{
                  fontWeight: 900,
                  color: TEXT,
                  fontFamily: "var(--font-body)",
                  fontSize: 18,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "baseline",
                }}
              >
                <span>Restaurants</span>
                <span
                  style={{
                    color: GREEN,
                
                    margin: "0 3px",
                  }}
                >
                  NOWHiring
                </span>
                <span>.com</span>
              </div>
            </div>

            <div style={badgeStyle}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: GREEN,
                  display: "inline-block",
                }}
              />
              Employer access
            </div>

            <h1
              style={{
                margin: "16px 0 0 0",
                fontSize: 50,
                lineHeight: 1.02,
                fontWeight: 700,
                letterSpacing: 0,
                color: GREEN,
                fontFamily: "var(--font-heading)",
              }}
            >
              {mode === "login" ? "Log in to manage your jobs." : "Create your employer account."}
            </h1>

            <p
              style={{
                marginTop: 14,
                marginBottom: 0,
                maxWidth: 560,
                color: "rgba(0,0,0,.70)",
                lineHeight: 1.65,
                fontSize: 16,
                fontFamily: "var(--font-body)",
                fontWeight: 600,
              }}
            >
              {mode === "login"
                ? "Access your employer dashboard, manage listings, and continue posting restaurant jobs."
                : "Only create a new employer account when you are starting a new company, franchise, or operator workspace."}
            </p>

            <div
              style={{
                marginTop: 22,
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
              className="rn-employer-auth-benefits"
            >
              {[
                {
                  title: "Post jobs",
                  body: "Create and manage job listings from one dashboard.",
                },
                {
                  title: "Account isolation",
                  body: "Billing, jobs, candidates, and team access stay inside the current employer account.",
                },
                {
                  title: "Built for restaurants",
                  body: "A cleaner hiring experience tailored to restaurant teams.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    backgroundColor: "rgba(255,255,255,.78)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      color: TEXT,
                      fontFamily: "var(--font-body)",
                      marginBottom: 6,
                      fontSize: 15,
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      color: "rgba(0,0,0,.66)",
                      lineHeight: 1.5,
                      fontWeight: 650,
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                    }}
                  >
                    {item.body}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right form panel */}
          <section style={card}>
            <div aria-label="Employer access mode" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
              <button
                type="button"
                aria-pressed={mode === "login"}
                onClick={() => switchMode("login")}
                style={{
                  ...toggleBase,
                  backgroundColor: mode === "login" ? GREEN : "#fff",
                  color: mode === "login" ? "#fff" : "rgba(0,0,0,.75)",
                  boxShadow: mode === "login" ? "0 10px 22px rgba(0,0,0,.10)" : "none",
                }}
              >
                Login
              </button>

              <button
                type="button"
                aria-pressed={mode === "signup"}
                onClick={() => switchMode("signup")}
                style={{
                  ...toggleBase,
                  backgroundColor: mode === "signup" ? GREEN : "#fff",
                  color: mode === "signup" ? "#fff" : "rgba(0,0,0,.75)",
                  boxShadow: mode === "signup" ? "0 10px 22px rgba(0,0,0,.10)" : "none",
                }}
              >
                Sign Up
              </button>
            </div>

            {/* LOGIN */}
            {mode === "login" ? (
              <form onSubmit={handleLoginSubmit} style={{ display: "grid", gap: 16 }}>
                <div>
                  <label htmlFor="employer-login-email" style={labelStyle}>Email</label>
                  <input
                    id="employer-login-email"
                    aria-invalid={!!message && mode === "login"}
                    aria-describedby={message && mode === "login" ? "employer-login-message" : undefined}
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                    placeholder="you@restaurant.com"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="employer-login-password" style={labelStyle}>Password</label>
                  <input
                    id="employer-login-password"
                    aria-invalid={!!message && mode === "login"}
                    aria-describedby={message && mode === "login" ? "employer-login-message" : undefined}
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputStyle}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>

                <div style={{ marginTop: -6, textAlign: "right" }}>
                  <Link
                    href="/forgot-password?type=employer"
                    style={{
                      color: GREEN,
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 900,
                      textDecoration: "none",
                    }}
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    ...primaryBtnStyle,
                    backgroundColor: isSubmitting ? "rgba(53,128,110,.55)" : GREEN,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmitting ? "Working..." : "Log In"}
                </button>

                {message && (
                  <div
                    id="employer-login-message"
                    role="alert"
                    aria-live="polite"
                    style={{
                      marginTop: 2,
                      fontWeight: 800,
                      color: message.startsWith("Error") ? ERROR : TEXT,
                      fontFamily: "var(--font-body)",
                      lineHeight: 1.5,
                    }}
                  >
                    {message}
                  </div>
                )}
              </form>
            ) : (
              <>
                {/* STEP 1 */}
                {signupStep === 1 && (
                  <form onSubmit={handleSignupEmailContinue} style={{ display: "grid", gap: 16 }}>
                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          border: "1px solid rgba(53,128,110,0.24)",
                          backgroundColor: "rgba(53,128,110,0.08)",
                          borderRadius: 16,
                          padding: 16,
                        }}
                      >
                        <h2 style={{ margin: 0, color: GREEN, fontFamily: "var(--font-body)", fontSize: 18 }}>
                          Creating a new employer account?
                        </h2>
                        <p style={{ margin: "8px 0 0 0", color: TEXT, fontFamily: "var(--font-body)", fontWeight: 750, lineHeight: 1.5 }}>
                          Continue here only if you are starting a new company, franchise, or operator account. You will become the Account Owner and get a separate workspace for billing, jobs, candidates, and team access.
                        </p>
                      </div>

                      <div
                        style={{
                          border: `1px solid ${BORDER}`,
                          backgroundColor: "#fff",
                          borderRadius: 16,
                          padding: 16,
                        }}
                      >
                        <h2 style={{ margin: 0, color: TEXT, fontFamily: "var(--font-body)", fontSize: 18 }}>
                          Joining an existing employer account?
                        </h2>
                        <p style={{ margin: "8px 0 0 0", color: MUTED, fontFamily: "var(--font-body)", fontWeight: 750, lineHeight: 1.5 }}>
                          If your company already invited you, please use the invitation link from your email so you are added to the correct employer account.
                        </p>
                      </div>
                    </div>

                    <div
                      role="note"
                      style={{
                        border: "1px solid rgba(176,0,32,0.18)",
                        backgroundColor: "rgba(176,0,32,0.06)",
                        borderRadius: 14,
                        padding: 14,
                        color: TEXT,
                        fontFamily: "var(--font-body)",
                        fontWeight: 850,
                        lineHeight: 1.5,
                      }}
                    >
                      Already invited by your company? Do not create a new employer account. Use your invitation link or contact your account owner.
                    </div>

                    <div>
                      <label htmlFor="signup-work-email" style={labelStyle}>Work Email</label>
                      <input
                        id="signup-work-email"
                        aria-invalid={!!message && mode === "signup" && signupStep === 1}
                        aria-describedby={message && mode === "signup" && signupStep === 1 ? "signup-step-1-message" : undefined}
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={inputStyle}
                        placeholder="you@restaurant.com"
                        autoComplete="email"
                      />
                    </div>

                    <button
                      type="submit"
                      style={{
                        ...primaryBtnStyle,
                        opacity: emailLooksValid ? 1 : 0.82,
                      }}
                    >
                      Continue
                    </button>

                    {message && (
                      <div
                        id="signup-step-1-message"
                        role="alert"
                        aria-live="polite"
                        style={{
                          marginTop: 2,
                          fontWeight: 800,
                          color: message.startsWith("Error") ? ERROR : TEXT,
                          fontFamily: "var(--font-body)",
                          lineHeight: 1.5,
                        }}
                      >
                        {message}
                      </div>
                    )}
                  </form>
                )}

                {/* STEP 2 */}
                {signupStep === 2 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      resetMessages();

                      const p = password;
                      const hasMin = p.length >= 8;
                      const hasUpper = /[A-Z]/.test(p);
                      const hasLower = /[a-z]/.test(p);
                      const hasNumber = /[0-9]/.test(p);

                      if (!hasMin || !hasUpper || !hasLower || !hasNumber) {
                        setMessage(
                          "Password must be at least 8 characters and include uppercase, lowercase, and a number."
                        );
                        return;
                      }

                      setSignupStep(3);
                    }}
                    style={{ display: "grid", gap: 16 }}
                  >
                    <div>
                      <label htmlFor="signup-password" style={labelStyle}>Create Password</label>
                      <input
                        id="signup-password"
                        aria-describedby="signup-password-help"
                        aria-invalid={!!message && mode === "signup" && signupStep === 2}
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={inputStyle}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <div
                        id="signup-password-help"
                        style={{
                          marginTop: 8,
                          fontFamily: "var(--font-body)",
                          fontWeight: 700,
                          fontSize: 12,
                          color: MUTED,
                          lineHeight: 1.5,
                        }}
                      >
                        Must be at least 8 characters and include uppercase, lowercase, and a
                        number.
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          resetMessages();
                          setSignupStep(1);
                        }}
                        style={{ ...secondaryBtnStyle, flex: 1 }}
                      >
                        Back
                      </button>

                      <button type="submit" style={{ ...primaryBtnStyle, flex: 1 }}>
                        Continue
                      </button>
                    </div>

                    {message && (
                      <div
                        id="signup-step-2-message"
                        role="alert"
                        aria-live="polite"
                        style={{
                          marginTop: 2,
                          fontWeight: 800,
                          color: message.startsWith("Error") ? ERROR : TEXT,
                          fontFamily: "var(--font-body)",
                          lineHeight: 1.5,
                        }}
                      >
                        {message}
                      </div>
                    )}
                  </form>
                )}

                {/* STEP 3 */}
                {signupStep === 3 && (
                  <form onSubmit={handleSignupCreateAccount} style={{ display: "grid", gap: 16 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }}
                      className="rn-employer-auth-two-col"
                    >
                      <div>
                        <label htmlFor="signup-first-name" style={labelStyle}>First Name *</label>
                        <input
                          id="signup-first-name"
                          aria-invalid={!!message && mode === "signup" && signupStep === 3 && !firstName.trim()}
                          aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          style={inputStyle}
                          placeholder="Jane"
                          autoComplete="given-name"
                        />
                      </div>

                      <div>
                        <label htmlFor="signup-last-name" style={labelStyle}>Last Name *</label>
                        <input
                          id="signup-last-name"
                          aria-invalid={!!message && mode === "signup" && signupStep === 3 && !lastName.trim()}
                          aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          style={inputStyle}
                          placeholder="Doe"
                          autoComplete="family-name"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="signup-account-name" style={labelStyle}>Employer Account Name *</label>
                      <input
                        id="signup-account-name"
                        aria-invalid={!!message && mode === "signup" && signupStep === 3 && !employerAccountName.trim()}
                        aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                        required
                        value={employerAccountName}
                        onChange={(e) => setEmployerAccountName(e.target.value)}
                        style={inputStyle}
                        placeholder="Acme Restaurant Group"
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-restaurant-brand" style={labelStyle}>Restaurant Brand Name *</label>
                      <input
                        id="signup-restaurant-brand"
                        aria-invalid={!!message && mode === "signup" && signupStep === 3 && !restaurantBrandName.trim()}
                        aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                        required
                        value={restaurantBrandName}
                        onChange={(e) => setRestaurantBrandName(e.target.value)}
                        style={inputStyle}
                        placeholder="MISSION BBQ"
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-job-title" style={labelStyle}>Your Job Title *</label>
                      <input
                        id="signup-job-title"
                        aria-invalid={!!message && mode === "signup" && signupStep === 3 && !jobTitle.trim()}
                        aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                        required
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        style={inputStyle}
                        placeholder="Hiring Manager"
                      />
                    </div>

                    <div>
                      <label htmlFor="signup-jobs-open" style={labelStyle}># Jobs Open *</label>
                      <select
                        id="signup-jobs-open"
                        aria-invalid={!!message && mode === "signup" && signupStep === 3 && !jobsOpen}
                        aria-describedby={message && mode === "signup" && signupStep === 3 ? "signup-step-3-message" : undefined}
                        required
                        value={jobsOpen}
                        onChange={(e) => setJobsOpen(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Select…</option>
                        {JOBS_OPEN_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="signup-confirmed-email" style={labelStyle}>Work Email</label>
                      <input
                        id="signup-confirmed-email"
                        value={email}
                        style={{ ...inputStyle, backgroundColor: "rgba(0,0,0,.04)" }}
                        disabled
                      />
                    </div>

                    <div
                      style={{
                        border: "1px solid rgba(53,128,110,0.18)",
                        backgroundColor: "rgba(53,128,110,0.08)",
                        borderRadius: 14,
                        padding: 14,
                        color: TEXT,
                        fontFamily: "var(--font-body)",
                        fontWeight: 800,
                        lineHeight: 1.5,
                      }}
                    >
                      This creates a new, isolated employer account. The first user is the Account Owner; invited teammates should use their invitation instead.
                    </div>

                    <p
                      style={{
                        margin: 0,
                        maxWidth: "none",
                        color: MUTED,
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        fontWeight: 750,
                        lineHeight: 1.55,
                      }}
                    >
                      By creating an account, you agree to our{" "}
                      <Link
                        href="/terms"
                        style={{ color: GREEN, fontWeight: 900, textDecoration: "underline" }}
                      >
                        Terms & Conditions
                      </Link>{" "}
                      and{" "}
                      <Link
                        href="/privacy"
                        style={{ color: GREEN, fontWeight: 900, textDecoration: "underline" }}
                      >
                        Privacy Policy
                      </Link>
                      .
                    </p>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          resetMessages();
                          setSignupStep(2);
                        }}
                        style={{ ...secondaryBtnStyle, flex: 1 }}
                      >
                        Back
                      </button>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        style={{
                          ...primaryBtnStyle,
                          flex: 1,
                          backgroundColor: isSubmitting ? "rgba(53,128,110,.55)" : GREEN,
                          cursor: isSubmitting ? "not-allowed" : "pointer",
                        }}
                      >
                        {isSubmitting ? "Creating..." : "Create Account"}
                      </button>
                    </div>

                    {message && (
                      <div
                        id="signup-step-3-message"
                        role="alert"
                        aria-live="polite"
                        style={{
                          marginTop: 2,
                          fontWeight: 800,
                          color: message.startsWith("Error") ? ERROR : TEXT,
                          fontFamily: "var(--font-body)",
                          lineHeight: 1.5,
                        }}
                      >
                        {message}
                      </div>
                    )}
                  </form>
                )}
              </>
            )}

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link
                href="/"
                style={{
                  color: "rgba(0,0,0,.72)",
                  textDecoration: "none",
                  fontWeight: 800,
                  borderBottom: "1px solid rgba(0,0,0,.25)",
                  paddingBottom: 2,
                  fontFamily: "var(--font-body)",
                }}
              >
                Back to homepage
              </Link>
            </div>
          </section>
        </div>
      </div>

      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 980px) {
              .rn-employer-auth-shell {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 720px) {
              .rn-employer-auth-benefits {
                grid-template-columns: 1fr !important;
              }

              .rn-employer-auth-two-col {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

export default function EmployerLoginPage() {
  return (
    <Suspense fallback={null}>
      <EmployerLoginForm />
    </Suspense>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Mode = "login" | "signup";
type SignupStep = 1 | 2 | 3;

export default function EmployerLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // If they were redirected here, we’ll send them back after login
  const nextUrl = searchParams.get("next") || "/post-job";

  const [mode, setMode] = useState<Mode>("login");

  // ✅ Multi-step signup
  const [signupStep, setSignupStep] = useState<SignupStep>(1);

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ Step 3 fields (ONLY ONCE — no duplicates)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobsOpen, setJobsOpen] = useState("");

  const JOBS_OPEN_OPTIONS = ["1", "2–5", "6–10", "11–25", "26–50", "50+"];

  // Form UX
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // If already logged in, bounce to next
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted && data?.session) {
        router.replace(nextUrl);
      }
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
    resetMessages();
    setIsSubmitting(false);

    // reset step flow when switching
    if (nextMode === "signup") setSignupStep(1);
  }

  // ✅ Step 1: Email → Continue
  function handleSignupEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();

    if (!emailLooksValid) {
      setMessage("Please enter a valid work email.");
      return;
    }

    setSignupStep(2);
  }

  // ✅ Login submit
  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      router.replace(nextUrl);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ✅ Signup Step 3: Create account + save profile
  async function handleSignupCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      // Basic required checks
      if (
        !firstName.trim() ||
        !lastName.trim() ||
        !companyName.trim() ||
        !jobTitle.trim() ||
        !jobsOpen
      ) {
        setMessage("Please fill out all required fields.");
        return;
      }

      // Create auth account
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(`Error: ${error.message}`);
        return;
      }

      const userId = data?.user?.id;
      if (!userId) {
        setMessage("Account created, but we couldn't finish setup. Please log in.");
        return;
      }

      // ✅ Save employer record (YOUR TABLE NAME: employers)
     

      // ✅ Go to welcome screen after signup
      router.replace("/employer-welcome");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Styles (kept consistent)
  const labelStyle: React.CSSProperties = {
    fontWeight: 900,
    color: "rgba(0,0,0,.85)",
    marginBottom: 8,
    display: "block",
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 18,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 48,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.18)",
    padding: "0 14px",
    outline: "none",
    backgroundColor: "rgba(255,255,255,.95)",
    color: "rgba(0,0,0,.9)",
    fontSize: 14,
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 0.3,
  };

  const primaryBtnStyle: React.CSSProperties = {
    height: 56,
    borderRadius: 12,
    border: "2px solid #000",
    backgroundColor: "#ff7a00",
    color: "#000",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(0,0,0,.25)",
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 22,
  };

  const secondaryBtnStyle: React.CSSProperties = {
    height: 56,
    borderRadius: 12,
    border: "2px solid #000",
    backgroundColor: "rgba(0,0,0,.08)",
    color: "#000",
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 20,
  };

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* Header */}
      <section
        style={{
          width: "100vw",
          paddingTop: 90,
          paddingBottom: 22,
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
          position: "relative",
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
        <div style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "26px 18px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 60,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.05,
              fontFamily: "var(--font-coldsmith)",
              letterSpacing: 1,
              textTransform: "uppercase",
              textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
            }}
          >
            {mode === "login" ? "Employer Login" : "Create Employer Account"}
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 720,
              color: "rgba(255,255,255,.92)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-coldsmith)",
            }}
          >
            {mode === "login"
              ? "Log in to post a job and manage your listings."
              : "Create an employer account to post restaurant jobs and manage listings."}
          </p>
        </div>
      </section>

      {/* Background */}
      <div
        style={{
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "repeat",
          width: "100%",
          minHeight: "calc(100vh - 220px)",
        }}
      >
        <div style={{ backgroundColor: "rgba(0,0,0,0.10)", width: "100%" }}>
          <section style={{ width: "100vw", padding: "34px 0 80px" }}>
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 18px" }}>
              <div
                style={{
                  backgroundColor: "rgba(255,255,255,.85)",
                  borderRadius: 14,
                  padding: "22px 22px 26px",
                  boxShadow: "0 16px 40px rgba(0,0,0,.35)",
                  border: "1px solid rgba(0,0,0,.10)",
                }}
              >
                {/* Mode toggle */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="hero-button"
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 10,
                      border: "2px solid #000",
                      backgroundColor: mode === "login" ? "#ff7a00" : "rgba(0,0,0,.08)",
                      color: "#000",
                      fontWeight: 900,
                      cursor: "pointer",
                      fontFamily: "var(--font-coldsmith)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Login
                  </button>

                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
                    className="hero-button"
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 10,
                      border: "2px solid #000",
                      backgroundColor: mode === "signup" ? "#ff7a00" : "rgba(0,0,0,.08)",
                      color: "#000",
                      fontWeight: 900,
                      cursor: "pointer",
                      fontFamily: "var(--font-coldsmith)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Sign Up
                  </button>
                </div>

                {/* LOGIN FORM */}
                {mode === "login" ? (
                  <form onSubmit={handleLoginSubmit} style={{ display: "grid", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input
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
                      <label style={labelStyle}>Password</label>
                      <input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={inputStyle}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="hero-button"
                      style={{
                        ...primaryBtnStyle,
                        backgroundColor: isSubmitting ? "rgba(0,0,0,.25)" : "#ff7a00",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                      }}
                    >
                      {isSubmitting ? "Working..." : "Log In"}
                    </button>

                    {message && (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          marginTop: 2,
                          fontWeight: 900,
                          color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                          fontFamily: "var(--font-coldsmith)",
                        }}
                      >
                        {message}
                      </div>
                    )}
                  </form>
                ) : (
                  /* SIGNUP FLOW */
                  <>
                    {/* STEP 1 */}
                    {signupStep === 1 && (
                      <form onSubmit={handleSignupEmailContinue} style={{ display: "grid", gap: 14 }}>
                        <div>
                          <label style={labelStyle}>Work Email</label>
                          <input
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
                          className="hero-button"
                          style={{
                            ...primaryBtnStyle,
                            opacity: emailLooksValid ? 1 : 0.75,
                          }}
                        >
                          Continue
                        </button>

                        {message && (
                          <div
                            role="status"
                            aria-live="polite"
                            style={{
                              marginTop: 2,
                              fontWeight: 900,
                              color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                              fontFamily: "var(--font-coldsmith)",
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
                        style={{ display: "grid", gap: 14 }}
                      >
                        <div>
                          <label style={labelStyle}>Create Password</label>
                          <input
                            required
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={inputStyle}
                            placeholder="••••••••"
                            autoComplete="new-password"
                          />
                          <div
                            style={{
                              marginTop: 8,
                              fontFamily: "var(--font-coldsmith)",
                              fontWeight: 800,
                              fontSize: 12,
                              color: "rgba(0,0,0,.70)",
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                            }}
                          >
                            Must be 8+ characters and include uppercase, lowercase, and a number.
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            className="hero-button"
                            onClick={() => {
                              resetMessages();
                              setSignupStep(1);
                            }}
                            style={{ ...secondaryBtnStyle, flex: 1 }}
                          >
                            Back
                          </button>

                          <button type="submit" className="hero-button" style={{ ...primaryBtnStyle, flex: 1 }}>
                            Continue
                          </button>
                        </div>

                        {message && (
                          <div
                            role="status"
                            aria-live="polite"
                            style={{
                              marginTop: 2,
                              fontWeight: 900,
                              color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                              fontFamily: "var(--font-coldsmith)",
                            }}
                          >
                            {message}
                          </div>
                        )}
                      </form>
                    )}

                    {/* STEP 3 */}
                    {signupStep === 3 && (
                      <form onSubmit={handleSignupCreateAccount} style={{ display: "grid", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={labelStyle}>
                              First Name <span style={{ color: "#ff7a00" }}>*</span>
                            </label>
                            <input
                              required
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              style={inputStyle}
                              placeholder="Jane"
                              autoComplete="given-name"
                            />
                          </div>

                          <div>
                            <label style={labelStyle}>
                              Last Name <span style={{ color: "#ff7a00" }}>*</span>
                            </label>
                            <input
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
                          <label style={labelStyle}>
                            Company <span style={{ color: "#ff7a00" }}>*</span>
                          </label>
                          <input
                            required
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            style={inputStyle}
                            placeholder="MISSION BBQ"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>
                            Your Job Title <span style={{ color: "#ff7a00" }}>*</span>
                          </label>
                          <input
                            required
                            value={jobTitle}
                            onChange={(e) => setJobTitle(e.target.value)}
                            style={inputStyle}
                            placeholder="Hiring Manager"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>
                            # Jobs Open <span style={{ color: "#ff7a00" }}>*</span>
                          </label>
                          <select
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
                          <label style={labelStyle}>Work Email</label>
                          <input
                            value={email}
                            style={{ ...inputStyle, backgroundColor: "rgba(0,0,0,.06)" }}
                            disabled
                          />
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            className="hero-button"
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
                            className="hero-button"
                            style={{
                              ...primaryBtnStyle,
                              flex: 1,
                              backgroundColor: isSubmitting ? "rgba(0,0,0,.25)" : "#ff7a00",
                              cursor: isSubmitting ? "not-allowed" : "pointer",
                            }}
                          >
                            {isSubmitting ? "Creating..." : "Create Account"}
                          </button>
                        </div>

                        {message && (
                          <div
                            role="status"
                            aria-live="polite"
                            style={{
                              marginTop: 2,
                              fontWeight: 900,
                              color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                              fontFamily: "var(--font-coldsmith)",
                            }}
                          >
                            {message}
                          </div>
                        )}
                      </form>
                    )}
                  </>
                )}

                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <Link
                    href="/"
                    style={{
                      color: "rgba(0,0,0,.75)",
                      textDecoration: "none",
                      fontWeight: 900,
                      borderBottom: "1px solid rgba(0,0,0,.35)",
                      paddingBottom: 2,
                      fontFamily: "var(--font-coldsmith)",
                      letterSpacing: 0.5,
                    }}
                  >
                    Back to homepage
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

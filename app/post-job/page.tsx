"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function PostJobPage() {
  const router = useRouter();

  // TopBanner is fixed and height is 50 in your TopBanner component
  const BANNER_HEIGHT = 50;
  const HERO_HEIGHT = 320;

  // ✅ auth gate
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      const isLoggedIn = !!data?.session;

      if (!isLoggedIn) {
        // send them to login and bring them back after login
        router.replace(`/employer-login?next=${encodeURIComponent("/post-job")}`);
        return;
      }

      if (mounted) setAuthChecked(true);
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  // ✅ NEW: role category
  const [roleCategory, setRoleCategory] = useState("");

  const [restaurantName, setRestaurantName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [applyEmail, setApplyEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [payRange, setPayRange] = useState("");
  const [address, setAddress] = useState("");
  const [howToApply, setHowToApply] = useState("");
  const [description, setDescription] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ✅ Canonical categories (match your homepage cards)
  const ROLE_CATEGORIES = [
    "Line",
    "Prep",
    "Dish",
    "Server",
    "Cashier",
    "Host",
    "Bartender",
    "Manager",
    "Other",
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.from("jobs").insert([
      {
        restaurant_name: restaurantName.trim(),
        title: jobTitle.trim(),
        role_category: roleCategory, // ✅ NEW
        city: city.trim(),
        state: stateVal.trim().toUpperCase(),
        apply_email: applyEmail.trim(),
        company_website: companyWebsite.trim() || null,
        employment_type: employmentType || null,
        pay_range: payRange.trim() || null,
        address: address.trim() || null,
        how_to_apply: howToApply.trim() || null,
        description: description.trim(),
        active: false, // stays hidden until approved
      },
    ]);

    setIsSubmitting(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    setMessage("Submitted! Your job will be posted after approval.");

    // Reset
    setRoleCategory("");
    setRestaurantName("");
    setJobTitle("");
    setCity("");
    setStateVal("");
    setApplyEmail("");
    setCompanyWebsite("");
    setEmploymentType("");
    setPayRange("");
    setAddress("");
    setHowToApply("");
    setDescription("");
  }

  const labelStyle: React.CSSProperties = {
    fontWeight: 900,
    color: "rgba(0,0,0,.85)",
    marginBottom: 8,
    display: "flex",
    gap: 6,
    alignItems: "center",
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    fontSize: 20,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 48,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.18)",
    padding: "0 14px",
    outline: "none",
    backgroundColor: "rgba(255,255,255,.9)",
    color: "rgba(0,0,0,.9)",
    fontSize: 13,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)",
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 110,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.18)",
    padding: "12px 14px",
    outline: "none",
    backgroundColor: "rgba(255,255,255,.9)",
    color: "rgba(0,0,0,.9)",
    fontSize: 13,
    resize: "vertical",
  };

  // While redirecting (or checking), render nothing (prevents flashing the form)
  if (!authChecked) return null;

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* TOP HERO (FIXED / STICKY UNDER THE BANNER) */}
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
            Post a Job
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 640,
              color: "rgba(255,255,255,.92)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-coldsmith)",
            }}
          >
            Submit a job listing for review. We’ll publish it once approved.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <Link
              href="/jobs"
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
              }}
            >
              BACK TO JOBS
            </Link>

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
              }}
            >
              HOMEPAGE
            </Link>
          </div>
        </div>
      </section>

      {/* Spacer so content starts BELOW TopBanner + fixed hero */}
      <div style={{ height: BANNER_HEIGHT + HERO_HEIGHT }} />

      {/* WOOD BACKGROUND */}
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
        <div style={{ backgroundColor: "rgba(0, 0, 0, 0)", width: "100%" }}>
          <section style={{ width: "100vw", padding: "40px 0 80px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              <div
                style={{
                  backgroundColor: "rgba(255,255,255,.82)",
                  borderRadius: 14,
                  padding: "22px 22px 26px",
                  boxShadow: "0 16px 40px rgba(0,0,0,.35)",
                  border: "1px solid rgba(245, 228, 228, 0.1)",
                }}
              >
                {/* Panel title */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.35)" }} />
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      color: "rgba(0,0,0,.85)",
                      fontFamily: "var(--font-coldsmith)",
                      textTransform: "uppercase",
                    }}
                  >
                    JOB DETAILS
                  </div>
                  <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.35)" }} />
                </div>

                <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
                  {/* Row 1 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>
                        Restaurant Name <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <input
                        required
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                        style={inputStyle}
                        placeholder="MISSION BBQ"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>
                        Job Title <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <input
                        required
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        style={inputStyle}
                        placeholder="Great Service Representative"
                      />
                    </div>
                  </div>

                  {/* Role Category + Employment Type */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>
                        Role Category <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <select
                        required
                        value={roleCategory}
                        onChange={(e) => setRoleCategory(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Select…</option>
                        {ROLE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Employment Type</label>
                      <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} style={inputStyle}>
                        <option value="">Select…</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Seasonal">Seasonal</option>
                        <option value="Temporary">Temporary</option>
                      </select>
                    </div>
                  </div>

                  {/* City + State */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>
                        City <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <input required value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} placeholder="Glen Burnie" />
                    </div>

                    <div>
                      <label style={labelStyle}>
                        State <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <input
                        required
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        style={{ ...inputStyle, width: "100%" }}
                        placeholder="MD"
                        minLength={2}
                        maxLength={2}
                      />
                    </div>
                  </div>

                  {/* Email + Website */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>
                        Contact Email <span style={{ color: "#ff7a00" }}>*</span>
                      </label>
                      <input
                        required
                        type="email"
                        value={applyEmail}
                        onChange={(e) => setApplyEmail(e.target.value)}
                        style={inputStyle}
                        placeholder="Teammate21061@mission-bbq.com"
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Company Website</label>
                      <input
                        type="url"
                        value={companyWebsite}
                        onChange={(e) => setCompanyWebsite(e.target.value)}
                        style={inputStyle}
                        placeholder="https://mission-bbq.com"
                      />
                    </div>
                  </div>

                  {/* Pay + Address */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Pay Range</label>
                      <input value={payRange} onChange={(e) => setPayRange(e.target.value)} style={inputStyle} placeholder="$15–$20/hr + tips" />
                    </div>

                    <div>
                      <label style={labelStyle}>Address (optional)</label>
                      <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} placeholder="7748 Governor Ritchie Hwy" />
                    </div>
                  </div>

                  {/* How to Apply */}
                  <div>
                    <label style={labelStyle}>How to Apply (optional)</label>
                    <input
                      value={howToApply}
                      onChange={(e) => setHowToApply(e.target.value)}
                      style={inputStyle}
                      placeholder="Email resume, apply through Our Website, or walk in Mon–Fri 2–4pm."
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label style={labelStyle}>
                      Job Description <span style={{ color: "#ff7a00" }}>*</span>
                    </label>
                    <textarea
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      style={textareaStyle}
                      placeholder="Responsibilities, schedule, experience required, etc."
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="hero-button"
                    style={{
                      height: 56,
                      borderRadius: 12,
                      border: "2px solid #000",
                      backgroundColor: isSubmitting ? "rgba(0,0,0,.35)" : "#ff7a00",
                      color: "#000",
                      fontWeight: 900,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      boxShadow: "0 10px 20px rgba(0,0,0,.25)",
                      fontFamily: "var(--font-coldsmith)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      fontSize: 25,
                    }}
                  >
                    {isSubmitting ? "Submitting..." : "SUBMIT FOR REVIEW"}
                  </button>

                  {message && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        marginTop: 6,
                        fontWeight: 800,
                        color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                        fontFamily: "var(--font-coldsmith)",
                      }}
                    >
                      {message}
                    </div>
                  )}
                </form>
              </div>

              <div
                style={{
                  marginTop: 14,
                  textAlign: "center",
                  color: "rgba(255,255,255,.85)",
                  fontSize: 13,
                  fontFamily: "var(--font-coldsmith)",
                }}
              >
                Submitted jobs are hidden until approved.
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

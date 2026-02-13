"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

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

const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const PAY_TRANSPARENCY_STATES = new Set([
  "CA",
  "CO",
  "CT",
  "DC",
  "HI",
  "IL",
  "MD",
  "MN",
  "NY",
  "RI",
  "WA",
]);

export default function PostJobPage() {
  const router = useRouter();

  // ✅ auth gate
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      const isLoggedIn = !!data?.session;

      if (!isLoggedIn) {
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

  // ✅ Form state
  const [roleCategory, setRoleCategory] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState(""); // stores 2-letter code
  const [applyEmail, setApplyEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [payRange, setPayRange] = useState("");
  const [address, setAddress] = useState("");
  const [howToApply, setHowToApply] = useState("");
  const [description, setDescription] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const stateCode = (stateVal || "").trim().toUpperCase();
  const isPayRequired = PAY_TRANSPARENCY_STATES.has(stateCode);

  function normalizeWebsite(raw: string) {
    const v = raw.trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    return `https://${v}`;
  }

  function validateForm() {
    const next: Record<string, string> = {};

    if (!restaurantName.trim()) next.restaurantName = "Restaurant name is required.";
    if (!jobTitle.trim()) next.jobTitle = "Job title is required.";
    if (!roleCategory.trim()) next.roleCategory = "Role category is required.";
    if (!city.trim()) next.city = "City is required.";

    if (!stateCode || stateCode.length !== 2) next.stateVal = "Select a valid state.";

    if (!applyEmail.trim()) next.applyEmail = "Contact email is required.";
    else {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applyEmail.trim());
      if (!ok) next.applyEmail = "Enter a valid email address.";
    }

    if (isPayRequired && !payRange.trim()) {
      next.payRange = "This state requires a posted pay range.";
    }

    if (!description.trim()) next.description = "Job description is required.";

    if (companyWebsite.trim()) {
      const normalized = normalizeWebsite(companyWebsite);
      try {
        // eslint-disable-next-line no-new
        new URL(normalized);
      } catch {
        next.companyWebsite = "Enter a valid website (ex: https://example.com).";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!validateForm()) {
      setMessage("Please fix the highlighted fields.");
      return;
    }

    setIsSubmitting(true);

    const website = companyWebsite.trim() ? normalizeWebsite(companyWebsite) : null;

    const { error } = await supabase.from("jobs").insert([
      {
        restaurant_name: restaurantName.trim(),
        title: jobTitle.trim(),
        role_category: roleCategory,
        city: city.trim(),
        state: stateCode,
        apply_email: applyEmail.trim(),
        company_website: website,
        employment_type: employmentType || null,
        pay_range: payRange.trim() || null,
        address: address.trim() || null,
        how_to_apply: howToApply.trim() || null,
        description: description.trim(),
        active: false,
      },
    ]);

    setIsSubmitting(false);

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    setMessage("Submitted! Your job will be posted after approval.");

    setErrors({});
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

  // ✅ No hooks below this point — safe early return
  if (!authChecked) return null;

  // ✅ Theme
  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";

  const pageWrap: React.CSSProperties = {
    backgroundColor: BG,
    minHeight: "100vh",
    paddingTop: 90,
    paddingBottom: 70,
  };

  const container: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 18px",
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginBottom: 18,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 56,
    lineHeight: 1.02,
    fontWeight: 700,
    color: GREEN,
    fontFamily: "var(--font-heading)",
  };

  const subtitleStyle: React.CSSProperties = {
    marginTop: 10,
    marginBottom: 0,
    maxWidth: 720,
    color: "rgba(0,0,0,.70)",
    lineHeight: 1.6,
    fontSize: 16,
    fontFamily: "var(--font-body)",
    fontWeight: 600,
  };

  const topButtons: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginTop: 6,
  };

  const buttonA: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 800,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
  };

  const primaryBtn: React.CSSProperties = {
    ...buttonA,
    backgroundColor: GREEN,
    color: "#fff",
    border: `1px solid rgba(0,0,0,.08)`,
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonA,
    backgroundColor: "#ffffff",
    color: "rgba(0,0,0,.75)",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: "22px 22px 26px",
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  };

  const sectionTitleRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 18,
  };

  const sectionLine: React.CSSProperties = {
    height: 1,
    width: 180,
    background: "rgba(0,0,0,.20)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 800,
    color: TEXT,
    fontFamily: "var(--font-heading)",
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 800,
    color: TEXT,
    marginBottom: 8,
    display: "flex",
    gap: 6,
    alignItems: "center",
    fontFamily: "var(--font-body)",
    fontSize: 14,
  };

  const hintStyle: React.CSSProperties = {
    marginTop: 6,
    color: "rgba(0,0,0,.55)",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
  };

  const errorText: React.CSSProperties = {
    marginTop: 6,
    color: "#b00020",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "var(--font-body)",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    padding: "0 14px",
    outline: "none",
    backgroundColor: "#ffffff",
    color: "rgba(0,0,0,.9)",
    fontSize: 14,
    fontFamily: "var(--font-body)",
    fontWeight: 650,
    boxShadow: "0 6px 14px rgba(0,0,0,.08)",
  };

  const inputError: React.CSSProperties = {
    border: "1px solid rgba(176,0,32,.45)",
    boxShadow: "0 6px 14px rgba(176,0,32,.10)",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputBase,
    height: "auto",
    minHeight: 140,
    padding: "12px 14px",
    resize: "vertical",
  };

  const submitStyle: React.CSSProperties = {
    height: 54,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,.10)",
    backgroundColor: isSubmitting ? "rgba(53, 128, 110, 0.55)" : GREEN,
    color: "#fff",
    fontWeight: 900,
    cursor: isSubmitting ? "not-allowed" : "pointer",
    boxShadow: "0 18px 34px rgba(0,0,0,.18)",
    fontFamily: "var(--font-body)",
    letterSpacing: 0.3,
    fontSize: 16,
  };

  const requiredDot = (
    <span style={{ color: "#b00020", fontWeight: 900, lineHeight: 1 }} aria-hidden="true">
      *
    </span>
  );

  function RoleCategorySelector() {
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {ROLE_CATEGORIES.map((c) => {
          const active = roleCategory === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setRoleCategory(c)}
              style={{
                height: 42,
                padding: "0 14px",
                borderRadius: 999,
                border: active ? `2px solid ${GREEN}` : `1px solid ${BORDER}`,
                backgroundColor: active ? "rgba(53,128,110,.12)" : "#fff",
                color: active ? "rgba(0,0,0,.85)" : "rgba(0,0,0,.72)",
                fontFamily: "var(--font-body)",
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: active ? "0 10px 20px rgba(0,0,0,.10)" : "0 6px 14px rgba(0,0,0,.06)",
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <main style={pageWrap}>
      <div style={container}>
        <div style={headerRow}>
          <div style={{ minWidth: 260 }}>
            <h1 style={titleStyle}>Post a Job</h1>
            <p style={subtitleStyle}>
              Submit a job listing for review. Once approved, it will appear publicly on the site.
            </p>
          </div>

          <div style={topButtons}>
            <Link href="/jobs" style={{
                backgroundColor: "#35806e",
                color: "#fef5ea",
                padding: "10px 20px",
                fontWeight: 600,
                borderRadius: 4,
                textDecoration: "none",
                fontSize: 16,
                fontFamily: "var(--font-body)",
                letterSpacing: 0,
              }}
            >
              Browse Jobs
            </Link>
            <Link href="/" style={{
                backgroundColor: "#35806e",
                color: "#fef5ea",
                padding: "10px 20px",
                fontWeight: 600,
                borderRadius: 4,
                textDecoration: "none",
                fontSize: 16,
                fontFamily: "var(--font-body)",
                letterSpacing: 0,
              }}
              >
              Home
            </Link>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleRow}>
            <div style={sectionLine} />
            <div style={sectionTitle}>Job Details</div>
            <div style={sectionLine} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Restaurant Name {requiredDot}
                </label>
                <input
                  required
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  style={{ ...inputBase, ...(errors.restaurantName ? inputError : {}) }}
                  placeholder="MISSION BBQ"
                />
                {errors.restaurantName ? <div style={errorText}>{errors.restaurantName}</div> : null}
              </div>

              <div>
                <label style={labelStyle}>
                  Job Title {requiredDot}
                </label>
                <input
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  style={{ ...inputBase, ...(errors.jobTitle ? inputError : {}) }}
                  placeholder="Great Service Representative"
                />
                {errors.jobTitle ? <div style={errorText}>{errors.jobTitle}</div> : null}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Role Category {requiredDot}
                </label>
                <RoleCategorySelector />
                {errors.roleCategory ? <div style={errorText}>{errors.roleCategory}</div> : null}
                <div style={hintStyle}>Choose the closest category to help candidates find the role.</div>
              </div>

              <div>
                <label style={labelStyle}>Employment Type</label>
                <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} style={inputBase}>
                  <option value="">Select…</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Seasonal">Seasonal</option>
                  <option value="Temporary">Temporary</option>
                </select>
              </div>
            </div>

            {/* City + State (custom combobox) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  City {requiredDot}
                </label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  style={{ ...inputBase, ...(errors.city ? inputError : {}) }}
                  placeholder="Glen Burnie"
                />
                {errors.city ? <div style={errorText}>{errors.city}</div> : null}
              </div>

              <div>
                <label style={labelStyle}>
                  State {requiredDot}
                </label>
                <StateCombobox
                  value={stateVal}
                  onChange={(code) => setStateVal(code)}
                  states={US_STATES}
                  inputStyle={{ ...inputBase, ...(errors.stateVal ? inputError : {}) }}
                  dropdownStyle={{
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,.12)",
                    boxShadow: "0 18px 34px rgba(0,0,0,.18)",
                    backgroundColor: "#ffffff",
                  }}
                  itemHoverBg="rgba(53,128,110,.10)"
                  accent={GREEN}
                />

                {errors.stateVal ? <div style={errorText}>{errors.stateVal}</div> : null}

                {isPayRequired ? (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(53,128,110,.25)",
                      backgroundColor: "rgba(53,128,110,.10)",
                      color: "rgba(0,0,0,.78)",
                      fontFamily: "var(--font-body)",
                      fontWeight: 800,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    This state requires a posted pay range.
                  </div>
                ) : (
                  <div style={hintStyle}>Pay range required only for some states.</div>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Contact Email {requiredDot}
                </label>
                <input
                  required
                  type="email"
                  value={applyEmail}
                  onChange={(e) => setApplyEmail(e.target.value)}
                  style={{ ...inputBase, ...(errors.applyEmail ? inputError : {}) }}
                  placeholder="hiring@yourrestaurant.com"
                />
                {errors.applyEmail ? <div style={errorText}>{errors.applyEmail}</div> : null}
                <div style={hintStyle}>Where candidates should send applications or questions.</div>
              </div>

              <div>
                <label style={labelStyle}>Company Website</label>
                <input
                  type="url"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                  style={{ ...inputBase, ...(errors.companyWebsite ? inputError : {}) }}
                  placeholder="https://yourrestaurant.com"
                />
                {errors.companyWebsite ? <div style={errorText}>{errors.companyWebsite}</div> : null}
                <div style={hintStyle}>We’ll show it as a clickable link on the job page.</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Pay Range {isPayRequired ? requiredDot : null}
                </label>
                <input
                  value={payRange}
                  onChange={(e) => setPayRange(e.target.value)}
                  style={{ ...inputBase, ...(errors.payRange ? inputError : {}) }}
                  placeholder="$15–$20/hr + tips"
                />
                {errors.payRange ? <div style={errorText}>{errors.payRange}</div> : null}
              </div>

              <div>
                <label style={labelStyle}>Address (optional)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputBase} placeholder="7748 Governor Ritchie Hwy" />
              </div>
            </div>

            <div>
              <label style={labelStyle}>How to Apply (optional)</label>
              <input
                value={howToApply}
                onChange={(e) => setHowToApply(e.target.value)}
                style={inputBase}
                placeholder="Apply on our website, email resume, or walk in Mon–Fri 2–4pm."
              />
              <div style={hintStyle}>If blank, the job page will show “Not listed yet.”</div>
            </div>

            <div>
              <label style={labelStyle}>
                Job Description {requiredDot}
              </label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ ...textareaStyle, ...(errors.description ? inputError : {}) }}
                placeholder="Responsibilities, schedule, experience required, benefits, etc."
              />
              {errors.description ? <div style={errorText}>{errors.description}</div> : null}
              <div style={hintStyle}>Tip: use short paragraphs + bullet points.</div>
            </div>

            <button type="submit" disabled={isSubmitting} style={submitStyle}>
              {isSubmitting ? "Submitting..." : "Submit for Review"}
            </button>

            {message && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 6,
                  fontWeight: 800,
                  color: message.startsWith("Error") ? "#b00020" : "rgba(0,0,0,.85)",
                  fontFamily: "var(--font-body)",
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
            color: "rgba(0,0,0,.65)",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-body)",
          }}
        >
          Submitted jobs are hidden until approved.
        </div>
      </div>
    </main>
  );
}

/** ✅ Custom State dropdown (searchable + styled) */
function StateCombobox({
  value,
  onChange,
  states,
  inputStyle,
  dropdownStyle,
  itemHoverBg,
  accent,
}: {
  value: string; // two-letter code
  onChange: (code: string) => void;
  states: { code: string; name: string }[];
  inputStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  itemHoverBg: string;
  accent: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    const code = (value || "").toUpperCase();
    return states.find((s) => s.code === code) || null;
  }, [states, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return states;
    return states.filter((s) => {
      const a = s.code.toLowerCase();
      const b = s.name.toLowerCase();
      return a.startsWith(q) || b.includes(q);
    });
  }, [query, states]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!wrapperRef.current || !target) return;
      if (!wrapperRef.current.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const displayValue = open ? query : selected ? `${selected.code} — ${selected.name}` : "";

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder="Type MD or Maryland…"
        style={inputStyle}
        aria-label="State"
        autoComplete="off"
      />

      {open && (
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 320,
            overflowY: "auto",
            padding: 8,
            ...dropdownStyle,
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "12px 12px",
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                color: "rgba(0,0,0,.65)",
              }}
            >
              No matches.
            </div>
          ) : (
            filtered.map((s) => {
              const isSelected = selected?.code === s.code;
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => {
                    onChange(s.code);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,.06)",
                    backgroundColor: isSelected ? "rgba(53,128,110,.12)" : "transparent",
                    color: "rgba(0,0,0,.85)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 850,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget.style.backgroundColor as any) = isSelected
                      ? "rgba(53,128,110,.12)"
                      : itemHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget.style.backgroundColor as any) = isSelected
                      ? "rgba(53,128,110,.12)"
                      : "transparent";
                  }}
                >
                  <span>
                    <span style={{ color: accent, fontWeight: 950 }}>{s.code}</span>
                    <span style={{ opacity: 0.8 }}> — {s.name}</span>
                  </span>
                  {isSelected ? (
                    <span style={{ color: accent, fontWeight: 950 }}>Selected</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

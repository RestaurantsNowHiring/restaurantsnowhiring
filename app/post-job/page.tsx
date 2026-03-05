// app/post-job/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Step = 1 | 2 | 3 | 4;

type FormState = {
  // Step 1 — Company Info
  companyName: string;
  employeeCount: string;
  contactName: string;
  workEmail: string;

  // Step 2 — Job Info
  restaurantType: string;
  jobTitle: string;
  roleCategories: string[]; // multi-select
  city: string;
  state: string;

  // Step 3 — Job Details
  employmentTypes: string[]; // multi-select
  schedules: string[]; // multi-select

  payMode: "range" | "min" | "max" | "rate";
  payMin: string;
  payMax: string;
  payRate: string;

  website: string;
  howToApply: string;
  description: string;
  address: string;
  benefits: string[]; // multi-select
};

const EMPLOYEE_OPTIONS = ["1-10", "11-25", "26-75", "76-150", "151-500", "501+"];

const RESTAURANT_TYPES = [
  "Quick Service (Fast Food)",
  "Fast Casual",
  "Casual Dining",
  "Fine Dining",
  "Bar / Pub",
  "Coffee Shop / Bakery",
  "Food Truck",
  "Catering",
  "Franchise Group",
  "Other",
];

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

const EMPLOYMENT_TYPES = ["Full time", "Part time", "Seasonal", "Temporary"];

const SCHEDULE_OPTIONS = [
  "Day shift",
  "Night shift",
  "Morning shift",
  "Evening shift",
  "Overnight shift",
  "Weekends required",
  "Weekdays only (M-F)",
  "Flexible schedule",
  "Rotating schedule",
  "On-call",
  "Overtime",
  "No weekends",
  "Choose your own hours",
  "Other",
];

const BENEFITS_OPTIONS = [
  "Health insurance",
  "Dental insurance",
  "Vision insurance",
  "401(k)",
  "Paid time off",
  "Flexible schedule",
  "Employee discount",
  "Free meals",
  "Tuition assistance",
  "Paid training",
  "Referral bonus",
  "Bonus pay",
  "Overtime available",
  "Career growth",
  "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function buildPayRange(f: FormState) {
  const min = f.payMin.trim();
  const max = f.payMax.trim();
  const rate = f.payRate.trim();

  if (f.payMode === "range") {
    if (!min || !max) return "";
    return `${min} – ${max}`;
  }
  if (f.payMode === "min") return min || "";
  if (f.payMode === "max") return max || "";
  return rate || "";
}

export default function PostJobPage() {
  // Theme tokens (match your green/white site)
  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";
  const MUTED = "rgba(0,0,0,.65)";

  const [step, setStep] = useState<Step>(1);
  const [attemptedNext, setAttemptedNext] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [submitSuccess, setSubmitSuccess] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    companyName: "",
    employeeCount: "",
    contactName: "",
    workEmail: "",

    restaurantType: "",
    jobTitle: "",
    roleCategories: [],
    city: "",
    state: "",

    employmentTypes: [],
    schedules: [],
    payMode: "range",
    payMin: "",
    payMax: "",
    payRate: "",

    website: "",
    howToApply: "",
    description: "",
    address: "",
    benefits: [],
  });

  // Persist draft locally (nice UX)
  useEffect(() => {
    try {
      const key = "rn_post_job_draft_v2";
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FormState>;
        setForm((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const key = "rn_post_job_draft_v2";
      window.localStorage.setItem(key, JSON.stringify(form));
    } catch {}
  }, [form]);

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

  const cardStyle: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  };

  const inputStyle: React.CSSProperties = {
    height: 46,
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    backgroundColor: "#fff",
    color: "rgba(0,0,0,.85)",
    padding: "0 14px",
    outline: "none",
    fontWeight: 750,
    fontFamily: "var(--font-body)",
    boxShadow: "0 6px 14px rgba(0,0,0,.10)",
    width: "100%",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    height: "auto",
    padding: "12px 14px",
    minHeight: 140,
    lineHeight: 1.55,
    fontWeight: 650,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-body)",
    fontWeight: 900,
    color: TEXT,
    fontSize: 14,
  };

  const helpStyle: React.CSSProperties = {
    marginTop: 8,
    color: "rgba(0,0,0,.55)",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    lineHeight: 1.45,
  };

  const errorText: React.CSSProperties = {
    marginTop: 8,
    color: "rgba(180, 30, 30, .95)",
    fontSize: 12,
    fontWeight: 900,
    fontFamily: "var(--font-body)",
  };

  const inputErrorRing: React.CSSProperties = {
    border: "1px solid rgba(180, 30, 30, .35)",
    boxShadow: "0 10px 22px rgba(180,30,30,.10)",
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 900,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
    cursor: "pointer",
  };

  const primaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: GREEN,
    color: "#fff",
    border: "1px solid rgba(0,0,0,.08)",
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: "#ffffff",
    color: "rgba(0,0,0,.75)",
  };

  // ✅ “Pill” styling via real checkbox/radio inputs (prevents focus-jank)
  const pillWrap: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  };

  const pillLabelBase: React.CSSProperties = {
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    backgroundColor: "rgba(0,0,0,.05)",
    padding: "9px 12px",
    fontFamily: "var(--font-body)",
    fontWeight: 900,
    color: "rgba(0,0,0,.72)",
    cursor: "pointer",
    userSelect: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const pillLabelActive: React.CSSProperties = {
    ...pillLabelBase,
    backgroundColor: "rgba(53,128,110,0.14)",
    border: "1px solid rgba(53,128,110,0.35)",
    color: "#2d6e5f",
  };

  const hiddenInput: React.CSSProperties = {
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1,
  };

  const errorsForStep = useMemo(() => {
    const errs: string[] = [];

    if (step === 1) {
      if (!form.companyName.trim()) errs.push("companyName");
      if (!form.employeeCount) errs.push("employeeCount");
      if (!form.contactName.trim()) errs.push("contactName");
      if (!form.workEmail.trim() || !isValidEmail(form.workEmail)) errs.push("workEmail");
    }

    if (step === 2) {
      if (!form.restaurantType) errs.push("restaurantType");
      if (!form.jobTitle.trim()) errs.push("jobTitle");
      if (form.roleCategories.length === 0) errs.push("roleCategories");
      if (!form.city.trim()) errs.push("city");
      if (!form.state) errs.push("state");
    }

    if (step === 3) {
      if (form.employmentTypes.length === 0) errs.push("employmentTypes");
      if (form.schedules.length === 0) errs.push("schedules");

      const payText = buildPayRange(form);
      if (!payText) errs.push("pay");

      if (!form.howToApply.trim()) errs.push("howToApply");
      if (!form.description.trim()) errs.push("description");
    }

    return errs;
  }, [step, form]);

  const stepIsValid = errorsForStep.length === 0;

  function nextStep() {
    setAttemptedNext(true);
    if (!stepIsValid) return;
    setAttemptedNext(false);
    setStep((prev) => (Math.min(4, prev + 1) as Step));
  }

  function prevStep() {
    setAttemptedNext(false);
    setStep((prev) => (Math.max(1, prev - 1) as Step));
  }

  async function submitToSupabase() {
    setAttemptedNext(true);
    if (!stepIsValid) return;

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const pay_range = buildPayRange(form);
      const employment_type = form.employmentTypes.join(", ");
      const role_category = form.roleCategories.join(", ");

      const payload = {
        title: form.jobTitle.trim(),
        restaurant_name: form.companyName.trim(),
        city: form.city.trim(),
        state: form.state,
        description: form.description.trim(),
        apply_email: form.workEmail.trim(), // for MVP, using work email
        how_to_apply: form.howToApply.trim(),
        company_website: form.website.trim() || null,
        address: form.address.trim() || null,
        pay_range: pay_range || null,
        employment_type: employment_type || null,
        role_category: role_category || null,
        active: false, // ✅ pending review by default
      };

      const { error } = await supabase.from("jobs").insert(payload);
      if (error) throw error;

      setSubmitSuccess("Submitted for review. We’ll publish it once approved.");

      // clear draft
      try {
        window.localStorage.removeItem("rn_post_job_draft_v2");
      } catch {}
    } catch (e: any) {
      setSubmitError(e?.message || "Something went wrong submitting this job.");
    } finally {
      setSubmitting(false);
    }
  }

  const SectionTitle = ({ title }: { title: string }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        marginTop: 22,
        marginBottom: 18,
      }}
    >
      <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.20)" }} />
      <div style={{ fontSize: 28, fontWeight: 900, color: GREEN, fontFamily: "var(--font-heading)" }}>
        {title}
      </div>
      <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.20)" }} />
    </div>
  );

  const Field = ({
    label,
    required,
    children,
    hint,
  }: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    hint?: string;
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={labelStyle}>
        {label} {required ? <span style={{ color: "rgba(0,0,0,.55)" }}>*</span> : null}
      </div>
      {children}
      {hint ? <div style={helpStyle}>{hint}</div> : null}
    </div>
  );

  const MultiPills = ({
    options,
    value,
    onChange,
    errorKey,
  }: {
    options: string[];
    value: string[];
    onChange: (next: string[]) => void;
    errorKey?: string;
  }) => (
    <div>
      <div style={pillWrap}>
        {options.map((opt) => {
          const checked = value.includes(opt);
          return (
            <label key={opt} style={checked ? pillLabelActive : pillLabelBase}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(toggleValue(value, opt))}
                style={hiddenInput}
              />
              {opt}
            </label>
          );
        })}
      </div>
      {attemptedNext && errorKey && errorsForStep.includes(errorKey) ? (
        <div style={errorText}>Please select at least one option.</div>
      ) : null}
    </div>
  );

  const SinglePills = ({
    options,
    value,
    onChange,
  }: {
    options: { key: FormState["payMode"]; label: string }[];
    value: FormState["payMode"];
    onChange: (next: FormState["payMode"]) => void;
  }) => (
    <div style={pillWrap}>
      {options.map((opt) => {
        const checked = value === opt.key;
        return (
          <label key={opt.key} style={checked ? pillLabelActive : pillLabelBase}>
            <input
              type="radio"
              name="pay_mode"
              checked={checked}
              onChange={() => onChange(opt.key)}
              style={hiddenInput}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );

  const StepHeader = () => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            fontFamily: "var(--font-heading)",
            color: TEXT,
            lineHeight: 1,
          }}
        >
          Post a Job
        </div>
        <div style={{ marginTop: 10, color: MUTED, fontWeight: 800, fontFamily: "var(--font-body)" }}>
          Step {step} of 4 • Fields marked * are required
        </div>
      </div>

      <Link href="/jobs" style={{ ...secondaryBtn, padding: "12px 16px" }}>
        View jobs
      </Link>
    </div>
  );

  // ✅ FIX: REAL BUTTONS (no preventDefault / no role=button div)
  const StepCard = ({ n, title }: { n: Step; title: string }) => {
    const active = n === step;

    return (
      <button
        type="button"
        onClick={() => {
          // allow going back freely; forward only if current step valid
          if (n <= step) {
            setAttemptedNext(false);
            setStep(n);
            return;
          }

          setAttemptedNext(true);
          if (stepIsValid) {
            setAttemptedNext(false);
            setStep(n);
          }
        }}
        style={{
          borderRadius: 14,
          border: active ? "1px solid rgba(53,128,110,0.28)" : `1px solid ${BORDER}`,
          backgroundColor: active ? "rgba(53,128,110,0.10)" : "#fff",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 72,
          cursor: "pointer",
          userSelect: "none",
          textAlign: "left",
        }}
        aria-current={active ? "step" : undefined}
      >
        <div style={{ fontFamily: "var(--font-body)", fontWeight: 900, color: "rgba(0,0,0,.70)", fontSize: 12 }}>
          STEP {n}
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontWeight: 950, color: TEXT, fontSize: 18 }}>
          {title}
        </div>
      </button>
    );
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    border: `1px solid ${BORDER}`,
    backgroundColor: "rgba(255,255,255,0.70)",
    color: "rgba(0,0,0,.72)",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    fontFamily: "var(--font-body)",
  };

  const PreviewCard = () => {
    const payText = buildPayRange(form);
    return (
      <div
        style={{
          border: `1px solid rgba(0,0,0,.12)`,
          borderRadius: 14,
          backgroundColor: "rgba(255,255,255,.75)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 950, color: TEXT, fontSize: 18, fontFamily: "var(--font-body)" }}>
              {form.jobTitle || "Job Title"}
            </div>
            <div
              style={{
                opacity: 0.85,
                color: "rgba(0,0,0,.70)",
                marginTop: 4,
                fontWeight: 750,
                fontFamily: "var(--font-body)",
              }}
            >
              {form.companyName || "Company"} — {form.city || "City"}, {form.state || "State"}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {payText ? <span style={chipStyle}>{payText}</span> : null}
              {form.employmentTypes.map((t) => (
                <span key={t} style={chipStyle}>{t}</span>
              ))}
              {form.roleCategories.map((c) => (
                <span key={c} style={chipStyle}>{c}</span>
              ))}
            </div>
          </div>

          <div
            style={{
              backgroundColor: GREEN,
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 900,
              boxShadow: "0 10px 22px rgba(0,0,0,.16)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)",
            }}
          >
            View →
          </div>
        </div>

        <div style={{ padding: 16, borderTop: "1px solid rgba(0,0,0,.10)" }}>
          <div style={{ fontWeight: 950, color: TEXT, fontFamily: "var(--font-body)", marginBottom: 8 }}>
            Job description
          </div>
          <div style={{ color: "rgba(0,0,0,.72)", fontWeight: 650, fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
            {form.description || "—"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main style={pageWrap}>
      <div style={container}>
        <div style={cardStyle}>
          <StepHeader />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              marginTop: 18,
            }}
          >
            <StepCard n={1} title="Company info" />
            <StepCard n={2} title="Job info" />
            <StepCard n={3} title="Details" />
            <StepCard n={4} title="Review" />
          </div>

          {/* STEP 1 */}
          {step === 1 ? (
            <>
              <SectionTitle title="Company Info" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Your company’s name" required>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("companyName") ? inputErrorRing : {}),
                    }}
                    placeholder="e.g., Riverstone Grill"
                  />
                  {attemptedNext && errorsForStep.includes("companyName") ? (
                    <div style={errorText}>Company name is required.</div>
                  ) : null}
                </Field>

                <Field label="Your company’s number of employees" required>
                  <select
                    value={form.employeeCount}
                    onChange={(e) => setForm((p) => ({ ...p, employeeCount: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("employeeCount") ? inputErrorRing : {}),
                    }}
                  >
                    <option value="">Select</option>
                    {EMPLOYEE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {attemptedNext && errorsForStep.includes("employeeCount") ? (
                    <div style={errorText}>Number of employees is required.</div>
                  ) : null}
                </Field>

                <Field label="Your first and last name" required>
                  <input
                    value={form.contactName}
                    onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("contactName") ? inputErrorRing : {}),
                    }}
                    placeholder="e.g., Taylor Smith"
                  />
                  {attemptedNext && errorsForStep.includes("contactName") ? (
                    <div style={errorText}>Your first and last name is required.</div>
                  ) : null}
                </Field>

                <Field
                  label="Work Email"
                  required
                  hint="We use your email to follow up about the job post and verification. We do not show it publicly."
                >
                  <input
                    value={form.workEmail}
                    onChange={(e) => setForm((p) => ({ ...p, workEmail: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("workEmail") ? inputErrorRing : {}),
                    }}
                    placeholder="name@company.com"
                    inputMode="email"
                  />
                  {attemptedNext && errorsForStep.includes("workEmail") ? (
                    <div style={errorText}>
                      {!form.workEmail.trim() ? "Work email is required." : "Please enter a valid email."}
                    </div>
                  ) : null}
                </Field>
              </div>
            </>
          ) : null}

          {/* STEP 2 */}
          {step === 2 ? (
            <>
              <SectionTitle title="Job Info" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Type of Restaurant" required>
                  <select
                    value={form.restaurantType}
                    onChange={(e) => setForm((p) => ({ ...p, restaurantType: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("restaurantType") ? inputErrorRing : {}),
                    }}
                  >
                    <option value="">Select</option>
                    {RESTAURANT_TYPES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {attemptedNext && errorsForStep.includes("restaurantType") ? (
                    <div style={errorText}>Restaurant type is required.</div>
                  ) : null}
                </Field>

                <Field label="Job title" required>
                  <input
                    value={form.jobTitle}
                    onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("jobTitle") ? inputErrorRing : {}),
                    }}
                    placeholder="e.g., Line Cook"
                  />
                  {attemptedNext && errorsForStep.includes("jobTitle") ? (
                    <div style={errorText}>Job title is required.</div>
                  ) : null}
                </Field>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Role Category" required hint="Select one or more categories that fit this role.">
                    <MultiPills
                      options={ROLE_CATEGORIES}
                      value={form.roleCategories}
                      onChange={(next) => setForm((p) => ({ ...p, roleCategories: next }))}
                      errorKey="roleCategories"
                    />
                  </Field>
                </div>

                <Field label="City" required hint="We’ll add Google Places autocomplete later.">
                  <input
                    value={form.city}
                    onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("city") ? inputErrorRing : {}),
                    }}
                    placeholder="e.g., Baltimore"
                  />
                  {attemptedNext && errorsForStep.includes("city") ? (
                    <div style={errorText}>City is required.</div>
                  ) : null}
                </Field>

                <Field label="State" required>
                  <select
                    value={form.state}
                    onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                    style={{
                      ...inputStyle,
                      ...(attemptedNext && errorsForStep.includes("state") ? inputErrorRing : {}),
                    }}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  {attemptedNext && errorsForStep.includes("state") ? (
                    <div style={errorText}>State is required.</div>
                  ) : null}
                </Field>
              </div>
            </>
          ) : null}

          {/* STEP 3 */}
          {step === 3 ? (
            <>
              <SectionTitle title="Job Details" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="What type of job is this?" required>
                    <MultiPills
                      options={EMPLOYMENT_TYPES}
                      value={form.employmentTypes}
                      onChange={(next) => setForm((p) => ({ ...p, employmentTypes: next }))}
                      errorKey="employmentTypes"
                    />
                  </Field>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="What is the schedule for this job?" required>
                    <MultiPills
                      options={SCHEDULE_OPTIONS}
                      value={form.schedules}
                      onChange={(next) => setForm((p) => ({ ...p, schedules: next }))}
                      errorKey="schedules"
                    />
                  </Field>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Pay" required hint="For MVP we’ll require pay. Later we can enforce only for certain states.">
                    <SinglePills
                      value={form.payMode}
                      onChange={(m) => setForm((p) => ({ ...p, payMode: m }))}
                      options={[
                        { key: "range", label: "Range" },
                        { key: "min", label: "Minimum" },
                        { key: "max", label: "Maximum" },
                        { key: "rate", label: "Rate" },
                      ]}
                    />

                    <div style={{ height: 10 }} />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {form.payMode === "range" ? (
                        <>
                          <input
                            value={form.payMin}
                            onChange={(e) => setForm((p) => ({ ...p, payMin: e.target.value }))}
                            style={{
                              ...inputStyle,
                              ...(attemptedNext && errorsForStep.includes("pay") ? inputErrorRing : {}),
                            }}
                            placeholder="Minimum (e.g., $15/hr)"
                          />
                          <input
                            value={form.payMax}
                            onChange={(e) => setForm((p) => ({ ...p, payMax: e.target.value }))}
                            style={{
                              ...inputStyle,
                              ...(attemptedNext && errorsForStep.includes("pay") ? inputErrorRing : {}),
                            }}
                            placeholder="Maximum (e.g., $18/hr)"
                          />
                        </>
                      ) : form.payMode === "min" ? (
                        <input
                          value={form.payMin}
                          onChange={(e) => setForm((p) => ({ ...p, payMin: e.target.value }))}
                          style={{
                            ...inputStyle,
                            ...(attemptedNext && errorsForStep.includes("pay") ? inputErrorRing : {}),
                            gridColumn: "1 / -1",
                          }}
                          placeholder="Minimum (e.g., $15/hr)"
                        />
                      ) : form.payMode === "max" ? (
                        <input
                          value={form.payMax}
                          onChange={(e) => setForm((p) => ({ ...p, payMax: e.target.value }))}
                          style={{
                            ...inputStyle,
                            ...(attemptedNext && errorsForStep.includes("pay") ? inputErrorRing : {}),
                            gridColumn: "1 / -1",
                          }}
                          placeholder="Maximum (e.g., $18/hr)"
                        />
                      ) : (
                        <input
                          value={form.payRate}
                          onChange={(e) => setForm((p) => ({ ...p, payRate: e.target.value }))}
                          style={{
                            ...inputStyle,
                            ...(attemptedNext && errorsForStep.includes("pay") ? inputErrorRing : {}),
                            gridColumn: "1 / -1",
                          }}
                          placeholder="Rate (e.g., $16/hr or $55,000/yr)"
                        />
                      )}
                    </div>

                    {attemptedNext && errorsForStep.includes("pay") ? (
                      <div style={errorText}>Pay is required. Please enter a value.</div>
                    ) : null}
                  </Field>
                </div>

                <Field label="Company website">
                  <input
                    value={form.website}
                    onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                    style={inputStyle}
                    placeholder="https://company.com"
                  />
                </Field>

                <Field label="Address">
                  <input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    style={inputStyle}
                    placeholder="Street address (optional)"
                  />
                </Field>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="How to apply" required hint="Example: Apply online, email, or visit in person.">
                    <input
                      value={form.howToApply}
                      onChange={(e) => setForm((p) => ({ ...p, howToApply: e.target.value }))}
                      style={{
                        ...inputStyle,
                        ...(attemptedNext && errorsForStep.includes("howToApply") ? inputErrorRing : {}),
                      }}
                      placeholder="How should job seekers apply?"
                    />
                    {attemptedNext && errorsForStep.includes("howToApply") ? (
                      <div style={errorText}>How to apply is required.</div>
                    ) : null}
                  </Field>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Job description" required>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      style={{
                        ...textareaStyle,
                        ...(attemptedNext && errorsForStep.includes("description") ? inputErrorRing : {}),
                      }}
                      placeholder="Describe responsibilities, requirements, and what makes this role great."
                    />
                    {attemptedNext && errorsForStep.includes("description") ? (
                      <div style={errorText}>Job description is required.</div>
                    ) : null}
                  </Field>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Benefits">
                    <div style={{ ...pillWrap, gap: 10 }}>
                      {BENEFITS_OPTIONS.map((b) => {
                        const checked = form.benefits.includes(b);
                        return (
                          <label key={b} style={checked ? pillLabelActive : pillLabelBase}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setForm((p) => ({ ...p, benefits: toggleValue(p.benefits, b) }))}
                              style={hiddenInput}
                            />
                            {b}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          {/* STEP 4 */}
          {step === 4 ? (
            <>
              <SectionTitle title="Review" />

              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 }}>
                <div
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${BORDER}`,
                    backgroundColor: "rgba(255,255,255,.75)",
                    padding: 16,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 900, color: TEXT }}>
                    Review your job post
                  </div>

                  <div style={{ marginTop: 14, fontFamily: "var(--font-body)", fontWeight: 750, color: TEXT, lineHeight: 1.65 }}>
                    <div><b>Company:</b> {form.companyName || "—"}</div>
                    <div><b>Employees:</b> {form.employeeCount || "—"}</div>
                    <div><b>Contact:</b> {form.contactName || "—"}</div>
                    <div><b>Email:</b> {form.workEmail || "—"}</div>
                    <div style={{ height: 10 }} />
                    <div><b>Restaurant type:</b> {form.restaurantType || "—"}</div>
                    <div><b>Job title:</b> {form.jobTitle || "—"}</div>
                    <div><b>Role categories:</b> {form.roleCategories.length ? form.roleCategories.join(", ") : "—"}</div>
                    <div><b>Location:</b> {form.city && form.state ? `${form.city}, ${form.state}` : "—"}</div>
                    <div style={{ height: 10 }} />
                    <div><b>Employment type:</b> {form.employmentTypes.length ? form.employmentTypes.join(", ") : "—"}</div>
                    <div><b>Schedule:</b> {form.schedules.length ? form.schedules.join(", ") : "—"}</div>
                    <div><b>Pay:</b> {buildPayRange(form) || "—"}</div>
                    <div><b>Website:</b> {form.website || "—"}</div>
                    <div><b>Address:</b> {form.address || "—"}</div>
                    <div><b>How to apply:</b> {form.howToApply || "—"}</div>
                    <div><b>Benefits:</b> {form.benefits.length ? form.benefits.join(", ") : "—"}</div>
                    <div style={{ height: 10 }} />
                    <div><b>Description:</b></div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{form.description || "—"}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${BORDER}`,
                      backgroundColor: "rgba(255,255,255,.75)",
                      padding: 16,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 900, color: TEXT }}>
                      Preview
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <PreviewCard />
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 18,
                      border: `1px solid ${BORDER}`,
                      backgroundColor: "rgba(255,255,255,.75)",
                      padding: 16,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 950, color: TEXT }}>
                      When you confirm
                    </div>
                    <div style={{ marginTop: 8, fontFamily: "var(--font-body)", fontWeight: 700, color: MUTED, lineHeight: 1.6 }}>
                      We’ll submit this job post for review. Once approved, it becomes publicly visible on the site.
                    </div>
                  </div>

                  {submitError ? (
                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(180,30,30,.25)",
                        backgroundColor: "rgba(180,30,30,.06)",
                        padding: 12,
                        color: "rgba(180,30,30,.95)",
                        fontFamily: "var(--font-body)",
                        fontWeight: 900,
                      }}
                    >
                      {submitError}
                    </div>
                  ) : null}

                  {submitSuccess ? (
                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(53,128,110,.25)",
                        backgroundColor: "rgba(53,128,110,.08)",
                        padding: 12,
                        color: "rgba(0,0,0,.78)",
                        fontFamily: "var(--font-body)",
                        fontWeight: 900,
                      }}
                    >
                      {submitSuccess}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {/* ACTIONS */}
          <div
            style={{
              marginTop: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={prevStep}
              style={secondaryBtn}
              disabled={step === 1 || submitting}
            >
              Back
            </button>

            {step === 4 ? (
              <button
                type="button"
                onClick={submitToSupabase}
                style={{
                  ...primaryBtn,
                  opacity: submitting ? 0.75 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
            ) : (
              <button
                type="button"
                onClick={nextStep}
                style={{
                  ...primaryBtn,
                  opacity: stepIsValid ? 1 : 0.6,
                  cursor: stepIsValid ? "pointer" : "not-allowed",
                }}
              >
                Save & Continue
              </button>
            )}
          </div>

          <div style={{ marginTop: 12, ...helpStyle }}>
            Draft saves automatically on this device. Posting is reviewed before going public.
          </div>
        </div>
      </div>
    </main>
  );
}

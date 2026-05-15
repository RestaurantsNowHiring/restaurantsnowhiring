"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../../styles/homepageDesignSystem";

type EmployerProfile = {
  user_id: string;
  login_email: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  support_email: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  jobs_open: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProfileFormState = {
  company_name: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  support_email: string;
};

const emptyForm: ProfileFormState = {
  company_name: "",
  contact_name: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  support_email: "",
};

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
];

function profileToForm(profile: EmployerProfile | null): ProfileFormState {
  if (!profile) return emptyForm;

  return {
    company_name: profile.company_name ?? "",
    contact_name: profile.contact_name ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    postal_code: profile.postal_code ?? "",
    support_email: profile.support_email ?? "",
  };
}

function displayValue(value?: string | null) {
  return value?.trim() || "—";
}

export default function EmployerProfilePage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  const loadProfile = useCallback(async () => {
    setMessage(null);
    const accessToken = await getAccessToken();

    if (!accessToken) {
      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/profile")}`);
      return;
    }

    const response = await fetch("/api/employer/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => null)) as { profile?: EmployerProfile; error?: string } | null;

    if (!response.ok || !payload?.profile) {
      setMessage({ type: "error", text: payload?.error || "Could not load your employer profile." });
      setAuthStatus("allowed");
      return;
    }

    setProfile(payload.profile);
    setForm(profileToForm(payload.profile));
    setAuthStatus("allowed");
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function checkAuthAndLoad() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/profile")}`);
        return;
      }

      await loadProfile();
    }

    void checkAuthAndLoad();

    return () => {
      mounted = false;
    };
  }, [loadProfile, router]);

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage({ type: "error", text: "Please sign in again before saving profile changes." });
      setIsSaving(false);
      return;
    }

    const response = await fetch("/api/employer/profile", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });
    const payload = (await response.json().catch(() => null)) as { profile?: EmployerProfile; error?: string } | null;

    if (!response.ok || !payload?.profile) {
      setMessage({ type: "error", text: payload?.error || "Could not save your employer profile." });
      setIsSaving(false);
      return;
    }

    setProfile(payload.profile);
    setForm(profileToForm(payload.profile));
    setMessage({ type: "success", text: "Profile updated successfully." });
    setIsSaving(false);
  }

  async function handleSendPasswordReset() {
    setIsSendingReset(true);
    setMessage(null);

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage({ type: "error", text: "Please sign in again before requesting a password reset." });
      setIsSendingReset(false);
      return;
    }

    const response = await fetch("/api/employer/password-reset", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;

    if (!response.ok) {
      setMessage({ type: "error", text: payload?.error || "Could not send a password reset email." });
      setIsSendingReset(false);
      return;
    }

    setMessage({ type: "success", text: payload?.message || "Password reset email sent." });
    setIsSendingReset(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 50,
    borderRadius: 14,
    border: `1px solid ${homeTheme.border}`,
    padding: "0 14px",
    outline: "none",
    backgroundColor: "#fff",
    color: homeTheme.text,
    colorScheme: "light",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    fontWeight: 700,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    color: homeTheme.muted,
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  };

  if (authStatus === "loading") {
    return (
      <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg, color: homeTheme.text }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px", fontFamily: "var(--font-body)", fontWeight: 800 }}>
          Loading employer profile…
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", paddingTop: 82, paddingBottom: 64, backgroundColor: homeTheme.bg }}>
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-profile-header">
            <div>
              <p className="rn-profile-eyebrow">Employer Account</p>
              <h1 className="rn-profile-title">My Profile</h1>
              <p className="rn-profile-copy">
                View your account details, update safe restaurant contact fields, and request password help.
              </p>
            </div>
            <div className="rn-profile-actions">
              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
                Back to Dashboard
              </Link>
              <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
                Post New Job
              </Link>
            </div>
          </div>
        </section>

        <section className="rn-profile-summary" aria-label="Signed-in account summary">
          <div>
            <p>Signed in as</p>
            <strong>{displayValue(profile?.login_email)}</strong>
          </div>
          <div>
            <p>Company / Restaurant</p>
            <strong>{displayValue(profile?.company_name)}</strong>
          </div>
        </section>

        {message ? (
          <div
            role={message.type === "error" ? "alert" : "status"}
            className={message.type === "error" ? "rn-profile-alert rn-profile-alert-error" : "rn-profile-alert rn-profile-alert-success"}
          >
            {message.text}
          </div>
        ) : null}

        <div className="rn-profile-stack">
          <section style={homeCardStyle}>
              <h2 className="rn-profile-section-title">Edit Profile</h2>
              <p className="rn-profile-section-copy">
                These safe fields are used for employer contact and location details only. Billing, admin, and Stripe fields cannot be edited here.
              </p>
              <form onSubmit={handleSave} className="rn-profile-form">
                <div>
                  <label htmlFor="company-name" style={labelStyle}>Company / Restaurant name</label>
                  <input id="company-name" value={form.company_name} onChange={(event) => updateField("company_name", event.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="contact-name" style={labelStyle}>Contact name</label>
                  <input id="contact-name" value={form.contact_name} onChange={(event) => updateField("contact_name", event.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="phone" style={labelStyle}>Phone number</label>
                  <input id="phone" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="support-email" style={labelStyle}>Support / contact email</label>
                  <input id="support-email" type="email" value={form.support_email} onChange={(event) => updateField("support_email", event.target.value)} style={inputStyle} placeholder={profile?.login_email ?? "jobs@restaurant.com"} />
                </div>
                <div className="rn-profile-form-full">
                  <label htmlFor="address" style={labelStyle}>Business / location address</label>
                  <input id="address" value={form.address} onChange={(event) => updateField("address", event.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="city" style={labelStyle}>City</label>
                  <input id="city" value={form.city} onChange={(event) => updateField("city", event.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="state" style={labelStyle}>State</label>
                  <select id="state" value={form.state} onChange={(event) => updateField("state", event.target.value)} style={inputStyle}>
                    <option value="">Select state</option>
                    {STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="postal-code" style={labelStyle}>ZIP / Postal code</label>
                  <input id="postal-code" value={form.postal_code} onChange={(event) => updateField("postal_code", event.target.value)} style={inputStyle} />
                </div>
                <div className="rn-profile-form-actions">
                  <button type="submit" style={homePrimaryButton} className="rn-btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </form>
            </section>

            <section style={homeCardStyle}>
              <h2 className="rn-profile-section-title">Password Management</h2>
              <p className="rn-profile-section-copy">
                For security, your current password is never shown. We will email a Supabase password reset link to your signed-in email address.
              </p>
              <button type="button" style={homeSecondaryButton} className="rn-btn-secondary" onClick={handleSendPasswordReset} disabled={isSendingReset}>
                {isSendingReset ? "Sending…" : "Send Password Reset Email"}
              </button>
            </section>
        </div>
      </div>

      <style jsx>{`
        .rn-profile-header {
          align-items: flex-start;
          display: flex;
          gap: 16px;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .rn-profile-eyebrow {
          color: ${homeTheme.green};
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.4px;
          margin: 0;
          text-transform: uppercase;
        }

        .rn-profile-title {
          color: ${homeTheme.green};
          font-family: var(--font-heading);
          font-size: 40px;
          line-height: 1.1;
          margin: 8px 0;
        }

        .rn-profile-copy,
        .rn-profile-section-copy {
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-weight: 700;
          line-height: 1.55;
          margin: 0;
        }

        .rn-profile-actions,
        .rn-profile-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .rn-profile-alert {
          border-radius: 14px;
          font-family: var(--font-body);
          font-weight: 900;
          margin-bottom: 16px;
          padding: 12px 14px;
        }

        .rn-profile-alert-error {
          background-color: rgba(173,67,67,0.08);
          border: 1px solid rgba(173,67,67,0.28);
          color: #8a2f2f;
        }

        .rn-profile-alert-success {
          background-color: rgba(53,128,110,0.10);
          border: 1px solid rgba(53,128,110,0.24);
          color: ${homeTheme.green};
        }

        .rn-profile-summary {
          align-items: stretch;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid ${homeTheme.border};
          border-radius: 18px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-bottom: 16px;
          padding: 14px;
        }

        .rn-profile-summary div {
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 14px;
          padding: 13px 14px;
        }

        .rn-profile-summary p {
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.35px;
          margin: 0 0 5px 0;
          text-transform: uppercase;
        }

        .rn-profile-summary strong {
          color: ${homeTheme.text};
          display: block;
          font-family: var(--font-body);
          font-size: 16px;
          font-weight: 900;
          overflow-wrap: anywhere;
        }

        .rn-profile-stack {
          display: grid;
          gap: 16px;
          margin: 0 auto;
          max-width: 900px;
        }

        .rn-profile-section-title {
          color: ${homeTheme.text};
          font-family: var(--font-heading);
          font-size: 26px;
          line-height: 1.2;
          margin: 0 0 8px 0;
        }

        .rn-profile-form {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 16px;
        }

        .rn-profile-form-full,
        .rn-profile-form-actions {
          grid-column: 1 / -1;
        }

        @media (max-width: 680px) {
          .rn-profile-summary,
          .rn-profile-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

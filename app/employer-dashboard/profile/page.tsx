  "use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
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
  company_short_description: string | null;
  company_description: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  company_cover_image_url: string | null;
  headquarters: string | null;
  location_count: number | null;
  benefits_summary: string | null;
  benefits_list: string | null;
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
  company_short_description: string;
  company_description: string;
  company_website: string;
  company_logo_url: string;
  company_cover_image_url: string;
  headquarters: string;
  location_count: string;
  benefits_summary: string;
  benefits_list: string;
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
  company_short_description: "",
  company_description: "",
  company_website: "",
  company_logo_url: "",
  company_cover_image_url: "",
  headquarters: "",
  location_count: "",
  benefits_summary: "",
  benefits_list: "",
};

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
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
    company_short_description: profile.company_short_description ?? "",
    company_description: profile.company_description ?? "",
    company_website: profile.company_website ?? "",
    company_logo_url: profile.company_logo_url ?? "",
    company_cover_image_url: profile.company_cover_image_url ?? "",
    headquarters: profile.headquarters ?? "",
    location_count: profile.location_count?.toString() ?? "",
    benefits_summary: profile.benefits_summary ?? "",
    benefits_list: profile.benefits_list ?? "",
  };
}

function displayValue(value?: string | null) {
  return value?.trim() || "—";
}

function employerAccountHeaders(token: string, contentType?: string) {
  const selectedEmployerAccountId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("rn-selected-employer-account-id");

  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(selectedEmployerAccountId
      ? { "X-Employer-Account-Id": selectedEmployerAccountId }
      : {}),
  };
}

export default function EmployerProfilePage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
      headers: employerAccountHeaders(accessToken),
    });

    const payload = (await response.json().catch(() => null)) as {
      profile?: EmployerProfile;
      error?: string;
    } | null;

    if (!response.ok || !payload?.profile) {
      setMessage({
        type: "error",
        text: payload?.error || "Could not load your employer profile.",
      });
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
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleCancelEdit() {
    setForm(profileToForm(profile));
    setIsEditing(false);
    setMessage(null);
  }

  async function uploadLogo(file: File) {
    try {
      setUploadingLogo(true);
      setMessage(null);

      const fileExt = file.name.split(".").pop();
      const fileName = `logos/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("company-assets")
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("company-assets")
        .getPublicUrl(fileName);

      updateField("company_logo_url", data.publicUrl);

      setMessage({
        type: "success",
        text: "Logo uploaded. Click Save Changes to keep this change.",
      });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Could not upload logo." });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadCoverImage(file: File) {
    try {
      setUploadingCover(true);
      setMessage(null);

      const fileExt = file.name.split(".").pop();
      const fileName = `covers/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("company-assets")
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data } = supabase.storage
        .from("company-assets")
        .getPublicUrl(fileName);

      updateField("company_cover_image_url", data.publicUrl);

      setMessage({
        type: "success",
        text: "Cover image uploaded. Click Save Changes to keep this change.",
      });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Could not upload cover image." });
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setMessage({
        type: "error",
        text: "Please sign in again before saving profile changes.",
      });
      setIsSaving(false);
      return;
    }

    const response = await fetch("/api/employer/profile", {
      method: "PUT",
      headers: employerAccountHeaders(accessToken, "application/json"),
      body: JSON.stringify(form),
    });

    const payload = (await response.json().catch(() => null)) as {
      profile?: EmployerProfile;
      error?: string;
    } | null;

    if (!response.ok || !payload?.profile) {
      setMessage({
        type: "error",
        text: payload?.error || "Could not save your employer profile.",
      });
      setIsSaving(false);
      return;
    }

    setProfile(payload.profile);
    setForm(profileToForm(payload.profile));
    setIsEditing(false);
    setMessage({ type: "success", text: "Profile updated successfully." });
    setIsSaving(false);
  }

  async function handleSendPasswordReset() {
    setIsSendingReset(true);
    setMessage(null);

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setMessage({
        type: "error",
        text: "Please sign in again before requesting a password reset.",
      });
      setIsSendingReset(false);
      return;
    }

    const response = await fetch("/api/employer/password-reset", {
      method: "POST",
      headers: employerAccountHeaders(accessToken),
    });

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage({
        type: "error",
        text: payload?.error || "Could not send a password reset email.",
      });
      setIsSendingReset(false);
      return;
    }

    setMessage({
      type: "success",
      text: payload?.message || "Password reset email sent.",
    });
    setIsSendingReset(false);
  }

  const inputStyle: CSSProperties = {
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

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: 120,
    height: "auto",
    padding: "14px",
    resize: "vertical",
    lineHeight: 1.5,
  };

  const labelStyle: CSSProperties = {
    display: "block",
    color: homeTheme.muted,
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.35,
    marginBottom: 7,
    textTransform: "uppercase",
  };

  const readOnlyFieldStyle: CSSProperties = {
    border: `1px solid ${homeTheme.border}`,
    borderRadius: 16,
    background: "#fff",
    padding: "14px 16px",
    color: homeTheme.text,
    fontFamily: "var(--font-body)",
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
  };

  if (authStatus === "loading") {
    return (
      <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh", paddingTop: 110, paddingBottom: 80 }}>
        <section style={{ ...homeCardStyle, maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <p style={{ color: homeTheme.green, fontFamily: "var(--font-body)", fontWeight: 900, margin: 0 }}>
            Loading your profile…
          </p>
        </section>
      </main>
    );
  }

  return (
    <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh", paddingTop: 110, paddingBottom: 80 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 20px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-profile-header">
            <div>
              <p className="rn-profile-eyebrow">Employer Account</p>
              <h1 className="rn-profile-title">Employer Profile</h1>
              <p className="rn-profile-copy">
                Manage your restaurant information, company page, and hiring settings.
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
            <p>Signed-in email</p>
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
            className={
              message.type === "error"
                ? "rn-profile-alert rn-profile-alert-error"
                : "rn-profile-alert rn-profile-alert-success"
            }
          >
            {message.text}
          </div>
        ) : null}

        <div className="rn-profile-stack">
          <form onSubmit={handleSave} className="rn-profile-edit-form">
            {!isEditing ? (
              <section style={homeCardStyle}>
                <div className="rn-profile-edit-header">
                  <div>
                    <h2 className="rn-profile-section-title">My Profile</h2>
                    <p className="rn-profile-section-copy">
                      Review the employer contact details and public company page information shown to job seekers.
                    </p>
                  </div>

                  <button
                    type="button"
                    style={homePrimaryButton}
                    className="rn-btn-primary"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Profile
                  </button>
                </div>

                <div className="rn-profile-form">
                  <div>
                    <label style={labelStyle}>Company / Restaurant name</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.company_name)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Contact name</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.contact_name)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Support / contact email</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.support_email)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Phone number</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.phone)}</div>
                  </div>
                </div>
              </section>
            ) : null}

            {isEditing ? (
              <>
                <section style={homeCardStyle}>
                  <div className="rn-profile-edit-header">
                    <div>
                      <h2 className="rn-profile-section-title">Employer Details</h2>
                      <p className="rn-profile-section-copy">
                        Basic account and contact information for your employer profile.
                      </p>
                    </div>
                  </div>

                  <div className="rn-profile-form">
                    <div>
                      <label htmlFor="company-name" style={labelStyle}>
                        Company / Restaurant name
                      </label>
                      <input
                        id="company-name"
                        value={form.company_name}
                        onChange={(event) => updateField("company_name", event.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label htmlFor="contact-name" style={labelStyle}>
                        Contact name
                      </label>
                      <input
                        id="contact-name"
                        value={form.contact_name}
                        onChange={(event) => updateField("contact_name", event.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" style={labelStyle}>
                        Phone number
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(event) => updateField("phone", event.target.value)}
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label htmlFor="support-email" style={labelStyle}>
                        Support / contact email
                      </label>
                      <input
                        id="support-email"
                        type="email"
                        value={form.support_email}
                        onChange={(event) => updateField("support_email", event.target.value)}
                        placeholder={profile?.login_email ?? "jobs@restaurant.com"}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </section>

                <section style={homeCardStyle}>
                  <h2 className="rn-profile-section-title">Public Company Page</h2>
                  <p className="rn-profile-section-copy">
                    These fields will appear on your public company profile page above your available jobs.
                  </p>

                  <div className="rn-profile-form">
                    <div className="rn-profile-form-full">
                      <label htmlFor="company-short-description" style={labelStyle}>
                        Short Company Summary
                      </label>
                      <textarea
                        id="company-short-description"
                        value={form.company_short_description}
                        onChange={(event) => updateField("company_short_description", event.target.value)}
                        placeholder="Short summary shown at the top of your company page. Aim for 1–3 sentences."
                        style={textareaStyle}
                      />
                    </div>

                    <div className="rn-profile-form-full">
                      <label htmlFor="company-description" style={labelStyle}>
                        Full About Company
                      </label>
                      <textarea
                        id="company-description"
                        value={form.company_description}
                        onChange={(event) => updateField("company_description", event.target.value)}
                        placeholder="Tell candidates about your company, culture, story, and hiring needs."
                        style={textareaStyle}
                      />
                    </div>
                  </div>
                </section>

                <section style={homeCardStyle}>
                  <h2 className="rn-profile-section-title">Branding</h2>
                  <p className="rn-profile-section-copy">
                    Manage the branding candidates see across your company page and job listings.
                  </p>

                  <div className="rn-profile-form">
                    <div>
                      <label htmlFor="company-website" style={labelStyle}>
                        Company website
                      </label>
                      <input
                        id="company-website"
                        type="url"
                        value={form.company_website}
                        onChange={(event) => updateField("company_website", event.target.value)}
                        placeholder="https://www.example.com"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor="location-count" style={labelStyle}>
                        Number of locations
                      </label>
                      <input
                        id="location-count"
                        type="number"
                        min="0"
                        value={form.location_count}
                        onChange={(event) => updateField("location_count", event.target.value)}
                        placeholder="160"
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <label style={labelStyle}>Company Logo</label>

                      <div
                        style={{
                          border: `1px solid ${homeTheme.border}`,
                          borderRadius: 18,
                          padding: 20,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 16,
                        }}
                      >
                        <label
                          style={{
                            ...homeSecondaryButton,
                            minWidth: 160,
                            cursor: uploadingLogo ? "not-allowed" : "pointer",
                            opacity: uploadingLogo ? 0.7 : 1,
                            textAlign: "center",
                          }}
                        >
                          {uploadingLogo ? "Uploading…" : "Upload Logo"}

                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={uploadingLogo}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadLogo(file);
                            }}
                            style={{ display: "none" }}
                          />
                        </label>

                       {form.company_logo_url ? (
  <div
    style={{
      marginTop: 14,
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: "#fff",
      padding: 28,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
    }}
  >
    <img
      src={form.company_logo_url}
      alt="Company Logo"
      style={{
        width: 120,
        height: 120,
        objectFit: "contain",
      }}
    />

    <div
      style={{
        fontWeight: 800,
        color: homeTheme.green,
        fontFamily: "var(--font-body)",
      }}
    >
      ✓ Logo Uploaded
    </div>
  </div>
) : (
                          <div>
                            <div
                              style={{
                                fontWeight: 800,
                                color: homeTheme.text,
                                marginBottom: 4,
                                fontFamily: "var(--font-body)",
                              }}
                            >
                              No logo uploaded
                            </div>

                            <div
                              style={{
                                color: homeTheme.muted,
                                fontSize: 14,
                                fontFamily: "var(--font-body)",
                              }}
                            >
                              Upload a square logo for best results
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label htmlFor="company-cover-image-url" style={labelStyle}>
                        Company cover image
                      </label>

                      <label
                        style={{
                          ...homeSecondaryButton,
                          display: "inline-block",
                          cursor: uploadingCover ? "not-allowed" : "pointer",
                          opacity: uploadingCover ? 0.7 : 1,
                          textAlign: "center",
                        }}
                      >
                        {uploadingCover ? "Uploading…" : "Upload Cover Image"}

                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingCover}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadCoverImage(file);
                          }}
                          style={{ display: "none" }}
                        />
                      </label>

                      {form.company_cover_image_url ? (
                        <div
                          style={{
                            marginTop: 14,
                            borderRadius: 18,
                            overflow: "hidden",
                            border: `1px solid ${homeTheme.border}`,
                            backgroundColor: "#fff",
                          }}
                        >
                          <img
                            src={form.company_cover_image_url}
                            alt="Company cover preview"
                            style={{
                              width: "100%",
                              height: 180,
                              objectFit: "cover",
                              objectPosition: "center center",
                              display: "block",
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
                <section style={homeCardStyle}>
                  <h2 className="rn-profile-section-title">Benefits</h2>
                  <p className="rn-profile-section-copy">
                    Share perks, benefits, and reasons candidates should want to work with you.
                  </p>

                  <div className="rn-profile-form">
                    <div className="rn-profile-form-full">
                      <label htmlFor="benefits-summary" style={labelStyle}>
                        Benefits / Perks Summary
                      </label>
                      <textarea
                        id="benefits-summary"
                        value={form.benefits_summary}
                        onChange={(event) => updateField("benefits_summary", event.target.value)}
                        placeholder="Short intro to your benefits and teammate experience."
                        style={textareaStyle}
                      />
                    </div>

                    <div className="rn-profile-form-full">
                      <label htmlFor="benefits-list" style={labelStyle}>
                        Benefits & Perks List
                      </label>
                      <textarea
                        id="benefits-list"
                        value={form.benefits_list}
                        onChange={(event) => updateField("benefits_list", event.target.value)}
                        placeholder={`Competitive pay
Flexible scheduling
Growth opportunities
Leadership development`}
                        style={textareaStyle}
                      />
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            <section style={homeCardStyle}>
              <h2 className="rn-profile-section-title">
              Headquarters
              </h2>

              <p className="rn-profile-section-copy">
                The primary business address shown on your company profile.
              </p>

              {!isEditing ? (
                <div className="rn-profile-form">
                  <div className="rn-profile-form-full">
                    <label style={labelStyle}>Business / location address</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.address)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>City</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.city)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>State</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.state)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>ZIP / Postal code</label>
                    <div style={readOnlyFieldStyle}>{displayValue(form.postal_code)}</div>
                  </div>
                </div>
              ) : (
                <div className="rn-profile-form">
                  <div className="rn-profile-form-full">
                    <label htmlFor="address" style={labelStyle}>
                      Business / location address
                    </label>

                    <input
                      id="address"
                      value={form.address}
                      onChange={(event) => updateField("address", event.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="city" style={labelStyle}>
                      City
                    </label>

                    <input
                      id="city"
                      value={form.city}
                      onChange={(event) => updateField("city", event.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="state" style={labelStyle}>
                      State
                    </label>

                    <select
                      id="state"
                      value={form.state}
                      onChange={(event) => updateField("state", event.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select state</option>

                      {STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="postal-code" style={labelStyle}>
                      ZIP / Postal code
                    </label>

                    <input
                      id="postal-code"
                      value={form.postal_code}
                      onChange={(event) => updateField("postal_code", event.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </section>

            {isEditing ? (
              <section
                style={{
                  ...homeCardStyle,
                  padding: "20px 28px",
                }}
              >
                <div
                  className="rn-profile-save-row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color: homeTheme.text,
                        fontFamily: "var(--font-heading)",
                      }}
                    >
                      Unsaved Changes
                    </div>

                    <div
                      style={{
                        color: homeTheme.muted,
                        fontSize: 14,
                        marginTop: 4,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      Review your edits, then save your company profile.
                    </div>
                  </div>

                  <div className="rn-profile-actions">
                    <button
                      type="button"
                      style={homeSecondaryButton}
                      className="rn-btn-secondary"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      style={homePrimaryButton}
                      className="rn-btn-primary"
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </form>

          <section style={homeCardStyle}>
            <h2 className="rn-profile-section-title">Password Reset</h2>
            <p className="rn-profile-section-copy">
              For security, your current password is never shown. Send a reset link to your signed-in email whenever you need to change it.
            </p>
            <button
              type="button"
              style={homeSecondaryButton}
              className="rn-btn-secondary"
              onClick={handleSendPasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? "Sending…" : "Send Password Reset Email"}
            </button>
          </section>
        </div>
      </div>

      <style jsx>{`
        .rn-profile-header,
        .rn-profile-edit-header {
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
        .rn-profile-form-actions,
        .rn-profile-save-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .rn-profile-alert {
          border-radius: 14px;
          font-family: var(--font-body);
          font-weight: 900;
          margin: 0 auto 16px;
          max-width: 900px;
          padding: 12px 14px;
        }

        .rn-profile-alert-error {
          background-color: rgba(173, 67, 67, 0.08);
          border: 1px solid rgba(173, 67, 67, 0.28);
          color: #8a2f2f;
        }

        .rn-profile-alert-success {
          background-color: rgba(53, 128, 110, 0.1);
          border: 1px solid rgba(53, 128, 110, 0.24);
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
          margin: 0 auto 16px;
          max-width: 900px;
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

        .rn-profile-stack,
        .rn-profile-edit-form {
          display: grid;
          gap: 16px;
          margin: 0 auto;
          max-width: 900px;
        }

        .rn-profile-section-title {
        color: ${homeTheme.text};
        font-family: var(--font-heading);
        font-size: 22px;
        line-height: 1.2;
        margin: 0 0 8px 0;
        }

        .rn-profile-form {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 16px;
        }

        .rn-profile-form-full {
          grid-column: 1 / -1;
        }

        .rn-profile-divider {
          border-top: 1px solid ${homeTheme.border};
          margin-top: 10px;
          padding-top: 20px;
        }

        @media (max-width: 680px) {
          .rn-profile-summary,
          .rn-profile-form {
            grid-template-columns: 1fr;
          }

          .rn-profile-save-row {
            justify-content: stretch !important;
          }

          .rn-profile-save-row > div,
          .rn-profile-actions,
          .rn-profile-save-row button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

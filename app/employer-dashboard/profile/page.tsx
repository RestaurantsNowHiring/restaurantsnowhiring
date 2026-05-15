 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app/api/employer/password-reset/route.ts b/app/api/employer/password-reset/route.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bad693405a6dc34305208ad8b33db0b7b93ddca1
--- /dev/null
+++ b/app/api/employer/password-reset/route.ts
@@ -0,0 +1,27 @@
+import { NextResponse } from "next/server";
+import { getAuthUserFromRequest, getSiteUrl } from "../../../../lib/billing";
+import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
+
+export async function POST(request: Request) {
+  try {
+    const user = await getAuthUserFromRequest(request);
+    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
+
+    const supabaseAdmin = getSupabaseAdminClient();
+    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
+
+    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email, {
+      redirectTo: `${getSiteUrl()}/reset-password`,
+    });
+
+    if (error) throw new Error(error.message || "Could not send password reset email.");
+
+    return NextResponse.json({ message: `Password reset email sent to ${user.email}.` });
+  } catch (error) {
+    console.error("Employer password reset failed", { error });
+    return NextResponse.json(
+      { error: error instanceof Error ? error.message : "Employer password reset failed." },
+      { status: 500 },
+    );
+  }
+}
diff --git a/app/api/employer/profile/route.ts b/app/api/employer/profile/route.ts
new file mode 100644
index 0000000000000000000000000000000000000000..05b0ce93f6a9c2167fb75a0806d09d7b79d7bda9
--- /dev/null
+++ b/app/api/employer/profile/route.ts
@@ -0,0 +1,209 @@
+import { NextResponse } from "next/server";
+import { getAuthUserFromRequest } from "../../../../lib/billing";
+import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
+
+type EmployerProfileRow = {
+  user_id: string;
+  login_email: string | null;
+  company_name: string | null;
+  contact_name: string | null;
+  phone: string | null;
+  address: string | null;
+  city: string | null;
+  state: string | null;
+  postal_code: string | null;
+  support_email: string | null;
+  first_name: string | null;
+  last_name: string | null;
+  job_title: string | null;
+  jobs_open: string | null;
+  created_at?: string | null;
+  updated_at?: string | null;
+};
+
+type LatestEmployerJob = {
+  restaurant_name: string | null;
+  apply_email: string | null;
+  address: string | null;
+  city: string | null;
+  state: string | null;
+  employer_user_id: string | null;
+  employer_email: string | null;
+};
+
+const SAFE_PROFILE_FIELDS = [
+  "company_name",
+  "contact_name",
+  "phone",
+  "address",
+  "city",
+  "state",
+  "postal_code",
+  "support_email",
+] as const;
+
+type SafeProfileField = (typeof SAFE_PROFILE_FIELDS)[number];
+
+function cleanString(value: unknown, maxLength: number) {
+  if (typeof value !== "string") return null;
+  const trimmed = value.trim();
+  if (!trimmed) return null;
+  return trimmed.slice(0, maxLength);
+}
+
+function fullName(firstName?: string | null, lastName?: string | null) {
+  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(" ") || null;
+}
+
+function profileFromMetadata(userId: string, email: string, metadata: Record<string, unknown>): EmployerProfileRow {
+  const firstName = cleanString(metadata.first_name, 120);
+  const lastName = cleanString(metadata.last_name, 120);
+
+  return {
+    user_id: userId,
+    login_email: email,
+    company_name: cleanString(metadata.company_name, 180),
+    contact_name: fullName(firstName, lastName),
+    phone: cleanString(metadata.phone, 40),
+    address: cleanString(metadata.address, 220),
+    city: cleanString(metadata.city, 120),
+    state: cleanString(metadata.state, 40),
+    postal_code: cleanString(metadata.postal_code, 24),
+    support_email: cleanString(metadata.support_email, 180),
+    first_name: firstName,
+    last_name: lastName,
+    job_title: cleanString(metadata.job_title, 160),
+    jobs_open: cleanString(metadata.jobs_open, 40),
+  };
+}
+
+function mergeFallbacks(base: EmployerProfileRow, latestJob: LatestEmployerJob | null) {
+  return {
+    ...base,
+    company_name: base.company_name ?? latestJob?.restaurant_name ?? null,
+    support_email: base.support_email ?? latestJob?.apply_email ?? null,
+    address: base.address ?? latestJob?.address ?? null,
+    city: base.city ?? latestJob?.city ?? null,
+    state: base.state ?? latestJob?.state ?? null,
+  };
+}
+
+async function loadLatestEmployerJob(userId: string, email: string) {
+  const supabaseAdmin = getSupabaseAdminClient();
+  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
+
+  const [userIdResult, emailResult] = await Promise.all([
+    supabaseAdmin
+      .from("jobs")
+      .select("restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at")
+      .eq("employer_user_id", userId)
+      .order("created_at", { ascending: false })
+      .limit(1),
+    supabaseAdmin
+      .from("jobs")
+      .select("restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at")
+      .eq("employer_email", email)
+      .order("created_at", { ascending: false })
+      .limit(1),
+  ]);
+
+  const error = userIdResult.error ?? emailResult.error;
+  if (error) throw new Error(error.message || "Could not load employer job fallback details.");
+
+  const rows = [...(userIdResult.data ?? []), ...(emailResult.data ?? [])];
+  rows.sort((a, b) => new Date(String(b.created_at ?? "")).getTime() - new Date(String(a.created_at ?? "")).getTime());
+
+  return (rows[0] ?? null) as LatestEmployerJob | null;
+}
+
+async function getEmployerProfile(userId: string, email: string, metadata: Record<string, unknown>) {
+  const supabaseAdmin = getSupabaseAdminClient();
+  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
+
+  const [{ data: row, error }, latestJob] = await Promise.all([
+    supabaseAdmin
+      .from("employer_profiles")
+      .select(
+        "user_id,login_email,company_name,contact_name,phone,address,city,state,postal_code,support_email,first_name,last_name,job_title,jobs_open,created_at,updated_at",
+      )
+      .eq("user_id", userId)
+      .maybeSingle(),
+    loadLatestEmployerJob(userId, email),
+  ]);
+
+  if (error) throw new Error(error.message || "Could not load employer profile.");
+
+  const metadataProfile = profileFromMetadata(userId, email, metadata);
+  return mergeFallbacks(row ? { ...metadataProfile, ...row, login_email: email } : metadataProfile, latestJob);
+}
+
+export async function GET(request: Request) {
+  try {
+    const user = await getAuthUserFromRequest(request);
+    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
+
+    const supabaseAdmin = getSupabaseAdminClient();
+    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
+
+    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
+    if (authUserError) throw new Error(authUserError.message || "Could not load auth user metadata.");
+
+    const profile = await getEmployerProfile(user.id, user.email, authUserData.user?.user_metadata ?? {});
+    return NextResponse.json({ profile });
+  } catch (error) {
+    console.error("Employer profile load failed", { error });
+    return NextResponse.json(
+      { error: error instanceof Error ? error.message : "Employer profile load failed." },
+      { status: 500 },
+    );
+  }
+}
+
+export async function PUT(request: Request) {
+  try {
+    const user = await getAuthUserFromRequest(request);
+    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
+
+    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
+    if (!payload) return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
+
+    const supabaseAdmin = getSupabaseAdminClient();
+    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
+
+    const safeUpdate = SAFE_PROFILE_FIELDS.reduce<Record<SafeProfileField, string | null>>((acc, field) => {
+      const maxLength = field === "address" ? 220 : field === "support_email" || field === "company_name" ? 180 : 120;
+      acc[field] = cleanString(payload[field], maxLength);
+      return acc;
+    }, {} as Record<SafeProfileField, string | null>);
+
+    if (safeUpdate.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeUpdate.support_email)) {
+      return NextResponse.json({ error: "Enter a valid support/contact email address." }, { status: 400 });
+    }
+
+    const { data, error } = await supabaseAdmin
+      .from("employer_profiles")
+      .upsert(
+        {
+          user_id: user.id,
+          login_email: user.email,
+          ...safeUpdate,
+          updated_at: new Date().toISOString(),
+        },
+        { onConflict: "user_id" },
+      )
+      .select(
+        "user_id,login_email,company_name,contact_name,phone,address,city,state,postal_code,support_email,first_name,last_name,job_title,jobs_open,created_at,updated_at",
+      )
+      .single();
+
+    if (error) throw new Error(error.message || "Could not save employer profile.");
+
+    return NextResponse.json({ profile: { ...data, login_email: user.email } });
+  } catch (error) {
+    console.error("Employer profile save failed", { error });
+    return NextResponse.json(
+      { error: error instanceof Error ? error.message : "Employer profile save failed." },
+      { status: 500 },
+    );
+  }
+}
diff --git a/app/employer-dashboard/page.tsx b/app/employer-dashboard/page.tsx
index 785b04701f4399015e38038a8fc54aaf0f174e3d..2c403b298560f84e27f95addf5544d8782e3b5d8 100644
--- a/app/employer-dashboard/page.tsx
+++ b/app/employer-dashboard/page.tsx
@@ -795,60 +795,65 @@ export default function EmployerDashboardPage() {
           <p
             style={{
               margin: 0,
               color: homeTheme.green,
               fontSize: 12,
               fontWeight: 900,
               letterSpacing: 0.4,
               textTransform: "uppercase",
               fontFamily: "var(--font-body)",
             }}
           >
             Employer Workspace
           </p>
           <h1
             style={{
               marginTop: 8,
               marginBottom: 8,
               fontSize: 40,
               lineHeight: 1.1,
               fontFamily: "var(--font-heading)",
               color: homeTheme.green,
             }}
           >
             Employer Dashboard
           </h1>
-          <p
-            style={{
-              marginBottom: 0,
-              color: homeTheme.muted,
-              fontWeight: 600,
-              fontFamily: "var(--font-body)",
-            }}
-          >
-            Manage your job listings, monitor status, and keep your restaurant hiring pipeline moving.
-          </p>
+          <div className="rn-dashboard-hero-row">
+            <p
+              style={{
+                marginBottom: 0,
+                color: homeTheme.muted,
+                fontWeight: 600,
+                fontFamily: "var(--font-body)",
+              }}
+            >
+              Manage your job listings, monitor status, and keep your restaurant hiring pipeline moving.
+            </p>
+            <Link href="/employer-dashboard/profile" style={homeSecondaryButton} className="rn-btn-secondary">
+              My Profile
+            </Link>
+          </div>
         </section>
 
         <section className="rn-dashboard-metrics" style={{ marginBottom: 16 }}>
           {metrics.map((metric) => (
             <article
               key={metric.label}
               style={{
                 ...homeCardStyle,
                 padding: 18,
                 boxShadow: "0 12px 26px rgba(0,0,0,.08)",
               }}
             >
               <p
                 style={{
                   margin: 0,
                   fontSize: 12,
                   textTransform: "uppercase",
                   letterSpacing: 0.4,
                   color: homeTheme.muted,
                   fontWeight: 800,
                   fontFamily: "var(--font-body)",
                 }}
               >
                 {metric.label}
               </p>
@@ -1202,50 +1207,58 @@ export default function EmployerDashboardPage() {
             <p id="delete-job-description">{DELETE_CONFIRMATION_MESSAGE}</p>
             <div className="rn-delete-modal-actions">
               <button
                 type="button"
                 style={homeSecondaryButton}
                 className="rn-btn-secondary"
                 onClick={() => setDeleteJob(null)}
                 disabled={busyJobId === deleteJob.id}
               >
                 Cancel
               </button>
               <button
                 type="button"
                 className="rn-confirm-delete-button"
                 onClick={handleConfirmDelete}
                 disabled={busyJobId === deleteJob.id}
               >
                 {busyJobId === deleteJob.id ? "Deleting..." : "Confirm Delete"}
               </button>
             </div>
           </div>
         </div>
       ) : null}
 
       <style jsx>{`
+        .rn-dashboard-hero-row {
+          align-items: flex-start;
+          display: flex;
+          flex-wrap: wrap;
+          gap: 14px;
+          justify-content: space-between;
+        }
+
         .rn-dashboard-metrics {
           display: grid;
           grid-template-columns: repeat(4, minmax(0, 1fr));
           gap: 12px;
         }
 
         .rn-dashboard-header-row {
           display: flex;
           justify-content: space-between;
           align-items: flex-start;
           gap: 14px;
           flex-wrap: wrap;
           margin-bottom: 16px;
         }
 
         .rn-dashboard-rejected-note {
           margin: 8px 0 0 0;
           color: ${homeTheme.muted};
           font-family: var(--font-body);
           font-size: 13px;
           font-weight: 700;
           line-height: 1.4;
         }
 
         .rn-dashboard-rejected-note a {
diff --git a/app/employer-dashboard/profile/page.tsx b/app/employer-dashboard/profile/page.tsx
new file mode 100644
index 0000000000000000000000000000000000000000..ba3a3aeb1b37f76198977c0e286a01f455940a47
--- /dev/null
+++ b/app/employer-dashboard/profile/page.tsx
@@ -0,0 +1,489 @@
+"use client";
+
+import Link from "next/link";
+import { useCallback, useEffect, useState } from "react";
+import { useRouter } from "next/navigation";
+import { supabase } from "../../../lib/supabase";
+import {
+  homeCardStyle,
+  homePrimaryButton,
+  homeSecondaryButton,
+  homeTheme,
+} from "../../styles/homepageDesignSystem";
+
+type EmployerProfile = {
+  user_id: string;
+  login_email: string | null;
+  company_name: string | null;
+  contact_name: string | null;
+  phone: string | null;
+  address: string | null;
+  city: string | null;
+  state: string | null;
+  postal_code: string | null;
+  support_email: string | null;
+  first_name: string | null;
+  last_name: string | null;
+  job_title: string | null;
+  jobs_open: string | null;
+  created_at?: string | null;
+  updated_at?: string | null;
+};
+
+type ProfileFormState = {
+  company_name: string;
+  contact_name: string;
+  phone: string;
+  address: string;
+  city: string;
+  state: string;
+  postal_code: string;
+  support_email: string;
+};
+
+const emptyForm: ProfileFormState = {
+  company_name: "",
+  contact_name: "",
+  phone: "",
+  address: "",
+  city: "",
+  state: "",
+  postal_code: "",
+  support_email: "",
+};
+
+const STATES = [
+  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
+  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
+  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
+  "WI", "WY", "DC",
+];
+
+function profileToForm(profile: EmployerProfile | null): ProfileFormState {
+  if (!profile) return emptyForm;
+
+  return {
+    company_name: profile.company_name ?? "",
+    contact_name: profile.contact_name ?? "",
+    phone: profile.phone ?? "",
+    address: profile.address ?? "",
+    city: profile.city ?? "",
+    state: profile.state ?? "",
+    postal_code: profile.postal_code ?? "",
+    support_email: profile.support_email ?? "",
+  };
+}
+
+function displayValue(value?: string | null) {
+  return value?.trim() || "—";
+}
+
+export default function EmployerProfilePage() {
+  const router = useRouter();
+  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
+  const [profile, setProfile] = useState<EmployerProfile | null>(null);
+  const [form, setForm] = useState<ProfileFormState>(emptyForm);
+  const [isSaving, setIsSaving] = useState(false);
+  const [isSendingReset, setIsSendingReset] = useState(false);
+  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
+
+  async function getAccessToken() {
+    const { data } = await supabase.auth.getSession();
+    return data.session?.access_token ?? null;
+  }
+
+  const loadProfile = useCallback(async () => {
+    setMessage(null);
+    const accessToken = await getAccessToken();
+
+    if (!accessToken) {
+      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/profile")}`);
+      return;
+    }
+
+    const response = await fetch("/api/employer/profile", {
+      headers: { Authorization: `Bearer ${accessToken}` },
+    });
+    const payload = (await response.json().catch(() => null)) as { profile?: EmployerProfile; error?: string } | null;
+
+    if (!response.ok || !payload?.profile) {
+      setMessage({ type: "error", text: payload?.error || "Could not load your employer profile." });
+      setAuthStatus("allowed");
+      return;
+    }
+
+    setProfile(payload.profile);
+    setForm(profileToForm(payload.profile));
+    setAuthStatus("allowed");
+  }, [router]);
+
+  useEffect(() => {
+    let mounted = true;
+
+    async function checkAuthAndLoad() {
+      const { data, error } = await supabase.auth.getUser();
+      if (!mounted) return;
+
+      if (error || !data.user) {
+        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/profile")}`);
+        return;
+      }
+
+      await loadProfile();
+    }
+
+    void checkAuthAndLoad();
+
+    return () => {
+      mounted = false;
+    };
+  }, [loadProfile, router]);
+
+  function updateField(field: keyof ProfileFormState, value: string) {
+    setForm((current) => ({ ...current, [field]: value }));
+  }
+
+  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
+    event.preventDefault();
+    setIsSaving(true);
+    setMessage(null);
+
+    const accessToken = await getAccessToken();
+    if (!accessToken) {
+      setMessage({ type: "error", text: "Please sign in again before saving profile changes." });
+      setIsSaving(false);
+      return;
+    }
+
+    const response = await fetch("/api/employer/profile", {
+      method: "PUT",
+      headers: {
+        Authorization: `Bearer ${accessToken}`,
+        "Content-Type": "application/json",
+      },
+      body: JSON.stringify(form),
+    });
+    const payload = (await response.json().catch(() => null)) as { profile?: EmployerProfile; error?: string } | null;
+
+    if (!response.ok || !payload?.profile) {
+      setMessage({ type: "error", text: payload?.error || "Could not save your employer profile." });
+      setIsSaving(false);
+      return;
+    }
+
+    setProfile(payload.profile);
+    setForm(profileToForm(payload.profile));
+    setMessage({ type: "success", text: "Profile updated successfully." });
+    setIsSaving(false);
+  }
+
+  async function handleSendPasswordReset() {
+    setIsSendingReset(true);
+    setMessage(null);
+
+    const accessToken = await getAccessToken();
+    if (!accessToken) {
+      setMessage({ type: "error", text: "Please sign in again before requesting a password reset." });
+      setIsSendingReset(false);
+      return;
+    }
+
+    const response = await fetch("/api/employer/password-reset", {
+      method: "POST",
+      headers: { Authorization: `Bearer ${accessToken}` },
+    });
+    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
+
+    if (!response.ok) {
+      setMessage({ type: "error", text: payload?.error || "Could not send a password reset email." });
+      setIsSendingReset(false);
+      return;
+    }
+
+    setMessage({ type: "success", text: payload?.message || "Password reset email sent." });
+    setIsSendingReset(false);
+  }
+
+  const inputStyle: React.CSSProperties = {
+    width: "100%",
+    height: 50,
+    borderRadius: 14,
+    border: `1px solid ${homeTheme.border}`,
+    padding: "0 14px",
+    outline: "none",
+    backgroundColor: "#fff",
+    color: homeTheme.text,
+    colorScheme: "light",
+    fontFamily: "var(--font-body)",
+    fontSize: 15,
+    fontWeight: 700,
+    boxSizing: "border-box",
+  };
+
+  const labelStyle: React.CSSProperties = {
+    display: "block",
+    marginBottom: 8,
+    color: homeTheme.muted,
+    fontFamily: "var(--font-body)",
+    fontSize: 12,
+    fontWeight: 900,
+    letterSpacing: 0.35,
+    textTransform: "uppercase",
+  };
+
+  if (authStatus === "loading") {
+    return (
+      <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg, color: homeTheme.text }}>
+        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px", fontFamily: "var(--font-body)", fontWeight: 800 }}>
+          Loading employer profile…
+        </div>
+      </main>
+    );
+  }
+
+  return (
+    <main style={{ minHeight: "100vh", paddingTop: 82, paddingBottom: 64, backgroundColor: homeTheme.bg }}>
+      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 18px" }}>
+        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
+          <div className="rn-profile-header">
+            <div>
+              <p className="rn-profile-eyebrow">Employer Account</p>
+              <h1 className="rn-profile-title">My Profile</h1>
+              <p className="rn-profile-copy">
+                View your account details, update safe restaurant contact fields, and request password help.
+              </p>
+            </div>
+            <div className="rn-profile-actions">
+              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
+                Back to Dashboard
+              </Link>
+              <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
+                Post New Job
+              </Link>
+            </div>
+          </div>
+        </section>
+
+        <section className="rn-profile-summary" aria-label="Signed-in account summary">
+          <div>
+            <p>Signed-in email</p>
+            <strong>{displayValue(profile?.login_email)}</strong>
+          </div>
+          <div>
+            <p>Company / Restaurant</p>
+            <strong>{displayValue(profile?.company_name)}</strong>
+          </div>
+        </section>
+
+        {message ? (
+          <div
+            role={message.type === "error" ? "alert" : "status"}
+            className={message.type === "error" ? "rn-profile-alert rn-profile-alert-error" : "rn-profile-alert rn-profile-alert-success"}
+          >
+            {message.text}
+          </div>
+        ) : null}
+
+        <div className="rn-profile-stack">
+          <section style={homeCardStyle}>
+            <h2 className="rn-profile-section-title">Edit Profile</h2>
+            <p className="rn-profile-section-copy">
+              These safe fields are used for employer contact and location details only. Billing, admin, and Stripe fields cannot be edited here.
+            </p>
+            <form onSubmit={handleSave} className="rn-profile-form">
+              <div>
+                <label htmlFor="company-name" style={labelStyle}>Company / Restaurant name</label>
+                <input id="company-name" value={form.company_name} onChange={(event) => updateField("company_name", event.target.value)} style={inputStyle} />
+              </div>
+              <div>
+                <label htmlFor="contact-name" style={labelStyle}>Contact name</label>
+                <input id="contact-name" value={form.contact_name} onChange={(event) => updateField("contact_name", event.target.value)} style={inputStyle} />
+              </div>
+              <div>
+                <label htmlFor="phone" style={labelStyle}>Phone number</label>
+                <input id="phone" type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} style={inputStyle} />
+              </div>
+              <div>
+                <label htmlFor="support-email" style={labelStyle}>Support / contact email</label>
+                <input id="support-email" type="email" value={form.support_email} onChange={(event) => updateField("support_email", event.target.value)} style={inputStyle} placeholder={profile?.login_email ?? "jobs@restaurant.com"} />
+              </div>
+              <div className="rn-profile-form-full">
+                <label htmlFor="address" style={labelStyle}>Business / location address</label>
+                <input id="address" value={form.address} onChange={(event) => updateField("address", event.target.value)} style={inputStyle} />
+              </div>
+              <div>
+                <label htmlFor="city" style={labelStyle}>City</label>
+                <input id="city" value={form.city} onChange={(event) => updateField("city", event.target.value)} style={inputStyle} />
+              </div>
+              <div>
+                <label htmlFor="state" style={labelStyle}>State</label>
+                <select id="state" value={form.state} onChange={(event) => updateField("state", event.target.value)} style={inputStyle}>
+                  <option value="">Select state</option>
+                  {STATES.map((state) => (
+                    <option key={state} value={state}>{state}</option>
+                  ))}
+                </select>
+              </div>
+              <div>
+                <label htmlFor="postal-code" style={labelStyle}>ZIP / Postal code</label>
+                <input id="postal-code" value={form.postal_code} onChange={(event) => updateField("postal_code", event.target.value)} style={inputStyle} />
+              </div>
+              <div className="rn-profile-form-actions">
+                <button type="submit" style={homePrimaryButton} className="rn-btn-primary" disabled={isSaving}>
+                  {isSaving ? "Saving…" : "Save Profile"}
+                </button>
+              </div>
+            </form>
+          </section>
+
+          <section style={homeCardStyle}>
+            <h2 className="rn-profile-section-title">Password Management</h2>
+            <p className="rn-profile-section-copy">
+              For security, your current password is never shown. We will email a Supabase password reset link to your signed-in email address.
+            </p>
+            <button type="button" style={homeSecondaryButton} className="rn-btn-secondary" onClick={handleSendPasswordReset} disabled={isSendingReset}>
+              {isSendingReset ? "Sending…" : "Send Password Reset Email"}
+            </button>
+          </section>
+        </div>
+      </div>
+
+      <style jsx>{`
+        .rn-profile-header {
+          align-items: flex-start;
+          display: flex;
+          gap: 16px;
+          justify-content: space-between;
+          flex-wrap: wrap;
+        }
+
+        .rn-profile-eyebrow {
+          color: ${homeTheme.green};
+          font-family: var(--font-body);
+          font-size: 12px;
+          font-weight: 900;
+          letter-spacing: 0.4px;
+          margin: 0;
+          text-transform: uppercase;
+        }
+
+        .rn-profile-title {
+          color: ${homeTheme.green};
+          font-family: var(--font-heading);
+          font-size: 40px;
+          line-height: 1.1;
+          margin: 8px 0;
+        }
+
+        .rn-profile-copy,
+        .rn-profile-section-copy {
+          color: ${homeTheme.muted};
+          font-family: var(--font-body);
+          font-weight: 700;
+          line-height: 1.55;
+          margin: 0;
+        }
+
+        .rn-profile-actions,
+        .rn-profile-form-actions {
+          display: flex;
+          flex-wrap: wrap;
+          gap: 10px;
+        }
+
+        .rn-profile-alert {
+          border-radius: 14px;
+          font-family: var(--font-body);
+          font-weight: 900;
+          margin-bottom: 16px;
+          padding: 12px 14px;
+        }
+
+        .rn-profile-alert-error {
+          background-color: rgba(173,67,67,0.08);
+          border: 1px solid rgba(173,67,67,0.28);
+          color: #8a2f2f;
+        }
+
+        .rn-profile-alert-success {
+          background-color: rgba(53,128,110,0.10);
+          border: 1px solid rgba(53,128,110,0.24);
+          color: ${homeTheme.green};
+        }
+
+        .rn-profile-summary {
+          align-items: stretch;
+          background: rgba(255, 255, 255, 0.78);
+          border: 1px solid ${homeTheme.border};
+          border-radius: 18px;
+          display: grid;
+          gap: 10px;
+          grid-template-columns: repeat(2, minmax(0, 1fr));
+          margin: 0 auto 16px;
+          max-width: 900px;
+          padding: 14px;
+        }
+
+        .rn-profile-summary div {
+          background: #fff;
+          border: 1px solid rgba(0, 0, 0, 0.06);
+          border-radius: 14px;
+          padding: 13px 14px;
+        }
+
+        .rn-profile-summary p {
+          color: ${homeTheme.muted};
+          font-family: var(--font-body);
+          font-size: 12px;
+          font-weight: 900;
+          letter-spacing: 0.35px;
+          margin: 0 0 5px 0;
+          text-transform: uppercase;
+        }
+
+        .rn-profile-summary strong {
+          color: ${homeTheme.text};
+          display: block;
+          font-family: var(--font-body);
+          font-size: 16px;
+          font-weight: 900;
+          overflow-wrap: anywhere;
+        }
+
+        .rn-profile-stack {
+          display: grid;
+          gap: 16px;
+          margin: 0 auto;
+          max-width: 900px;
+        }
+
+        .rn-profile-section-title {
+          color: ${homeTheme.text};
+          font-family: var(--font-heading);
+          font-size: 26px;
+          line-height: 1.2;
+          margin: 0 0 8px 0;
+        }
+
+        .rn-profile-form {
+          display: grid;
+          gap: 14px;
+          grid-template-columns: repeat(2, minmax(0, 1fr));
+          margin-top: 16px;
+        }
+
+        .rn-profile-form-full,
+        .rn-profile-form-actions {
+          grid-column: 1 / -1;
+        }
+
+        @media (max-width: 680px) {
+          .rn-profile-summary,
+          .rn-profile-form {
+            grid-template-columns: 1fr;
+          }
+        }
+      `}</style>
+    </main>
+  );
+}
diff --git a/supabase/schema/employer-profiles.sql b/supabase/schema/employer-profiles.sql
new file mode 100644
index 0000000000000000000000000000000000000000..d301f6bfcc96803e1f217d6e53a43a6491ef1779
--- /dev/null
+++ b/supabase/schema/employer-profiles.sql
@@ -0,0 +1,57 @@
+-- Employer profile/account settings storage for /employer-dashboard/profile.
+-- Run this in the Supabase SQL editor before enabling profile edits in production.
+
+create table if not exists public.employer_profiles (
+  user_id uuid primary key references auth.users(id) on delete cascade,
+  login_email text,
+  company_name text,
+  contact_name text,
+  phone text,
+  address text,
+  city text,
+  state text,
+  postal_code text,
+  support_email text,
+  first_name text,
+  last_name text,
+  job_title text,
+  jobs_open text,
+  created_at timestamptz not null default now(),
+  updated_at timestamptz not null default now()
+);
+
+alter table public.employer_profiles enable row level security;
+
+create policy "Employers can view their own profile"
+  on public.employer_profiles
+  for select
+  using (auth.uid() = user_id);
+
+create policy "Employers can insert their own safe profile"
+  on public.employer_profiles
+  for insert
+  with check (auth.uid() = user_id);
+
+create policy "Employers can update their own safe profile"
+  on public.employer_profiles
+  for update
+  using (auth.uid() = user_id)
+  with check (auth.uid() = user_id);
+
+create or replace function public.set_employer_profiles_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at = now();
+  return new;
+end;
+$$;
+
+drop trigger if exists set_employer_profiles_updated_at on public.employer_profiles;
+create trigger set_employer_profiles_updated_at
+  before update on public.employer_profiles
+  for each row
+  execute function public.set_employer_profiles_updated_at();
+
+comment on table public.employer_profiles is 'Employer-owned account settings profile. Do not store billing status, admin status, Stripe IDs, or password values here.';
 
EOF
)
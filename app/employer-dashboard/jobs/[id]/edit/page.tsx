"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatCandidateNotificationEmails, parseCandidateNotificationEmails } from "../../../../../lib/candidateNotificationEmails";
import { canUserAccessJob } from "../../../../../lib/employerJobAccess";
import { CANADIAN_PROVINCE_OPTIONS, COUNTRY_OPTIONS, STATE_OPTIONS } from "../../../../../lib/jobFormOptions";
import { supabase } from "../../../../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../../../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type EmployerAccessScope = "single_location" | "multi_location" | "full_account_access";
type EmployerAccess = { role: EmployerRole; userType: EmployerAccessScope; assignedStoreIds: string[]; accountId: string | null; ownerUserId: string; ownerEmail: string; canManageJobs: boolean; };
type EmployerOwner = { userId: string; email: string; accountId?: string | null; ownerUserId?: string; ownerEmail?: string; role?: EmployerRole; userType?: EmployerAccessScope; assignedStoreIds?: string[]; canManageJobs?: boolean };

type JobRecord = {
  id: string;
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  country: "United States" | "Canada" | null;
  postal_code: string | null;
  role_category: string | null;
  employment_type: string | null;
  pay_range: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
  candidate_notification_email: string | null;
  employer_store_id?: string | null;
  candidate_notification_emails?: string[] | null;
  candidate_notification_routing: string | null;
};

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function parseDescriptionSections(rawDescription: string | null) {
  const lines = (rawDescription ?? "").split("\n");
  const scheduleLine = lines.find((line) => line.startsWith("Schedule:"));
  const benefitsLine = lines.find((line) => line.startsWith("Benefits:"));

  const description = lines
    .filter((line) => !line.startsWith("Schedule:") && !line.startsWith("Benefits:"))
    .join("\n")
    .trim();

  return {
    description,
    schedule: scheduleLine?.replace("Schedule:", "").trim() ?? "",
    benefits: benefitsLine?.replace("Benefits:", "").trim() ?? "",
  };
}

async function loadOwnedJob(jobId: string, owner: EmployerOwner) {
  const fields = "id,title,restaurant_name,city,state,country,postal_code,role_category,employment_type,pay_range,description,active,created_at,candidate_notification_email,candidate_notification_emails,candidate_notification_routing,employer_store_id";
  const queries = [];

  if (owner.accountId) {
    queries.push(
      supabase.from("jobs").select(fields).eq("id", jobId).eq("employer_account_id", owner.accountId).limit(1),
    );
  }

  queries.push(
    supabase.from("jobs").select(fields).eq("id", jobId).eq("employer_user_id", owner.ownerUserId ?? owner.userId).limit(1),
    supabase.from("jobs").select(fields).eq("id", jobId).eq("employer_email", owner.ownerEmail ?? owner.email).limit(1),
  );

  for (const query of queries) {
    const result = await query;
    if (result.error) return { job: null, error: result.error };
    const job = result.data?.[0] as JobRecord | undefined;
    if (job) {
      // Team Members/Viewers are location/email-scoped by the job's
      // "Where should candidate interest emails be sent?" candidate email field.
      return canUserAccessJob({ email: owner.email, userType: owner.userType, assignedStoreIds: owner.assignedStoreIds }, owner.role ?? "account_owner", job)
        ? { job, error: null }
        : { job: null, error: null };
    }
  }

  return { job: null, error: null };
}

const editFieldStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  minHeight: 48,
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${homeTheme.border}`,
  backgroundColor: "#ffffff",
  color: homeTheme.text,
  fontFamily: "var(--font-body)",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.4,
  boxShadow: "0 8px 18px rgba(0,0,0,.05)",
  transition: "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
};

const editTextareaStyle: React.CSSProperties = {
  ...editFieldStyle,
  minHeight: 126,
  padding: "12px 12px",
  resize: "vertical",
};

function EmployerJobEditForm() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params?.id;
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [owner, setOwner] = useState<EmployerOwner | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editCountry, setEditCountry] = useState<"United States" | "Canada">("United States");
  const [editRegion, setEditRegion] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadJob() {
      if (!jobId) {
        if (mounted) {
          setNotFound(true);
          setAuthStatus("allowed");
        }
        return;
      }

      const { data, error: authError } = await supabase.auth.getUser();
      const authUser = data?.user;

      if (authError || !authUser) {
        router.replace(`/employer-login?next=${encodeURIComponent(`/employer-dashboard/jobs/${jobId}/edit`)}`);
        return;
      }

      const email = authUser.email?.trim();
      const userId = authUser.id;

      if (!email || !userId) {
        if (mounted) {
          setMessage("Your employer session is missing account ownership details. Please sign out and sign back in.");
          setNotFound(true);
          setAuthStatus("allowed");
        }
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      let access: EmployerAccess | null = null;
      if (accessToken) {
        const accessResponse = await fetch("/api/employer/me", { headers: employerAccountHeaders(accessToken) });
        const accessPayload = (await accessResponse.json().catch(() => null)) as { employer?: EmployerAccess } | null;
        access = accessPayload?.employer ?? null;
      }

      const currentOwner = {
        userId,
        email,
        accountId: access?.accountId ?? null,
        ownerUserId: access?.ownerUserId ?? userId,
        ownerEmail: access?.ownerEmail ?? email,
        role: access?.role ?? "account_owner",
        userType: access?.userType,
        assignedStoreIds: access?.assignedStoreIds,
        canManageJobs: access?.canManageJobs ?? true,
      };
      const result = await loadOwnedJob(jobId, currentOwner);

      if (!mounted) return;

      setOwner(currentOwner);
      setJob(result.job);
      setEditCountry(result.job?.country === "Canada" ? "Canada" : "United States");
      setEditRegion(result.job?.state ?? "");
      setNotFound(!!result.error || !result.job);
      setAuthStatus("allowed");
      setMessage(result.error?.message ?? null);
    }

    loadJob();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadJob();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [jobId, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!jobId || !owner) {
      setMessage("We could not save this listing because the employer session is unavailable. Please refresh and try again.");
      return;
    }

    if (!owner.canManageJobs) {
      setMessage("Your employer role can view this listing, but cannot edit jobs. Contact your account admin to make changes.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const roleCategory = String(formData.get("role_category") ?? "").trim();
    const employmentType = String(formData.get("employment_type") ?? "").trim();
    const pay = String(formData.get("pay_range") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    const country = String(formData.get("country") ?? "United States");
    const postalCode = String(formData.get("postal_code") ?? "").trim();
    const schedule = String(formData.get("schedule") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const benefits = String(formData.get("benefits") ?? "").trim();
    const candidateNotificationInput = String(formData.get("candidate_notification_email") ?? "");
    const parsedNotificationEmails = parseCandidateNotificationEmails(candidateNotificationInput);

    if (!parsedNotificationEmails.ok) {
      setMessage(parsedNotificationEmails.message);
      return;
    }

    const candidateNotificationEmails = parsedNotificationEmails.emails;
    const candidateNotificationEmail = parsedNotificationEmails.value;

    if (!city || !state || !postalCode || !COUNTRY_OPTIONS.includes(country as (typeof COUNTRY_OPTIONS)[number])) {
      setMessage("Complete all required location fields.");
      return;
    }
    const composedDescription = [
      description,
      schedule ? `Schedule: ${schedule}` : "",
      benefits ? `Benefits: ${benefits}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const payload = {
      title,
      role_category: roleCategory || null,
      employment_type: employmentType || null,
      pay_range: pay || null,
      city,
      state,
      country,
      postal_code: postalCode,
      description: composedDescription || null,
      candidate_notification_email: candidateNotificationEmail || null,
      candidate_notification_emails: candidateNotificationEmails.length > 0 ? candidateNotificationEmails : null,
      candidate_notification_routing: candidateNotificationEmails.length > 0 ? "custom_job_email" : "job_poster",
    };

    setIsSaving(true);
    setMessage(null);

    const updateByAccountId = owner.accountId
      ? await supabase
          .from("jobs")
          .update(payload, { count: "exact" })
          .eq("id", jobId)
          .eq("employer_account_id", owner.accountId)
      : null;

    const updateByUserId = updateByAccountId && !updateByAccountId.error && updateByAccountId.count && updateByAccountId.count > 0
      ? updateByAccountId
      : await supabase
          .from("jobs")
          .update(payload, { count: "exact" })
          .eq("id", jobId)
          .eq("employer_user_id", owner.ownerUserId ?? owner.userId);

    const updateResult =
      !updateByUserId.error && updateByUserId.count && updateByUserId.count > 0
        ? updateByUserId
        : await supabase
            .from("jobs")
            .update(payload, { count: "exact" })
            .eq("id", jobId)
            .eq("employer_email", owner.ownerEmail ?? owner.email);

    setIsSaving(false);

    if (updateResult.error) {
      setMessage(updateResult.error.message || "We could not save this listing. Please refresh and try again.");
      return;
    }

    if (updateResult.count === 0) {
      setMessage("We could not find that exact job for your employer account. Please refresh and try again.");
      return;
    }

    const refreshed = await loadOwnedJob(jobId, owner);
    setJob(refreshed.job);
    setNotFound(!refreshed.job);
    setMessage("Changes saved to database.");
    router.replace(`/employer-dashboard/jobs/${jobId}/edit?status=saved&mode=live`);
  }

  const parsedDescription = parseDescriptionSections(job?.description ?? null);
  const status = searchParams.get("status");

  if (authStatus === "loading") {
    return (
      <main
        style={{
          minHeight: "100vh",
          paddingTop: 100,
          backgroundColor: homeTheme.bg,
          color: homeTheme.text,
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 18px" }}>Loading job editor…</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        paddingTop: 82,
        paddingBottom: 64,
        backgroundColor: homeTheme.bg,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
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
              fontSize: 36,
              lineHeight: 1.1,
              fontFamily: "var(--font-heading)",
              color: homeTheme.green,
            }}
          >
            Edit Job Listing
          </h1>
          <p
            style={{
              marginBottom: 0,
              color: homeTheme.muted,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
            }}
          >
            Update this listing while keeping the dashboard layout and publishing flow unchanged.
          </p>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          {notFound || !job ? (
            <>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                Job not found
              </h2>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 600 }}>
                We could not load this listing for your employer account. It may have been removed, owned by another account, or missing ownership details.
              </p>
              {message ? <p style={{ color: "#8a2f2f", fontWeight: 700 }}>{message}</p> : null}
            </>
          ) : (
            <>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                {job.title}
              </h2>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 700 }}>
                {job.restaurant_name || "Restaurant"} • {[job.city, job.state].filter(Boolean).join(", ") || "Location not set"}
              </p>

              <div
                style={{
                  border: `1px solid ${homeTheme.border}`,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: "rgba(255,255,255,0.76)",
                }}
              >
                <p style={{ margin: "0 0 8px 0", color: homeTheme.text, fontWeight: 700 }}>
                  Listing details
                </p>
                <p style={{ margin: "0 0 12px 0", color: homeTheme.muted, fontWeight: 600 }}>
                  Status: {job.active ? "Active" : "Pending / Inactive"} • Posted: {formatDate(job.created_at)}
                </p>

                <form onSubmit={handleSubmit}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Job title
                      <input
                        name="title"
                        defaultValue={job.title || ""}
                        required
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Role category
                      <input
                        name="role_category"
                        defaultValue={job.role_category || ""}
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Employment type
                      <input
                        name="employment_type"
                        defaultValue={job.employment_type || ""}
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Pay
                      <input
                        name="pay_range"
                        defaultValue={job.pay_range || ""}
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Country
                      <select name="country" value={editCountry} onChange={(event) => { setEditCountry(event.target.value as "United States" | "Canada"); setEditRegion(""); }} className="rn-edit-field" style={editFieldStyle} required>
                        {COUNTRY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      City
                      <input
                        name="city"
                        defaultValue={job.city || ""}
                        className="rn-edit-field"
                        style={editFieldStyle}
                        required
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      {editCountry === "Canada" ? "Province / Territory" : "State"}
                      <select name="state" value={editRegion} onChange={(event) => setEditRegion(event.target.value)} className="rn-edit-field" style={editFieldStyle} required>
                        <option value="">Select…</option>
                        {(editCountry === "Canada" ? CANADIAN_PROVINCE_OPTIONS : STATE_OPTIONS).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      {editCountry === "Canada" ? "Postal Code" : "ZIP Code"}
                      <input name="postal_code" defaultValue={job.postal_code || ""} className="rn-edit-field" style={editFieldStyle} required />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Schedule
                      <input
                        name="schedule"
                        defaultValue={parsedDescription.schedule}
                        placeholder="e.g., Weeknights and weekends"
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Where should candidate interest emails be sent?
                      <input
                        name="candidate_notification_email"
                        type="text"
                        inputMode="email"
                        defaultValue={formatCandidateNotificationEmails(job.candidate_notification_emails?.length ? job.candidate_notification_emails : job.candidate_notification_email)}
                        placeholder="gm@example.com, op@example.com, hr@example.com"
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                      <span style={{ display: "block", marginTop: 6, color: homeTheme.muted, fontSize: 13 }}>
                        Enter one or more email addresses. Separate multiple emails with commas.
                      </span>
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Description
                      <textarea
                        name="description"
                        defaultValue={parsedDescription.description}
                        rows={5}
                        className="rn-edit-field"
                        style={editTextareaStyle}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Benefits
                      <input
                        name="benefits"
                        defaultValue={parsedDescription.benefits}
                        placeholder="e.g., Health insurance, PTO"
                        className="rn-edit-field"
                        style={editFieldStyle}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <button type="submit" style={homePrimaryButton} className="rn-btn-primary" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                    {status === "saved" || message === "Changes saved to database." ? (
                      <span style={{ color: homeTheme.green, fontWeight: 700 }}>Changes saved to database.</span>
                    ) : null}
                    {message && message !== "Changes saved to database." ? (
                      <span style={{ color: "#8a2f2f", fontWeight: 700 }}>{message}</span>
                    ) : null}
                  </div>
                </form>
              </div>
            </>
          )}
        </section>

        <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/employer-dashboard" style={homePrimaryButton} className="rn-btn-primary">
            Back to Dashboard
          </Link>
          {jobId ? (
            <Link href={`/jobs/${jobId}`} style={homeSecondaryButton} className="rn-btn-secondary">
              View Public Job Page
            </Link>
          ) : null}
          <Link href="/post-job" style={homeSecondaryButton} className="rn-btn-secondary">
            Post New Job
          </Link>
        </section>
      </div>
      <style>{`
        .rn-edit-field::placeholder {
          color: rgba(0,0,0,.46);
          font-weight: 600;
        }

        .rn-edit-field:hover {
          border-color: rgba(53,128,110,.34) !important;
          background-color: #ffffff !important;
        }

        .rn-edit-field:focus,
        .rn-edit-field:focus-visible {
          border-color: rgba(53,128,110,.48) !important;
          box-shadow: 0 0 0 3px rgba(53,128,110,.18), 0 8px 18px rgba(0,0,0,.05) !important;
          outline: none !important;
          background-color: #ffffff !important;
        }
      `}</style>
    </main>
  );
}

function employerAccountHeaders(token: string, contentType?: string) {
  const selectedEmployerAccountId = typeof window === "undefined" ? null : window.localStorage.getItem("rn-selected-employer-account-id");
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
  };
}

export default function EmployerJobEditPage() {
  return (
    <Suspense fallback={null}>
      <EmployerJobEditForm />
    </Suspense>
  );
}

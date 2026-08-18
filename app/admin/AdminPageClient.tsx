"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";
import {
  adminFilterForJob,
  adminReadableStatusForJob,
  type AdminJobFilter,
  type AdminReadableStatus,
  isMissingStatusColumnError,
} from "../../lib/jobStatus";

type AdminJob = {
  id: string;
  restaurant_name: string | null;
  apply_email: string | null;
  title: string;
  city: string | null;
  state: string | null;
  active: boolean;
  status: string | null;
  description: string | null;
  pay_range: string | null;
  employment_type: string | null;
  how_to_apply: string | null;
  created_at: string;
};

type ContactInquiry = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string;
  status: string | null;
  is_read: boolean | null;
};

type AdminUser = {
  email: string;
  source: "bootstrap" | "database";
  created_at: string | null;
  created_by_email: string | null;
};

type JobsQueryVariant = {
  fields: string;
  includesStatus: boolean;
};

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createClient(url, key);
}

function formatDate(isoDate: string) {
  if (!isoDate) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function statusPillStyle(status: AdminReadableStatus) {
  const statusMap: Record<
    typeof status,
    { bg: string; text: string; border: string }
  > = {
    Active: {
      bg: "rgba(53,128,110,0.10)",
      text: "#1d5b4d",
      border: "rgba(53,128,110,0.24)",
    },
    Pending: {
      bg: "rgba(227,160,8,0.12)",
      text: "#7a5600",
      border: "rgba(227,160,8,0.28)",
    },
    Paused: {
      bg: "rgba(173,67,67,0.10)",
      text: "#8a2f2f",
      border: "rgba(173,67,67,0.24)",
    },
    Rejected: {
      bg: "rgba(120,34,98,0.10)",
      text: "#6f1f59",
      border: "rgba(120,34,98,0.30)",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: `1px solid ${statusMap[status].border}`,
    backgroundColor: statusMap[status].bg,
    color: statusMap[status].text,
    fontWeight: 800,
    fontSize: 12,
    fontFamily: "var(--font-body)",
    padding: "5px 10px",
  } satisfies React.CSSProperties;
}

export default function AdminPageClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"jobs" | "contacts" | "admins">("jobs");
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [jobsState, setJobsState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsActionMessage, setJobsActionMessage] = useState<string | null>(
    null,
  );
  const [busyJobAction, setBusyJobAction] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [statusColumnAvailable, setStatusColumnAvailable] = useState(true);
  const [jobFilter, setJobFilter] = useState<AdminJobFilter>("pending");
  const [previewJob, setPreviewJob] = useState<AdminJob | null>(null);

  const [contactInquiries, setContactInquiries] = useState<ContactInquiry[]>(
    [],
  );
  const [contactState, setContactState] = useState<
    "loading" | "ready" | "not_configured" | "error"
  >("loading");
  const [contactSource, setContactSource] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersState, setAdminUsersState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adminAddState, setAdminAddState] = useState<"idle" | "saving">("idle");
  const [adminAddMessage, setAdminAddMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAdminData() {
      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setJobsState("error");
          setJobsError("Supabase environment variables are missing.");
          setContactState("not_configured");
          setAdminUsersState("error");
          setAdminUsersError("Supabase environment variables are missing.");
        }
        return;
      }

      const variants: JobsQueryVariant[] = [
        {
          fields:
            "id,restaurant_name,apply_email,title,city,state,active,status,description,pay_range,employment_type,how_to_apply,created_at",
          includesStatus: true,
        },
        {
          fields:
            "id,restaurant_name,apply_email,title,city,state,active,description,pay_range,employment_type,how_to_apply,created_at",
          includesStatus: false,
        },
      ];

      let selectedVariant: JobsQueryVariant | null = null;
      let jobsRows: Array<Record<string, unknown>> | null = null;
      let jobsErr: { message?: string } | null = null;

      for (const variant of variants) {
        const result = await client
          .from("jobs")
          .select(variant.fields)
          .order("created_at", { ascending: false });

        if (!result.error) {
          selectedVariant = variant;
          jobsRows = result.data as unknown as Array<Record<string, unknown>>;
          jobsErr = null;
          break;
        }

        if (isMissingStatusColumnError(result.error)) {
          jobsErr = result.error;
          continue;
        }

        jobsErr = result.error;
        break;
      }

      if (mounted) {
        if (jobsErr || !jobsRows || !selectedVariant) {
          setJobs([]);
          setJobsState("error");
          setJobsError(
            jobsErr?.message ??
              "Could not load job submissions for admin review.",
          );
        } else {
          setStatusColumnAvailable(selectedVariant.includesStatus);
          setJobs(
            jobsRows.map((row) => ({
              id: String(row.id ?? ""),
              restaurant_name:
                typeof row.restaurant_name === "string"
                  ? row.restaurant_name
                  : null,
              apply_email:
                typeof row.apply_email === "string" ? row.apply_email : null,
              title: String(row.title ?? ""),
              city: typeof row.city === "string" ? row.city : null,
              state: typeof row.state === "string" ? row.state : null,
              active: Boolean(row.active),
              status:
                selectedVariant.includesStatus && typeof row.status === "string"
                  ? row.status
                  : null,
              description:
                typeof row.description === "string" ? row.description : null,
              pay_range:
                typeof row.pay_range === "string" ? row.pay_range : null,
              employment_type:
                typeof row.employment_type === "string"
                  ? row.employment_type
                  : null,
              how_to_apply:
                typeof row.how_to_apply === "string" ? row.how_to_apply : null,
              created_at: String(row.created_at ?? ""),
            })),
          );
          setJobsState("ready");
          setJobsError(null);
        }
      }

      const contactResponse = await fetch("/api/admin/contact-inquiries", {
        credentials: "include",
      });
      const contactBody = (await contactResponse.json().catch(() => null)) as {
        inquiries?: ContactInquiry[];
        source?: string;
        error?: string;
      } | null;

      if (mounted) {
        if (!contactResponse.ok) {
          setContactInquiries([]);
          setContactSource(null);
          setContactState("not_configured");
          setContactError(
            contactBody?.error ||
              "No readable contact inquiry table was found. Apply supabase/policies/contact-inquiries.sql in Supabase.",
          );
        } else {
          setContactInquiries(contactBody?.inquiries ?? []);
          setContactSource(contactBody?.source ?? "contact_inquiries");
          setContactState("ready");
          setContactError(null);
        }
      }

      const adminUsersResponse = await fetch("/api/admin/users", {
        credentials: "include",
      });
      const adminUsersBody = (await adminUsersResponse
        .json()
        .catch(() => null)) as { admins?: AdminUser[]; error?: string } | null;

      if (mounted) {
        if (!adminUsersResponse.ok) {
          setAdminUsers([]);
          setAdminUsersState("error");
          setAdminUsersError(
            adminUsersBody?.error || "Could not load admin users.",
          );
        } else {
          setAdminUsers(adminUsersBody?.admins ?? []);
          setAdminUsersState("ready");
          setAdminUsersError(null);
        }
      }
    }

    loadAdminData();

    return () => {
      mounted = false;
    };
  }, []);

  const employerRows = useMemo(() => {
    const map = new Map<
      string,
      { employer: string; email: string; adCount: number; latest: string }
    >();

    for (const job of jobs) {
      const employerName =
        (job.restaurant_name ?? "").trim() || "Unknown restaurant";
      const email = (job.apply_email ?? "").trim() || "—";
      const key = `${employerName}::${email}`;

      const existing = map.get(key);
      if (existing) {
        existing.adCount += 1;
        if (
          new Date(job.created_at).getTime() >
          new Date(existing.latest).getTime()
        ) {
          existing.latest = job.created_at;
        }
      } else {
        map.set(key, {
          employer: employerName,
          email,
          adCount: 1,
          latest: job.created_at,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime(),
    );
  }, [jobs]);

  function getAdminReadableStatus(job: AdminJob): AdminReadableStatus {
    return adminReadableStatusForJob(job.status, job.active);
  }

  async function updateJobStatus(jobId: string, action: "approve" | "reject") {
    if (busyJobAction) return;

    const previousJob = jobs.find((job) => job.id === jobId) ?? null;
    if (!previousJob) return;

    setJobsError(null);
    setJobsActionMessage(null);
    setBusyJobAction({ id: jobId, action });
    const optimisticStatus = action === "approve" ? "active" : "rejected";
    const optimisticActive = action === "approve";
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              active: optimisticActive,
              status: statusColumnAvailable ? optimisticStatus : job.status,
            }
          : job,
      ),
    );

    const response = await fetch(
      `/api/admin/jobs/${encodeURIComponent(jobId)}/${action}`,
      {
        method: "POST",
        credentials: "include",
      },
    );

    const body = (await response.json().catch(() => null)) as {
      error?: string;
      job?: {
        id: string;
        active: boolean;
        status?: string | null;
      };
    } | null;

    if (!response.ok) {
      setJobsError(
        body?.error ||
          `${action === "approve" ? "Approval" : "Rejection"} update failed.`,
      );
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                active: previousJob.active,
                status: previousJob.status,
              }
            : job,
        ),
      );
    } else {
      if (body?.job) {
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  active: Boolean(body.job?.active),
                  status:
                    statusColumnAvailable &&
                    typeof body.job?.status === "string"
                      ? body.job.status
                      : job.status,
                }
              : job,
          ),
        );
      }
      setJobsActionMessage(
        action === "approve"
          ? "Job approved and now eligible for public listings."
          : "Job rejected and removed from public visibility.",
      );
    }

    setBusyJobAction(null);
  }

  async function addAdminUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adminAddState === "saving") return;

    const normalizedEmail = newAdminEmail.trim().toLowerCase();
    setAdminUsersError(null);
    setAdminAddMessage(null);
    setAdminAddState("saving");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    const body = (await response.json().catch(() => null)) as {
      admin?: AdminUser;
      error?: string;
    } | null;

    if (!response.ok) {
      setAdminUsersError(body?.error || "Could not add admin user.");
    } else if (body?.admin) {
      setAdminUsers((prev) => [...prev, body.admin as AdminUser]);
      setNewAdminEmail("");
      setAdminAddMessage(
        `${body.admin.email} can now access admin after signing in.`,
      );
    }

    setAdminAddState("idle");
  }

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) => adminFilterForJob(job.status, job.active) === jobFilter,
      ),
    [jobs, jobFilter],
  );

  const filterCount = useMemo(() => {
    const counts = { pending: 0, approved: 0, paused: 0, rejected: 0 };
    for (const job of jobs) {
      const filter = adminFilterForJob(job.status, job.active);
      counts[filter] += 1;
    }
    return counts;
  }, [jobs]);

  const container: React.CSSProperties = {
    maxWidth: 1160,
    margin: "0 auto",
    padding: "96px 18px 72px",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    ...homeSecondaryButton,
    borderColor: active ? "rgba(53,128,110,.45)" : homeTheme.border,
    backgroundColor: active ? "rgba(53,128,110,.10)" : "#fff",
    color: active ? "#1d5b4d" : "rgba(0,0,0,.75)",
    boxShadow: active
      ? "0 12px 24px rgba(53,128,110,.12)"
      : "0 10px 22px rgba(0,0,0,.08)",
    padding: "10px 14px",
  });

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    borderRadius: 14,
    border: `1px solid ${homeTheme.border}`,
    backgroundColor: "#fff",
  };

  const thTdCommon: React.CSSProperties = {
    textAlign: "left",
    padding: "12px 14px",
    borderBottom: `1px solid ${homeTheme.border}`,
    fontSize: 14,
    fontFamily: "var(--font-body)",
    color: homeTheme.text,
    whiteSpace: "nowrap",
  };

  return (
    <main style={{ backgroundColor: homeTheme.bg, minHeight: "100vh" }}>
      <div style={container}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  color: homeTheme.green,
                  fontSize: 50,
                  lineHeight: 1,
                  fontFamily: "var(--font-heading)",
                }}
              >
                Admin
              </h1>
              <p
                style={{
                  marginTop: 12,
                  marginBottom: 0,
                  color: homeTheme.muted,
                  maxWidth: 740,
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1.6,
                  fontFamily: "var(--font-body)",
                }}
              >
                Internal review workspace for submitted job ads and incoming
                contact inquiries.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                href="/"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
              >
                Home
              </Link>
              <Link
                href="/employer-dashboard"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
              >
                Employer Dashboard
              </Link>
              <button
                type="button"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
                onClick={async () => {
                  await fetch("/api/admin/session", {
                    method: "DELETE",
                    credentials: "include",
                  });
                  router.replace("/admin/login");
                }}
              >
                Sign Out
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              border: "1px solid rgba(53,128,110,.22)",
              backgroundColor: "rgba(53,128,110,.08)",
              color: homeTheme.green,
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
            }}
          >
            Access is restricted to approved admins via Supabase auth,
            server-side allowlist checks, and the admin_users table.
          </div>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div aria-label="Admin sections" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              aria-pressed={tab === "jobs"}
              onClick={() => setTab("jobs")}
              style={tabBtn(tab === "jobs")}
            >
              Job Approvals
            </button>
            <button
              type="button"
              aria-pressed={tab === "contacts"}
              onClick={() => setTab("contacts")}
              style={tabBtn(tab === "contacts")}
            >
              Contact Inquiries
            </button>
            <button
              type="button"
              aria-pressed={tab === "admins"}
              onClick={() => setTab("admins")}
              style={tabBtn(tab === "admins")}
            >
              Admin Management
            </button>
            <Link
              href="/admin/blog"
              style={tabBtn(false)}
              className="rn-btn-secondary"
            >
              Blog Drafts
            </Link>
            <Link href="/admin/candidate-resources" style={tabBtn(false)} className="rn-btn-secondary">
              Candidate Resources
            </Link>
          </div>
        </section>

        {tab === "jobs" ? (
          <>
            <section style={{ ...homeCardStyle, marginBottom: 16 }}>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  color: homeTheme.text,
                }}
              >
                Employers with submitted jobs
              </h2>

              {jobsState === "loading" ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  Loading employer submissions…
                </div>
              ) : employerRows.length === 0 ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  No employer submissions found yet. Once employers post jobs,
                  they will show up here.
                </div>
              ) : (
                <div style={tableWrap}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(0,0,0,.03)" }}>
                        <th style={thTdCommon}>Employer / Restaurant</th>
                        <th style={thTdCommon}>Contact Email</th>
                        <th style={thTdCommon}>Job Ads</th>
                        <th style={thTdCommon}>Latest Submission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employerRows.map((row) => (
                        <tr key={`${row.employer}-${row.email}`}>
                          <td style={thTdCommon}>{row.employer}</td>
                          <td style={thTdCommon}>{row.email}</td>
                          <td style={thTdCommon}>{row.adCount}</td>
                          <td style={thTdCommon}>{formatDate(row.latest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={homeCardStyle}>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  color: homeTheme.text,
                }}
              >
                Job ad review
              </h2>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 14,
                  color: homeTheme.muted,
                  fontWeight: 700,
                }}
              >
                Approval marks a listing public only when both status is active
                and active is true
                {statusColumnAvailable
                  ? "."
                  : " (legacy fallback: active = true)."}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                {[
                  {
                    key: "pending",
                    label: "Pending",
                    count: filterCount.pending,
                  },
                  {
                    key: "approved",
                    label: "Approved",
                    count: filterCount.approved,
                  },
                  { key: "paused", label: "Paused", count: filterCount.paused },
                  {
                    key: "rejected",
                    label: "Rejected",
                    count: filterCount.rejected,
                  },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={jobFilter === filter.key}
                    onClick={() => setJobFilter(filter.key as typeof jobFilter)}
                    style={tabBtn(jobFilter === filter.key)}
                  >
                    {filter.label} ({filter.count})
                  </button>
                ))}
              </div>

              {jobsError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(173,67,67,.24)",
                    color: "#8a2f2f",
                    backgroundColor: "rgba(173,67,67,.08)",
                    fontWeight: 700,
                  }}
                >
                  {jobsError}
                </div>
              )}

              {jobsActionMessage && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(53,128,110,.24)",
                    color: "#1d5b4d",
                    backgroundColor: "rgba(53,128,110,.08)",
                    fontWeight: 700,
                  }}
                >
                  {jobsActionMessage}
                </div>
              )}

              {jobsState === "loading" ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  Loading job ads…
                </div>
              ) : jobs.length === 0 ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  No jobs submitted yet. When employers post jobs, this approval
                  queue will populate.
                </div>
              ) : filteredJobs.length === 0 ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  No jobs in the <strong>{jobFilter}</strong> queue right now.
                </div>
              ) : (
                <div style={tableWrap}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(0,0,0,.03)" }}>
                        <th style={thTdCommon}>Employer</th>
                        <th style={thTdCommon}>Job Title</th>
                        <th style={thTdCommon}>Location</th>
                        <th style={thTdCommon}>Status</th>
                        <th style={thTdCommon}>Date Submitted</th>
                        <th style={thTdCommon}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.map((job, index) => {
                        const readableStatus = getAdminReadableStatus(job);
                        const isApproved = readableStatus === "Active";
                        const isRejected = readableStatus === "Rejected";
                        const isPending = readableStatus === "Pending";
                        const isBusy = busyJobAction?.id === job.id;
                        return (
                          <tr
                            key={job.id}
                            style={{
                              backgroundColor: isPending
                                ? "rgba(227,160,8,0.08)"
                                : index % 2
                                  ? "rgba(0,0,0,0.02)"
                                  : "#fff",
                              boxShadow: isPending
                                ? "inset 4px 0 0 rgba(227,160,8,0.8)"
                                : undefined,
                            }}
                          >
                            <td style={{ ...thTdCommon, fontWeight: 800 }}>
                              {(job.restaurant_name ?? "").trim() ||
                                "Unknown restaurant"}
                            </td>
                            <td
                              style={{
                                ...thTdCommon,
                                whiteSpace: "normal",
                                minWidth: 180,
                              }}
                            >
                              {job.title || "Untitled job"}
                            </td>
                            <td
                              style={{ ...thTdCommon, color: homeTheme.muted }}
                            >
                              {[job.city, job.state]
                                .filter(Boolean)
                                .join(", ") || "—"}
                            </td>
                            <td style={{ ...thTdCommon, textAlign: "center" }}>
                              <span style={statusPillStyle(readableStatus)}>
                                {readableStatus}
                              </span>
                            </td>
                            <td style={thTdCommon}>
                              {formatDate(job.created_at)}
                            </td>
                            <td style={thTdCommon}>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => setPreviewJob(job)}
                                  style={{
                                    ...homeSecondaryButton,
                                    padding: "8px 12px",
                                    fontSize: 12,
                                  }}
                                >
                                  Preview
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateJobStatus(job.id, "approve")
                                  }
                                  style={{
                                    ...homePrimaryButton,
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    opacity: isApproved || isBusy ? 0.6 : 1,
                                    cursor:
                                      isApproved || isBusy
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                  disabled={isApproved || isBusy}
                                >
                                  {isApproved
                                    ? "Approved"
                                    : isBusy &&
                                        busyJobAction?.action === "approve"
                                      ? "Approving…"
                                      : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateJobStatus(job.id, "reject")
                                  }
                                  style={{
                                    ...homeSecondaryButton,
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    borderColor: "rgba(173,67,67,.28)",
                                    color: "#8a2f2f",
                                    opacity: isRejected || isBusy ? 0.6 : 1,
                                    cursor:
                                      isRejected || isBusy
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                  disabled={isRejected || isBusy}
                                >
                                  {isRejected
                                    ? "Rejected"
                                    : isBusy &&
                                        busyJobAction?.action === "reject"
                                      ? "Rejecting…"
                                      : "Reject"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : tab === "contacts" ? (
          <section style={homeCardStyle}>
            <h2
              style={{ marginTop: 0, marginBottom: 12, color: homeTheme.text }}
            >
              Contact inquiries
            </h2>

            {contactState === "loading" ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                Loading contact inquiries…
              </div>
            ) : contactState === "not_configured" ? (
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${homeTheme.border}`,
                  padding: 14,
                  backgroundColor: "#fff",
                  color: homeTheme.muted,
                  fontWeight: 700,
                  lineHeight: 1.6,
                }}
              >
                {contactError}
              </div>
            ) : contactState === "error" ? (
              <div style={{ color: "#8a2f2f", fontWeight: 700 }}>
                {contactError || "Could not load contact inquiries."}
              </div>
            ) : contactInquiries.length === 0 ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                No contact inquiries have been received yet.
              </div>
            ) : (
              <>
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 14,
                    color: homeTheme.muted,
                    fontWeight: 700,
                  }}
                >
                  Source table: <strong>{contactSource}</strong>
                </p>
                <div style={tableWrap}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "rgba(0,0,0,.03)" }}>
                        <th style={thTdCommon}>Name</th>
                        <th style={thTdCommon}>Email</th>
                        <th style={thTdCommon}>Subject</th>
                        <th style={thTdCommon}>Message Preview</th>
                        <th style={thTdCommon}>Date Received</th>
                        <th style={thTdCommon}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contactInquiries.map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td style={thTdCommon}>{inquiry.name || "—"}</td>
                          <td style={thTdCommon}>{inquiry.email || "—"}</td>
                          <td style={thTdCommon}>{inquiry.subject || "—"}</td>
                          <td
                            style={{
                              ...thTdCommon,
                              whiteSpace: "normal",
                              minWidth: 280,
                            }}
                          >
                            {(inquiry.message ?? "").trim().slice(0, 130) ||
                              "—"}
                          </td>
                          <td style={thTdCommon}>
                            {formatDate(inquiry.created_at)}
                          </td>
                          <td style={thTdCommon}>
                            {inquiry.status ?? (inquiry.is_read ? "read" : "new")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ) : (
          <section style={homeCardStyle}>
            <h2
              style={{ marginTop: 0, marginBottom: 12, color: homeTheme.text }}
            >
              Admin Management
            </h2>
            <p
              style={{
                marginTop: 0,
                marginBottom: 14,
                color: homeTheme.muted,
                fontWeight: 700,
              }}
            >
              Existing admins can add future admins without changing code or
              environment variables. Emails are trimmed and lowercased before
              saving.
            </p>

            <form
              onSubmit={addAdminUser}
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <input
                type="email"
                value={newAdminEmail}
                onChange={(event) => setNewAdminEmail(event.target.value)}
                placeholder="new-admin@example.com"
                id="new-admin-email"
                aria-label="New admin email"
                aria-describedby={adminUsersError ? "admin-users-error" : adminAddMessage ? "admin-add-message" : undefined}
                style={{
                  flex: "1 1 280px",
                  border: `1px solid ${homeTheme.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  color: homeTheme.text,
                  backgroundColor: "#fff",
                }}
              />
              <button
                type="submit"
                style={homePrimaryButton}
                disabled={adminAddState === "saving"}
              >
                {adminAddState === "saving" ? "Adding…" : "Add Admin"}
              </button>
            </form>

            {adminUsersError && (
              <div
                id="admin-users-error"
                role="alert"
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(173,67,67,.24)",
                  color: "#8a2f2f",
                  backgroundColor: "rgba(173,67,67,.08)",
                  fontWeight: 700,
                }}
              >
                {adminUsersError}
              </div>
            )}

            {adminAddMessage && (
              <div
                id="admin-add-message"
                role="status"
                aria-live="polite"
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(53,128,110,.24)",
                  color: homeTheme.green,
                  backgroundColor: "rgba(53,128,110,.08)",
                  fontWeight: 700,
                }}
              >
                {adminAddMessage}
              </div>
            )}

            {adminUsersState === "loading" ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                Loading admins…
              </div>
            ) : adminUsers.length === 0 ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                No admins found.
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "rgba(0,0,0,.03)" }}>
                      <th style={thTdCommon}>Email</th>
                      <th style={thTdCommon}>Source</th>
                      <th style={thTdCommon}>Added By</th>
                      <th style={thTdCommon}>Added Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((adminUser) => (
                      <tr key={`${adminUser.source}-${adminUser.email}`}>
                        <td style={thTdCommon}>{adminUser.email}</td>
                        <td style={thTdCommon}>
                          {adminUser.source === "bootstrap"
                            ? "Bootstrap allowlist"
                            : "Admin table"}
                        </td>
                        <td style={thTdCommon}>
                          {adminUser.created_by_email || "—"}
                        </td>
                        <td style={thTdCommon}>
                          {adminUser.created_at
                            ? formatDate(adminUser.created_at)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
      {previewJob && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 40,
          }}
          onClick={() => setPreviewJob(null)}
        >
          <div
            style={{
              ...homeCardStyle,
              width: "min(780px, 100%)",
              maxHeight: "86vh",
              overflow: "auto",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, color: homeTheme.green, fontSize: 28 }}>
                {previewJob.title || "Untitled job"}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewJob(null)}
                style={homeSecondaryButton}
              >
                Close
              </button>
            </div>
            <p
              style={{
                marginTop: 8,
                marginBottom: 4,
                color: homeTheme.text,
                fontWeight: 800,
              }}
            >
              {(previewJob.restaurant_name ?? "").trim() ||
                "Unknown restaurant"}{" "}
              •{" "}
              {[previewJob.city, previewJob.state].filter(Boolean).join(", ") ||
                "No location provided"}
            </p>
            <p
              style={{
                marginTop: 0,
                marginBottom: 12,
                color: homeTheme.muted,
                fontWeight: 700,
              }}
            >
              Submitted {formatDate(previewJob.created_at)} •{" "}
              <span style={statusPillStyle(getAdminReadableStatus(previewJob))}>
                {getAdminReadableStatus(previewJob)}
              </span>
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
              <div>
                <strong>Employment Type:</strong>{" "}
                {previewJob.employment_type || "—"}
              </div>
              <div>
                <strong>Pay Range:</strong> {previewJob.pay_range || "—"}
              </div>
              <div>
                <strong>Apply Contact:</strong> {previewJob.apply_email || "—"}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ margin: "0 0 6px" }}>Description</h4>
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  color: homeTheme.text,
                }}
              >
                {(previewJob.description ?? "").trim() ||
                  "No description provided."}
              </p>
            </div>
            <div>
              <h4 style={{ margin: "0 0 6px" }}>How to apply</h4>
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  color: homeTheme.text,
                }}
              >
                {(previewJob.how_to_apply ?? "").trim() ||
                  "No application instructions provided."}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

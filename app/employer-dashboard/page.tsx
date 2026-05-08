"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";
import {
  canEmployerPauseResume,
  dashboardStatusForJob,
  getEmployerPauseResumeUpdate,
  isMissingViewsColumnError,
} from "../../lib/jobStatus";

type EmployerOwner = { userId: string; email: string };
type OwnershipMatch = "employer_user_id" | "employer_email";

type DashboardJob = {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  active: boolean;
  status?: string | null;
  employer_user_id: string | null;
  employer_email: string | null;
  ownership_match: OwnershipMatch | null;
  created_at: string;
  views: number;
  dashboard_status: "Active" | "Pending" | "Draft" | "Paused" | "Rejected";
};

type JobsQueryVariant = {
  fields: string;
  includesStatus: boolean;
  includesViews: boolean;
};

type JobsQueryResult = {
  liveJobs: Array<Record<string, unknown>> | null;
  selectedVariant: JobsQueryVariant | null;
  error: { code?: string; message?: string } | null;
};

type SupabaseActionError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const isDevelopment = process.env.NODE_ENV !== "production";

const PAUSE_RESUME_RETURN_FIELDS = "id,active,status,employer_user_id,employer_email";

function formatSupabaseActionError(error: SupabaseActionError) {
  const parts = [
    error.message,
    error.code ? `code: ${error.code}` : null,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

function pauseResumeFailureMessage(fallback: string, error?: SupabaseActionError | null) {
  if (!isDevelopment) return fallback;
  if (!error) return fallback;

  const formattedError = formatSupabaseActionError(error);
  return formattedError ? `${fallback} Supabase error: ${formattedError}` : fallback;
}


const JOB_QUERY_VARIANTS: JobsQueryVariant[] = [
  {
    fields: "id,title,city,state,active,status,created_at,views,employer_user_id,employer_email",
    includesStatus: true,
    includesViews: true,
  },
  {
    fields: "id,title,city,state,active,status,created_at,employer_user_id,employer_email",
    includesStatus: true,
    includesViews: false,
  },
];



function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function getJobOwnershipMatch(job: Record<string, unknown>, owner: EmployerOwner): OwnershipMatch | null {
  const employerUserId = typeof job.employer_user_id === "string" ? job.employer_user_id.trim() : "";
  const employerEmail = typeof job.employer_email === "string" ? job.employer_email.trim() : "";

  if (employerUserId && employerUserId === owner.userId) return "employer_user_id";
  if (employerEmail && employerEmail === owner.email) return "employer_email";

  return null;
}

function hasMissingEmployerOwnership(job: Pick<DashboardJob, "employer_user_id" | "employer_email">) {
  return !job.employer_user_id && !job.employer_email;
}

function statusPillStyle(status: DashboardJob["dashboard_status"]): React.CSSProperties {
  const statusMap: Record<DashboardJob["dashboard_status"], { bg: string; text: string; border: string }> = {
    Active: { bg: "rgba(53,128,110,0.10)", text: "#1d5b4d", border: "rgba(53,128,110,0.24)" },
    Pending: { bg: "rgba(227,160,8,0.12)", text: "#7a5600", border: "rgba(227,160,8,0.28)" },
    Draft: { bg: "rgba(101,115,126,0.12)", text: "#3f4c56", border: "rgba(101,115,126,0.24)" },
    Paused: { bg: "rgba(173,67,67,0.10)", text: "#8a2f2f", border: "rgba(173,67,67,0.24)" },
    Rejected: { bg: "rgba(173,67,67,0.10)", text: "#8a2f2f", border: "rgba(173,67,67,0.24)" },
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
  };
}

export default function EmployerDashboardPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [owner, setOwner] = useState<EmployerOwner | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadEmployerJobs(currentOwner: EmployerOwner): Promise<JobsQueryResult> {
      let liveJobs: Array<Record<string, unknown>> | null = null;
      let error: { code?: string; message?: string } | null = null;
      let selectedVariant: JobsQueryVariant | null = null;

      for (const variant of JOB_QUERY_VARIANTS) {
        const [userIdResult, emailResult] = await Promise.all([
          supabase
            .from("jobs")
            .select(variant.fields)
            .eq("employer_user_id", currentOwner.userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("jobs")
            .select(variant.fields)
            .eq("employer_email", currentOwner.email)
            .order("created_at", { ascending: false }),
        ]);

        const variantError = userIdResult.error ?? emailResult.error;

        if (!variantError) {
          const jobsById = new Map<string, Record<string, unknown>>();

          [...(emailResult.data ?? []), ...(userIdResult.data ?? [])].forEach((job) => {
            const jobRecord = job as unknown as Record<string, unknown>;
            const id = String(jobRecord.id ?? "");
            if (id) {
              jobsById.set(id, jobRecord);
            }
          });

          liveJobs = Array.from(jobsById.values()).sort((a, b) => {
            const aCreated = new Date(String(a.created_at ?? "")).getTime();
            const bCreated = new Date(String(b.created_at ?? "")).getTime();
            return bCreated - aCreated;
          });
          selectedVariant = variant;
          error = null;
          break;
        }

        const missingViews = isMissingViewsColumnError(variantError);
        if (missingViews) {
          error = variantError;
          continue;
        }

        error = variantError;
        break;
      }

      return { liveJobs, selectedVariant, error };
    }

    async function loadDashboard() {
      const { data, error: authError } = await supabase.auth.getUser();
      const authUser = data?.user;

      if (authError || !authUser) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard")}`);
        return;
      }

      const email = authUser.email?.trim();
      const userId = authUser.id;

      if (!email || !userId) {
        if (mounted) {
          setJobs([]);
          setOwner(null);
          setAuthStatus("allowed");
          setActionError("Your employer session is missing account ownership details. Please sign out and sign back in.");
        }
        return;
      }

      const currentOwner = { userId, email };
      setActionError(null);

      const jobsResult = await loadEmployerJobs(currentOwner);

      if (jobsResult.error || !jobsResult.liveJobs || !jobsResult.selectedVariant) {
        if (mounted) {
          setJobs([]);
          setOwner(currentOwner);
          setAuthStatus("allowed");
          setActionError(jobsResult.error?.message || "Could not load your employer listings from Supabase.");
        }
        return;
      }

      const hydratedJobs: DashboardJob[] = jobsResult.liveJobs.map((job) => {
        const status = jobsResult.selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null;
        const active = Boolean(job.active);
        const employerUserId = typeof job.employer_user_id === "string" && job.employer_user_id.trim() ? job.employer_user_id.trim() : null;
        const employerEmail = typeof job.employer_email === "string" && job.employer_email.trim() ? job.employer_email.trim() : null;

        return {
          id: String(job.id ?? ""),
          title: String(job.title ?? ""),
          city: typeof job.city === "string" ? job.city : null,
          state: typeof job.state === "string" ? job.state : null,
          active,
          status,
          employer_user_id: employerUserId,
          employer_email: employerEmail,
          ownership_match: getJobOwnershipMatch(job, currentOwner),
          created_at: String(job.created_at ?? ""),
          views:
            jobsResult.selectedVariant?.includesViews && typeof job.views === "number" && Number.isFinite(job.views)
              ? job.views
              : 0,
          dashboard_status: dashboardStatusForJob(status, active),
        };
      });

      if (mounted) {
        setJobs(hydratedJobs);
        setOwner(currentOwner);
        setAuthStatus("allowed");
      }
    }

    loadDashboard();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadDashboard();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function handlePauseToggle(job: DashboardJob) {
    if (busyJobId) return;
    if (!canEmployerPauseResume(job.status)) return;

    const { nextActive, nextStatus } = getEmployerPauseResumeUpdate(job.status, job.active);
    setBusyJobId(job.id);
    setActionError(null);

    const { data, error: authError } = await supabase.auth.getUser();
    const authUser = data?.user;
    const sessionOwner = authUser?.id && authUser.email?.trim() ? { userId: authUser.id, email: authUser.email.trim() } : null;
    const currentOwner = sessionOwner ?? owner;

    if (authError || !currentOwner) {
      setActionError("We could not update this job because the employer session is unavailable. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    if (hasMissingEmployerOwnership(job)) {
      setActionError(
        "This job is missing employer ownership details (employer_user_id and employer_email), so it cannot be paused or resumed until it is reassigned to your employer account."
      );
      setBusyJobId(null);
      return;
    }

    const matchedOwnership = getJobOwnershipMatch(job, currentOwner);

    if (!matchedOwnership) {
      setActionError(
        "This job is linked to a different employer account than your current session. Please refresh or sign in with the employer account that owns this listing."
      );
      setBusyJobId(null);
      return;
    }

    const updatePayload = { active: nextActive, status: nextStatus };
    const updateAttempts: OwnershipMatch[] = [
      matchedOwnership,
      ...(matchedOwnership === "employer_user_id" ? ["employer_email" as const] : ["employer_user_id" as const]),
    ];
    let updateError: SupabaseActionError | null = null;
    let updatedJob: Pick<DashboardJob, "active" | "status" | "employer_user_id" | "employer_email"> | null = null;
    let matchedBy: OwnershipMatch | null = null;

    for (const ownershipField of updateAttempts) {
      const ownerValue = ownershipField === "employer_user_id" ? currentOwner.userId : currentOwner.email;
      const result = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", job.id)
        .eq(ownershipField, ownerValue)
        .select(PAUSE_RESUME_RETURN_FIELDS)
        .maybeSingle();

      if (result.error) {
        updateError = result.error;
        continue;
      }

      if (result.data) {
        updatedJob = {
          active: Boolean(result.data.active),
          status: typeof result.data.status === "string" ? result.data.status : null,
          employer_user_id:
            typeof result.data.employer_user_id === "string" && result.data.employer_user_id.trim()
              ? result.data.employer_user_id.trim()
              : null,
          employer_email:
            typeof result.data.employer_email === "string" && result.data.employer_email.trim()
              ? result.data.employer_email.trim()
              : null,
        };
        matchedBy = ownershipField;
        break;
      }
    }

    if (updateError && !updatedJob) {
      setActionError(
        pauseResumeFailureMessage("We could not save this job status. Please refresh and try again.", updateError)
      );
      setBusyJobId(null);
      return;
    }

    if (!updatedJob) {
      setActionError(
        pauseResumeFailureMessage(
          "This job still appears linked to your employer account, but Supabase did not update the row. Please refresh and try again.",
          {
            message:
              "No row was returned by the authenticated update. This usually means the jobs UPDATE RLS policy blocked the row or the ownership filter did not match at write time.",
          }
        )
      );
      setBusyJobId(null);
      return;
    }

    setOwner(currentOwner);
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              active: updatedJob.active,
              status: updatedJob.status,
              employer_user_id: updatedJob.employer_user_id,
              employer_email: updatedJob.employer_email,
              ownership_match: matchedBy ?? item.ownership_match,
              dashboard_status: dashboardStatusForJob(updatedJob.status, updatedJob.active),
            }
          : item
      )
    );
    setBusyJobId(null);
  }

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => job.dashboard_status === "Active").length;
    const pending = jobs.filter((job) => job.dashboard_status === "Pending").length;
    const drafts = jobs.filter((job) => job.dashboard_status === "Draft").length;
    const totalViews = jobs.reduce((sum, job) => sum + job.views, 0);

    return [
      { label: "Active Jobs", value: active },
      { label: "Pending Review", value: pending },
      { label: "Drafts", value: drafts },
      { label: "Total Views", value: totalViews },
    ];
  }, [jobs]);

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
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px" }}>
          Loading employer dashboard…
        </div>
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
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 18px" }}>

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
              fontSize: 40,
              lineHeight: 1.1,
              fontFamily: "var(--font-heading)",
              color: homeTheme.green,
            }}
          >
            Employer Dashboard
          </h1>
          <p
            style={{
              marginBottom: 0,
              color: homeTheme.muted,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
            }}
          >
            Manage your job listings, monitor status, and keep your restaurant hiring pipeline moving.
          </p>
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
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.green,
                  fontSize: 34,
                  lineHeight: 1,
                }}
              >
                {metric.value}
              </p>
            </article>
          ))}
        </section>

        <section style={homeCardStyle}>
          <div className="rn-dashboard-header-row">
            <div>
              <h2
                style={{
                  margin: 0,
                  color: homeTheme.text,
                  fontSize: 26,
                  fontFamily: "var(--font-heading)",
                  lineHeight: 1.2,
                }}
              >
                Job Listings
              </h2>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  color: homeTheme.muted,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                Showing your current posted jobs.
              </p>
              <p className="rn-dashboard-rejected-note">
                If your job ad was rejected, please contact{" "}
                <a href="mailto:team@restaurantsnowhiring.com">team@restaurantsnowhiring.com</a> or use the{" "}
                <Link href="/contact">Contact page</Link> for additional information.
              </p>
            </div>
            <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
              Post New Job
            </Link>
          </div>

          {actionError ? (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(173,67,67,0.28)",
                backgroundColor: "rgba(173,67,67,0.08)",
                color: "#8a2f2f",
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                padding: "12px 14px",
              }}
            >
              {actionError}
            </div>
          ) : null}

          {jobs.length === 0 ? (
            <div
              style={{
                marginTop: 16,
                borderRadius: 16,
                border: `1px dashed ${homeTheme.border}`,
                padding: 24,
                textAlign: "center",
                backgroundColor: "rgba(255,255,255,.6)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                No jobs yet
              </h3>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 600 }}>
                You have not posted any jobs yet. Start your first listing to begin receiving applicants.
              </p>
              <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
                Create Your First Job
              </Link>
            </div>
          ) : (
            <>
              <div className="rn-dashboard-table-wrap">
                <table className="rn-dashboard-table">
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Date Posted</th>
                      <th>Views</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.title}</td>
                        <td>
                          <span style={statusPillStyle(job.dashboard_status)}>{job.dashboard_status}</span>
                        </td>
                        <td>{[job.city, job.state].filter(Boolean).join(", ") || "—"}</td>
                        <td>{formatDate(job.created_at)}</td>
                        <td>{job.views}</td>
                        <td>
                          <div className="rn-dashboard-actions">
                            <Link
                              href={`/jobs/${job.id}`}
                              prefetch={false}
                              style={homeSecondaryButton}
                              className="rn-btn-secondary"
                            >
                              View
                            </Link>
                            <Link
                              href={`/employer-dashboard/jobs/${job.id}/edit`}
                              style={homeSecondaryButton}
                              className="rn-btn-secondary"
                            >
                              Edit
                            </Link>
                            {canEmployerPauseResume(job.status) ? (
                              <button
                                type="button"
                                style={homeSecondaryButton}
                                className="rn-btn-secondary"
                                onClick={() => handlePauseToggle(job)}
                                disabled={busyJobId === job.id}
                              >
                                {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rn-dashboard-mobile-list">
                {jobs.map((job) => (
                  <article key={`mobile-${job.id}`} className="rn-dashboard-mobile-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 18, color: homeTheme.text, fontFamily: "var(--font-heading)" }}>
                        {job.title}
                      </h3>
                      <span style={statusPillStyle(job.dashboard_status)}>{job.dashboard_status}</span>
                    </div>
                    <p style={{ margin: "8px 0 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      {[job.city, job.state].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      Posted {formatDate(job.created_at)} • {job.views} views
                    </p>
                    <div className="rn-dashboard-actions" style={{ marginTop: 12 }}>
                      <Link
                        href={`/jobs/${job.id}`}
                        prefetch={false}
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                      >
                        View
                      </Link>
                      <Link
                        href={`/employer-dashboard/jobs/${job.id}/edit`}
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                      >
                        Edit
                      </Link>
                      {canEmployerPauseResume(job.status) ? (
                        <button
                          type="button"
                          style={homeSecondaryButton}
                          className="rn-btn-secondary"
                          onClick={() => handlePauseToggle(job)}
                          disabled={busyJobId === job.id}
                        >
                          {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <style jsx>{`
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
          color: ${homeTheme.green};
          font-weight: 900;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .rn-dashboard-table-wrap {
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          overflow-x: auto;
          overflow-y: hidden;
          background: #fff;
        }

        .rn-dashboard-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 860px;
        }

        .rn-dashboard-table th,
        .rn-dashboard-table td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          text-align: left;
          vertical-align: middle;
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-weight: 700;
          font-size: 14px;
          white-space: nowrap;
        }

        .rn-dashboard-table th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.45px;
          color: ${homeTheme.muted};
        }

        .rn-dashboard-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .rn-dashboard-mobile-list {
          display: none;
          margin-top: 14px;
          gap: 12px;
        }

        .rn-dashboard-mobile-card {
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.92);
        }

        @media (max-width: 980px) {
          .rn-dashboard-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .rn-dashboard-table-wrap {
            display: none;
          }

          .rn-dashboard-mobile-list {
            display: grid;
          }

          .rn-dashboard-metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

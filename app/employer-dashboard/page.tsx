"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type DashboardJob = {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  active: boolean;
  status?: string | null;
  created_at: string;
  views: number;
  dashboard_status: "Active" | "Pending" | "Draft" | "Paused";
};

type JobsQueryVariant = {
  fields: string;
  includesStatus: boolean;
  includesViews: boolean;
};

type DashboardSource = "live" | "mock" | "empty";

const JOB_QUERY_VARIANTS: JobsQueryVariant[] = [
  {
    fields: "id,title,city,state,active,status,created_at,views",
    includesStatus: true,
    includesViews: true,
  },
  {
    fields: "id,title,city,state,active,status,created_at",
    includesStatus: true,
    includesViews: false,
  },
];


const MOCK_JOBS: DashboardJob[] = [
  {
    id: "mock-1",
    title: "Line Cook",
    city: "Austin",
    state: "TX",
    active: true,
    created_at: "2026-02-22T14:14:00.000Z",
    views: 148,
    dashboard_status: "Active",
  },
  {
    id: "mock-2",
    title: "Host",
    city: "Austin",
    state: "TX",
    active: false,
    created_at: "2026-02-18T09:30:00.000Z",
    views: 67,
    dashboard_status: "Pending",
  },
  {
    id: "mock-3",
    title: "Restaurant Manager",
    city: "Round Rock",
    state: "TX",
    active: false,
    created_at: "2026-02-10T17:45:00.000Z",
    views: 0,
    dashboard_status: "Draft",
  },
];


function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function statusPillStyle(status: DashboardJob["dashboard_status"]): React.CSSProperties {
  const statusMap: Record<DashboardJob["dashboard_status"], { bg: string; text: string; border: string }> = {
    Active: { bg: "rgba(53,128,110,0.10)", text: "#1d5b4d", border: "rgba(53,128,110,0.24)" },
    Pending: { bg: "rgba(227,160,8,0.12)", text: "#7a5600", border: "rgba(227,160,8,0.28)" },
    Draft: { bg: "rgba(101,115,126,0.12)", text: "#3f4c56", border: "rgba(101,115,126,0.24)" },
    Paused: { bg: "rgba(173,67,67,0.10)", text: "#8a2f2f", border: "rgba(173,67,67,0.24)" },
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
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [source, setSource] = useState<DashboardSource>("empty");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [jobOwnerFilter, setJobOwnerFilter] = useState<
    { column: "employer_id" | "apply_email"; value: string } | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadEmployerJobs(
      ownerFilter: { column: "employer_id"; value: string } | { column: "apply_email"; value: string }
    ) {
      let liveJobs: Array<Record<string, unknown>> | null = null;
      let error: { code?: string; message?: string } | null = null;
      let selectedVariant: JobsQueryVariant | null = null;

      for (const variant of JOB_QUERY_VARIANTS) {
        const result = await supabase
          .from("jobs")
          .select(variant.fields)
          .eq(ownerFilter.column, ownerFilter.value)
          .order("created_at", { ascending: false });

        if (!result.error) {
          liveJobs = result.data as unknown as Array<Record<string, unknown>>;
          selectedVariant = variant;
          error = null;
          break;
        }

        const missingViews = isMissingViewsColumnError(result.error);
        if (missingViews) {
          error = result.error;
          continue;
        }

        error = result.error;
        break;
      }

      return { liveJobs, selectedVariant, error };
    }

    async function loadDashboard() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        if (mounted) {
          setJobs(MOCK_JOBS);
          setSource("mock");
          setJobOwnerFilter(null);
          setActionError(null);
          setAuthStatus("allowed");
        }
        return;
      }

      const email = session.user.email?.trim();
      const userId = session.user.id;

      if (!email) {
        if (mounted) {
          setJobs([]);
          setSource("empty");
          setJobOwnerFilter(null);
          setAuthStatus("allowed");
          setActionError("Your employer session is missing an email address. Please sign out and sign back in.");
        }
        return;
      }

      setActionError(null);

      const employerIdResult = userId
        ? await loadEmployerJobs({ column: "employer_id", value: userId })
        : { liveJobs: null, selectedVariant: null, error: { message: "Missing employer user id." } };

      const employerIdColumnMissing =
        !!employerIdResult.error?.message &&
        (employerIdResult.error.message.includes("employer_id") ||
          employerIdResult.error.message.includes("Could not find") ||
          employerIdResult.error.message.includes("does not exist"));

      const shouldUseApplyEmailFallback =
        employerIdColumnMissing ||
        !employerIdResult.liveJobs ||
        employerIdResult.liveJobs.length === 0;

      const ownerFilter = shouldUseApplyEmailFallback
        ? ({ column: "apply_email", value: email } as const)
        : ({ column: "employer_id", value: userId } as const);

      const jobsResult = shouldUseApplyEmailFallback
        ? await loadEmployerJobs(ownerFilter)
        : employerIdResult;

      if (jobsResult.error || !jobsResult.liveJobs || !jobsResult.selectedVariant) {
        if (mounted) {
          setJobs([]);
          setSource("empty");
          setJobOwnerFilter(null);
          setAuthStatus("allowed");
          setActionError(jobsResult.error?.message || "Could not load your employer listings from Supabase.");
        }
        return;
      }

      const hydratedJobs: DashboardJob[] = jobsResult.liveJobs.map((job) => ({
        id: String(job.id ?? ""),
        title: String(job.title ?? ""),
        city: typeof job.city === "string" ? job.city : null,
        state: typeof job.state === "string" ? job.state : null,
        active: Boolean(job.active),
        status: jobsResult.selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null,
        created_at: String(job.created_at ?? ""),
        views:
          jobsResult.selectedVariant?.includesViews && typeof job.views === "number" && Number.isFinite(job.views)
            ? job.views
            : 0,
        dashboard_status: dashboardStatusForJob(
          jobsResult.selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null,
          Boolean(job.active)
        ),
      }));

      if (mounted) {
        setJobs(hydratedJobs);
        setJobOwnerFilter(ownerFilter);
        setSource(hydratedJobs.length > 0 ? "live" : "empty");
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
  }, []);

  async function handlePauseToggle(job: DashboardJob) {
    if (busyJobId) return;
    if (!canEmployerPauseResume(job.status)) return;

    const { nextActive, nextStatus } = getEmployerPauseResumeUpdate(job.status, job.active);
    setBusyJobId(job.id);
    setActionError(null);

    if (source !== "live") {
      setJobs((prev) =>
        prev.map((item) =>
          item.id === job.id
            ? {
                ...item,
                active: nextActive,
                status: nextStatus,
                dashboard_status: dashboardStatusForJob(nextStatus, nextActive),
              }
            : item
        )
      );
      setBusyJobId(null);
      return;
    }

    if (!jobOwnerFilter) {
      setActionError("We could not update this job because the employer session is unavailable. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    const { count, error } = await supabase
      .from("jobs")
      .update({ active: nextActive, status: nextStatus }, { count: "exact" })
      .eq("id", job.id)
      .eq(jobOwnerFilter.column, jobOwnerFilter.value);

    if (error) {
      setActionError(error.message || "We could not save this job status. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    if (count === 0) {
      setActionError("We could not find that exact job for your employer account. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              active: nextActive,
              status: nextStatus,
              dashboard_status: dashboardStatusForJob(nextStatus, nextActive),
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

        {source === "mock" ? (
          <section
            style={{
              ...homeCardStyle,
              marginBottom: 16,
              border: "1px solid rgba(227,160,8,0.35)",
              backgroundColor: "rgba(255,248,230,0.9)",
              boxShadow: "none",
            }}
          >
            <p style={{ margin: 0, color: "#7a5600", fontWeight: 800, fontFamily: "var(--font-body)" }}>
              Preview mode: sign in to load real employer listings.
            </p>
          </section>
        ) : null}
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
                {source === "mock"
                  ? "Showing preview dashboard data. Sign in to load real employer listings."
                  : "Showing your current posted jobs."}
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
                            <button
                              type="button"
                              style={homeSecondaryButton}
                              className="rn-btn-secondary"
                              onClick={() => handlePauseToggle(job)}
                              disabled={busyJobId === job.id || !canEmployerPauseResume(job.status)}
                            >
                              {busyJobId === job.id
                                ? "Saving..."
                                : !canEmployerPauseResume(job.status)
                                  ? "Unavailable"
                                : job.dashboard_status === "Paused"
                                  ? "Resume"
                                  : "Pause"}
                            </button>
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
                      <button
                        type="button"
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                        onClick={() => handlePauseToggle(job)}
                        disabled={busyJobId === job.id || !canEmployerPauseResume(job.status)}
                      >
                        {busyJobId === job.id
                          ? "Saving..."
                          : !canEmployerPauseResume(job.status)
                            ? "Unavailable"
                          : job.dashboard_status === "Paused"
                            ? "Resume"
                            : "Pause"}
                      </button>
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

        .rn-dashboard-table-wrap {
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          overflow-x: auto;
          background: #fff;
        }

        .rn-dashboard-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 860px;
        }

        .rn-dashboard-table th,
        .rn-dashboard-table td {
          padding: 14px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          text-align: left;
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

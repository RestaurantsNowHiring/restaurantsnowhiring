"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";
import {
  dashboardStatusForJob,
  isMissingStatusColumnError,
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


function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return createClient(url, key);
}

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
  const [source, setSource] = useState<"live" | "mock" | "empty">("empty");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setJobs(MOCK_JOBS);
          setSource("mock");
          setAuthStatus("allowed");
        }
        return;
      }

      const { data } = await client.auth.getSession();
      const session = data?.session;

      if (!session) {
        if (mounted) {
          setJobs(MOCK_JOBS);
          setSource("mock");
          setAuthStatus("allowed");
        }
        return;
      }

      const email = session.user.email;
      if (!email) {
        if (mounted) {
          setJobs(MOCK_JOBS);
          setSource("mock");
          setAuthStatus("allowed");
        }
        return;
      }

      const variants: JobsQueryVariant[] = [
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
        {
          fields: "id,title,city,state,active,created_at,views",
          includesStatus: false,
          includesViews: true,
        },
        {
          fields: "id,title,city,state,active,created_at",
          includesStatus: false,
          includesViews: false,
        },
      ];

      let liveJobs: Array<Record<string, unknown>> | null = null;
      let error: { code?: string; message?: string } | null = null;
      let selectedVariant: JobsQueryVariant | null = null;

      for (const variant of variants) {
        const result = await client
          .from("jobs")
          .select(variant.fields)
          .eq("apply_email", email)
          .order("created_at", { ascending: false });

        if (!result.error) {
          liveJobs = result.data as Array<Record<string, unknown>>;
          selectedVariant = variant;
          error = null;
          break;
        }

        const missingStatus = isMissingStatusColumnError(result.error);
        const missingViews = isMissingViewsColumnError(result.error);
        if (missingStatus || missingViews) {
          error = result.error;
          continue;
        }

        error = result.error;
        break;
      }

      if (error || !liveJobs || liveJobs.length === 0) {
        if (mounted) {
          setJobs(MOCK_JOBS);
          setSource("mock");
          setAuthStatus("allowed");
        }
        return;
      }

      const hydratedJobs: DashboardJob[] = liveJobs.map((job) => ({
        id: String(job.id ?? ""),
        title: String(job.title ?? ""),
        city: typeof job.city === "string" ? job.city : null,
        state: typeof job.state === "string" ? job.state : null,
        active: Boolean(job.active),
        status: selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null,
        created_at: String(job.created_at ?? ""),
        views:
          selectedVariant?.includesViews && typeof job.views === "number" && Number.isFinite(job.views)
            ? job.views
            : 0,
        dashboard_status: dashboardStatusForJob(
          selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null,
          Boolean(job.active)
        ),
      }));

      if (mounted) {
        setJobs(hydratedJobs);
        setSource("live");
        setAuthStatus("allowed");
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  async function handlePauseToggle(job: DashboardJob) {
    if (busyJobId) return;

    const isPaused = job.dashboard_status === "Paused";
    const nextStatus: DashboardJob["dashboard_status"] = isPaused ? "Active" : "Paused";

    setBusyJobId(job.id);
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              active: !isPaused,
              status: isPaused ? "active" : "paused",
              dashboard_status: nextStatus,
            }
          : item
      )
    );

    if (source === "live") {
      const client = getSupabaseClient();
      if (!client) {
        setBusyJobId(null);
        return;
      }

      const updateWithStatus = await client
        .from("jobs")
        .update({ active: isPaused, status: isPaused ? "active" : "paused" })
        .eq("id", job.id);

      const { error } = isMissingStatusColumnError(updateWithStatus.error)
        ? await client.from("jobs").update({ active: isPaused }).eq("id", job.id)
        : updateWithStatus;

      if (error) {
        setJobs((prev) =>
          prev.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  active: job.active,
                  status: job.status,
                  dashboard_status: job.dashboard_status,
                }
              : item
          )
        );
      }
    }

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
                {source === "live"
                  ? "Showing your current posted jobs."
                  : "Showing placeholder dashboard data until employer-linked listings are available."}
              </p>
            </div>
            <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
              Post New Job
            </Link>
          </div>

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
                              disabled={busyJobId === job.id}
                            >
                              {busyJobId === job.id
                                ? "Saving..."
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
                        disabled={busyJobId === job.id}
                      >
                        {busyJobId === job.id
                          ? "Saving..."
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

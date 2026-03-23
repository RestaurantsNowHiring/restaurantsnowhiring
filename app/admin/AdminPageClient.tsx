"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";
import { dashboardStatusForJob, isMissingStatusColumnError } from "../../lib/jobStatus";

type AdminJob = {
  id: string;
  restaurant_name: string | null;
  apply_email: string | null;
  title: string;
  city: string | null;
  state: string | null;
  active: boolean;
  status: string | null;
  created_at: string;
};

type ContactInquiry = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string;
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

function statusPillStyle(status: "Active" | "Pending" | "Draft" | "Paused") {
  const statusMap: Record<typeof status, { bg: string; text: string; border: string }> = {
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
  } satisfies React.CSSProperties;
}

export default function AdminPageClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"jobs" | "contacts">("jobs");
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [jobsState, setJobsState] = useState<"loading" | "ready" | "error">("loading");
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [statusColumnAvailable, setStatusColumnAvailable] = useState(true);

  const [contactInquiries, setContactInquiries] = useState<ContactInquiry[]>([]);
  const [contactState, setContactState] = useState<"loading" | "ready" | "not_configured" | "error">("loading");
  const [contactSource, setContactSource] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAdminData() {
      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setJobsState("error");
          setJobsError("Supabase environment variables are missing.");
          setContactState("not_configured");
        }
        return;
      }

      const variants: JobsQueryVariant[] = [
        {
          fields: "id,restaurant_name,apply_email,title,city,state,active,status,created_at",
          includesStatus: true,
        },
        {
          fields: "id,restaurant_name,apply_email,title,city,state,active,created_at",
          includesStatus: false,
        },
      ];

      let selectedVariant: JobsQueryVariant | null = null;
      let jobsRows: Array<Record<string, unknown>> | null = null;
      let jobsErr: { message?: string } | null = null;

      for (const variant of variants) {
        const result = await client.from("jobs").select(variant.fields).order("created_at", { ascending: false });

        if (!result.error) {
          selectedVariant = variant;
          jobsRows = result.data as Array<Record<string, unknown>>;
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
          setJobsError(jobsErr?.message ?? "Could not load job submissions for admin review.");
        } else {
          setStatusColumnAvailable(selectedVariant.includesStatus);
          setJobs(
            jobsRows.map((row) => ({
              id: String(row.id ?? ""),
              restaurant_name: typeof row.restaurant_name === "string" ? row.restaurant_name : null,
              apply_email: typeof row.apply_email === "string" ? row.apply_email : null,
              title: String(row.title ?? ""),
              city: typeof row.city === "string" ? row.city : null,
              state: typeof row.state === "string" ? row.state : null,
              active: Boolean(row.active),
              status: selectedVariant.includesStatus && typeof row.status === "string" ? row.status : null,
              created_at: String(row.created_at ?? ""),
            }))
          );
          setJobsState("ready");
          setJobsError(null);
        }
      }

      const contactTables = ["contact_inquiries", "contact_messages", "inquiries"];
      const contactFieldVariants = [
        "id,name,email,subject,message,created_at",
        "id,name,email,message,created_at",
      ];

      let foundContacts = false;

      for (const tableName of contactTables) {
        for (const fields of contactFieldVariants) {
          const result = await client
            .from(tableName)
            .select(fields)
            .order("created_at", { ascending: false })
            .limit(100);

          if (!result.error) {
            if (mounted) {
              setContactInquiries(
                ((result.data as Array<Record<string, unknown>>) ?? []).map((row) => ({
                  id: String(row.id ?? ""),
                  name: typeof row.name === "string" ? row.name : null,
                  email: typeof row.email === "string" ? row.email : null,
                  subject: typeof row.subject === "string" ? row.subject : null,
                  message: typeof row.message === "string" ? row.message : null,
                  created_at: String(row.created_at ?? ""),
                }))
              );
              setContactSource(tableName);
              setContactState("ready");
              setContactError(null);
            }
            foundContacts = true;
            break;
          }
        }

        if (foundContacts) break;
      }

      if (!foundContacts && mounted) {
        setContactInquiries([]);
        setContactSource(null);
        setContactState("not_configured");
        setContactError(
          "No readable contact inquiry table was found. Create one and store submissions from /contact to see entries here."
        );
      }
    }

    loadAdminData();

    return () => {
      mounted = false;
    };
  }, []);

  const employerRows = useMemo(() => {
    const map = new Map<string, { employer: string; email: string; adCount: number; latest: string }>();

    for (const job of jobs) {
      const employerName = (job.restaurant_name ?? "").trim() || "Unknown restaurant";
      const email = (job.apply_email ?? "").trim() || "—";
      const key = `${employerName}::${email}`;

      const existing = map.get(key);
      if (existing) {
        existing.adCount += 1;
        if (new Date(job.created_at).getTime() > new Date(existing.latest).getTime()) {
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

    return Array.from(map.values()).sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime());
  }, [jobs]);

  async function approveJob(jobId: string) {
    if (busyJobId) return;

    const client = getSupabaseClient();
    if (!client) {
      setJobsError("Supabase environment variables are missing.");
      return;
    }

    setBusyJobId(jobId);
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, active: true, status: statusColumnAvailable ? "active" : job.status } : job))
    );

    const payload = statusColumnAvailable ? { active: true, status: "active" } : { active: true };

    const result = await client.from("jobs").update(payload).eq("id", jobId);

    if (result.error) {
      setJobsError(result.error.message || "Approval update failed.");
      setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, active: false } : job)));
    }

    setBusyJobId(null);
  }

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
    boxShadow: active ? "0 12px 24px rgba(53,128,110,.12)" : "0 10px 22px rgba(0,0,0,.08)",
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
                Internal review workspace for submitted job ads and incoming contact inquiries.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/" style={homeSecondaryButton} className="rn-btn-secondary">
                Home
              </Link>
              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
                Employer Dashboard
              </Link>
              <button
                type="button"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
                onClick={async () => {
                  await fetch("/api/admin/session", { method: "DELETE", credentials: "include" });
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
            Access is restricted to approved admins via Supabase auth + server-side allowlist checks.
          </div>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setTab("jobs")} style={tabBtn(tab === "jobs")}>
              Job Approvals
            </button>
            <button type="button" onClick={() => setTab("contacts")} style={tabBtn(tab === "contacts")}>
              Contact Inquiries
            </button>
          </div>
        </section>

        {tab === "jobs" ? (
          <>
            <section style={{ ...homeCardStyle, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, marginBottom: 12, color: homeTheme.text }}>Employers with submitted jobs</h2>

              {jobsState === "loading" ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>Loading employer submissions…</div>
              ) : employerRows.length === 0 ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  No employer submissions found yet. Once employers post jobs, they will show up here.
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
              <h2 style={{ marginTop: 0, marginBottom: 12, color: homeTheme.text }}>Job ad review</h2>
              <p style={{ marginTop: 0, marginBottom: 14, color: homeTheme.muted, fontWeight: 700 }}>
                Approval marks a listing active for the public jobs feed by updating {statusColumnAvailable ? "status = active and active = true" : "active = true"}.
              </p>

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

              {jobsState === "loading" ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>Loading job ads…</div>
              ) : jobs.length === 0 ? (
                <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                  No jobs submitted yet. When employers post jobs, this approval queue will populate.
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
                        <th style={thTdCommon}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => {
                        const readableStatus = dashboardStatusForJob(job.status, job.active);
                        const isApproved = readableStatus === "Active";
                        return (
                          <tr key={job.id}>
                            <td style={thTdCommon}>{(job.restaurant_name ?? "").trim() || "Unknown restaurant"}</td>
                            <td style={thTdCommon}>{job.title || "Untitled job"}</td>
                            <td style={thTdCommon}>{[job.city, job.state].filter(Boolean).join(", ") || "—"}</td>
                            <td style={thTdCommon}>
                              <span style={statusPillStyle(readableStatus)}>{readableStatus}</span>
                            </td>
                            <td style={thTdCommon}>{formatDate(job.created_at)}</td>
                            <td style={thTdCommon}>
                              <button
                                type="button"
                                onClick={() => approveJob(job.id)}
                                style={{
                                  ...homePrimaryButton,
                                  padding: "8px 12px",
                                  fontSize: 12,
                                  opacity: isApproved || busyJobId === job.id ? 0.6 : 1,
                                  cursor: isApproved || busyJobId === job.id ? "not-allowed" : "pointer",
                                }}
                                disabled={isApproved || busyJobId === job.id}
                              >
                                {isApproved ? "Approved" : busyJobId === job.id ? "Approving…" : "Approve"}
                              </button>
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
        ) : (
          <section style={homeCardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: 12, color: homeTheme.text }}>Contact inquiries</h2>

            {contactState === "loading" ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>Loading contact inquiries…</div>
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
              <div style={{ color: "#8a2f2f", fontWeight: 700 }}>{contactError || "Could not load contact inquiries."}</div>
            ) : contactInquiries.length === 0 ? (
              <div style={{ color: homeTheme.muted, fontWeight: 700 }}>
                No contact inquiries have been received yet.
              </div>
            ) : (
              <>
                <p style={{ marginTop: 0, marginBottom: 14, color: homeTheme.muted, fontWeight: 700 }}>
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
                      </tr>
                    </thead>
                    <tbody>
                      {contactInquiries.map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td style={thTdCommon}>{inquiry.name || "—"}</td>
                          <td style={thTdCommon}>{inquiry.email || "—"}</td>
                          <td style={thTdCommon}>{inquiry.subject || "—"}</td>
                          <td style={{ ...thTdCommon, whiteSpace: "normal", minWidth: 280 }}>
                            {(inquiry.message ?? "").trim().slice(0, 130) || "—"}
                          </td>
                          <td style={thTdCommon}>{formatDate(inquiry.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

import Link from "next/link";
import { headers } from "next/headers";
import { supabase } from "../../../lib/supabase";
import {
  isMissingStatusColumnError,
  isMissingViewsColumnError,
  isPubliclyVisibleJob,
} from "../../../lib/jobStatus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  description: string | null;
  created_at: string;
  active: boolean;
  status?: string | null;
  pay_range: string | null;
  employment_type: string | null;
  address: string | null;
  how_to_apply: string | null;
  company_website?: string | null;
  role_category?: string | null;
  views?: number | null;
};

export default async function JobDetailsPage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;

  const queryVariants = [
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: true,
      includesViews: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: true,
      includesViews: false,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: false,
      includesViews: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: false,
      includesViews: false,
    },
  ] as const;

  let data: Array<Record<string, unknown>> | null = null;
  let error: { code?: string; message?: string } | null = null;
  let missingStatus = false;
  let missingViews = false;

  if (id) {
    for (const variant of queryVariants) {
      const result = await supabase
        .from("jobs")
        .select(variant.fields)
        .eq("id", id)
        .limit(1);

      if (!result.error) {
        data = result.data as Array<Record<string, unknown>>;
        error = null;
        missingStatus = !variant.includesStatus;
        missingViews = !variant.includesViews;
        break;
      }

      const statusMissing = isMissingStatusColumnError(result.error);
      const viewsMissing = isMissingViewsColumnError(result.error);
      if (statusMissing || viewsMissing) {
        missingStatus = missingStatus || statusMissing;
        missingViews = missingViews || viewsMissing;
        error = result.error;
        continue;
      }

      error = result.error;
      break;
    }
  }

  let job: Job | undefined = (data?.[0] as Job | undefined) ?? undefined;

  const notFound = !id || !!error || !job || !isPubliclyVisibleJob(job.status, job.active);

  if (!notFound && !missingViews && job) {
    const requestHeaders = await headers();
    const referer = requestHeaders.get("referer") ?? "";
    const fromEmployerDashboard = referer.includes("/employer-dashboard");

    if (!fromEmployerDashboard) {
      const currentViews = typeof job.views === "number" && Number.isFinite(job.views) ? job.views : 0;
      const { data: updatedViewData, error: updateViewsError } = await supabase
        .from("jobs")
        .update({ views: currentViews + 1 })
        .eq("id", job.id)
        .select("views")
        .limit(1);

      if (isMissingViewsColumnError(updateViewsError)) {
        missingViews = true;
      }

      const updatedViews = updatedViewData?.[0]?.views;
      if (typeof updatedViews === "number" && Number.isFinite(updatedViews)) {
        job = { ...job, views: updatedViews };
      }
    }
  }

  const locationText =
    job?.city && job?.state ? `${job.city}, ${job.state}` : "";

  const postedText = job?.created_at
    ? new Date(job.created_at).toLocaleDateString()
    : "";

  const BRAND = "#35806e";
  const INK = "rgba(0,0,0,0.82)";
  const MUTED = "rgba(0,0,0,0.62)";

  const websiteDisplay = job?.company_website
    ? job.company_website.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";

  const safeWebsiteHref =
    job?.company_website && job.company_website.trim()
      ? job.company_website.startsWith("http://") ||
        job.company_website.startsWith("https://")
        ? job.company_website
        : `https://${job.company_website}`
      : "";

  const badgeBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 38,
    padding: "0 16px",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    border: `2px solid ${BRAND}`,
    color: BRAND,
    fontSize: 14,
    fontWeight: 900,
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(0,0,0,.08)",
    letterSpacing: 0.2,
  };

  const badgeEmphasis: React.CSSProperties = {
    ...badgeBase,
    backgroundColor: BRAND,
    color: "#ffffff",
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
  };

  // ✅ clickable look (no JS). Hover handled in globals.css via className
  const websiteBadge: React.CSSProperties = {
    ...badgeBase,
    textDecoration: "none",
    cursor: "pointer",
    position: "relative",
    paddingRight: 38, // room for ↗
    outline: "none",
  };

  const websiteArrow: React.CSSProperties = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: BRAND,
    color: "#ffffff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
  };

  const buttonPrimary: React.CSSProperties = {
    backgroundColor: BRAND,
    color: "#ffffff",
    padding: "10px 18px",
    fontWeight: 800,
    borderRadius: 12,
    textDecoration: "none",
    fontSize: 16,
    fontFamily: "var(--font-body)",
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
    whiteSpace: "nowrap",
    border: "1px solid rgba(0,0,0,0.08)",
  };

  const buttonSecondary: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.03)",
    color: "rgba(0,0,0,0.72)",
    padding: "10px 18px",
    fontWeight: 800,
    borderRadius: 12,
    textDecoration: "none",
    fontSize: 16,
    fontFamily: "var(--font-body)",
    border: "1px solid rgba(0,0,0,0.12)",
    whiteSpace: "nowrap",
  };

  return (
    <main
      style={{
        backgroundColor: "#ffffff",
        minHeight: "100vh",
        paddingTop: 70,
        paddingBottom: 70,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginTop: 6,
          }}
        >
          <div style={{ minWidth: 260, flex: "1 1 520px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 56,
                fontWeight: 800,
                color: BRAND,
                lineHeight: 1.05,
                fontFamily: "var(--font-heading)",
                letterSpacing: -0.3,
              }}
            >
              {notFound ? "Job Details" : job.title}
            </h1>

            <div style={{ marginTop: 10, color: INK, fontWeight: 800 }}>
              {notFound
                ? "This job may be inactive, removed, or the link is incorrect."
                : `${job.restaurant_name} — ${locationText}`}
            </div>

            {!notFound && (
              <div style={{ marginTop: 6, color: MUTED, fontWeight: 700 }}>
                Posted: {postedText}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/jobs" style={buttonPrimary}>
              Back to Jobs
            </Link>
            <Link href="/" style={buttonSecondary}>
              Home
            </Link>
          </div>
        </div>

        {/* Body card */}
        <div
          style={{
            marginTop: 22,
            backgroundColor: "rgba(0,0,0,0.02)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 16px 40px rgba(0,0,0,0.10)",
          }}
        >
          {notFound ? (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                padding: 18,
                border: "1px solid rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18, color: INK }}>
                Job not found
              </div>

              <div style={{ marginTop: 10, color: MUTED, fontWeight: 700 }}>
                This job may be inactive, removed, or the link is incorrect.
              </div>

              <div style={{ marginTop: 14, color: MUTED, fontWeight: 700 }}>
                Debug: ID ={" "}
                <span style={{ fontFamily: "monospace" }}>{String(id)}</span>
              </div>

              {error ? (
                <div style={{ marginTop: 10, color: MUTED, fontWeight: 700 }}>
                  Supabase error:{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    {error.message}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* Badges row */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "10px 10px 16px",
                }}
              >
                {job.pay_range && <span style={badgeEmphasis}>{job.pay_range}</span>}

                {job.employment_type && (
                  <span style={badgeBase}>{job.employment_type}</span>
                )}

                {job.role_category && (
                  <span style={badgeBase}>{job.role_category}</span>
                )}

                {websiteDisplay && safeWebsiteHref && (
                  <a
                    href={safeWebsiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={websiteBadge}
                    className="rnhr-clickable-badge"
                    title={safeWebsiteHref}
                  >
                    {websiteDisplay}
                    <span style={websiteArrow}>↗</span>
                  </a>
                )}
              </div>

              {/* Info row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <InfoCard label="Company" value={job.restaurant_name} />
                <InfoCard label="Location" value={locationText || "Not listed"} />
                <InfoCard label="Address" value={job.address || "Not listed"} />
              </div>

              {/* Description */}
              <SectionCard title="Description">
                <div
                  style={{
                    color: INK,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    fontWeight: 650,
                    fontSize: 16,
                  }}
                >
                  {job.description || "No description provided."}
                </div>
              </SectionCard>

              {/* How to Apply */}
              <SectionCard title="How to Apply">
                <div
                  style={{
                    color: INK,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    fontWeight: 650,
                    fontSize: 16,
                  }}
                >
                  {job.how_to_apply || "Not listed yet."}
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,0.58)",
          fontSize: 12,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontWeight: 900,
          color: "rgba(0,0,0,0.82)",
          fontSize: 18,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 16,
        padding: 18,
        backgroundColor: "#ffffff",
        marginBottom: 14,
        boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,0.86)",
          fontSize: 20,
          fontFamily: "var(--font-body)",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

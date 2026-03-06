import Link from "next/link";
import { supabase } from "../../../../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../../../../styles/homepageDesignSystem";

type JobRecord = {
  id: string;
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  role_category: string | null;
  employment_type: string | null;
  pay_range: string | null;
  active: boolean;
  created_at: string;
};

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

export default async function EmployerJobEditPage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const jobId = resolvedParams?.id;

  const { data, error } = jobId
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,role_category,employment_type,pay_range,active,created_at"
        )
        .eq("id", jobId)
        .limit(1)
    : { data: null, error: null };

  const job = (data?.[0] as JobRecord | undefined) ?? undefined;
  const notFound = !jobId || !!error || !job;

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
            Safe first step: this page confirms the selected job and prepares the structure for full field editing next.
          </p>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          {notFound ? (
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
                We could not load this listing. It may have been removed or the link is incorrect.
              </p>
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
                <ul style={{ margin: 0, paddingLeft: 18, color: homeTheme.muted, fontWeight: 600 }}>
                  <li>Status: {job.active ? "Active" : "Pending / Inactive"}</li>
                  <li>Role category: {job.role_category || "Not set"}</li>
                  <li>Employment type: {job.employment_type || "Not set"}</li>
                  <li>Pay range: {job.pay_range || "Not set"}</li>
                  <li>Posted: {formatDate(job.created_at)}</li>
                </ul>
              </div>

              <div
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  border: "1px solid rgba(227,160,8,0.35)",
                  backgroundColor: "rgba(255,248,230,0.9)",
                  padding: 12,
                }}
              >
                <p style={{ margin: 0, color: "#7a5600", fontWeight: 800 }}>
                  Editing fields is coming next. This placeholder keeps Edit functional and scoped while full update form wiring is added safely.
                </p>
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
    </main>
  );
}

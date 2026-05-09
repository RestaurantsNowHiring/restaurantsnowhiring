import Link from "next/link";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at?: string;
  pay_range?: string | null;
  employment_type?: string | null;
  role_category?: string | null;
};

const GREEN = "#35806e";

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 26,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,.10)",
  backgroundColor: "rgba(255,255,255,0.70)",
  color: "rgba(0,0,0,.72)",
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export default function LatestJobsPanel({ jobs }: { jobs: Job[] }) {
  return (
    <div
      style={{
        backgroundColor: "#f6f5f3",
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 18,
        padding: "22px 22px 26px",
        boxShadow: "0 18px 40px rgba(0,0,0,.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: GREEN,
            fontFamily: "var(--font-heading)",
            whiteSpace: "nowrap",
          }}
        >
          Newest Job Listings
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
      </div>

      <div style={{ marginBottom: 12, color: GREEN, fontWeight: 800 }}>
        Showing {jobs.length} newest job{jobs.length === 1 ? "" : "s"}
      </div>

      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 18,
          maxHeight: "min(460px, 55vh)",
          overflowY: "auto",
          overflowX: "hidden",
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      >
        {jobs.length === 0 ? (
          <div style={{ padding: 16, color: "rgba(0, 0, 0, 0.75)", fontWeight: 800 }}>
            No jobs are available yet.
          </div>
        ) : (
          jobs.map((job, idx) => {
            const pay = (job.pay_range ?? "").trim();
            const type = (job.employment_type ?? "").trim();
            const cat = (job.role_category ?? "").trim();

            return (
              <div
                key={job.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "14px 14px",
                  backgroundColor:
                    idx % 2 === 0 ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.05)",
                  borderTop: idx === 0 ? "none" : "1px solid rgba(0, 0, 0, 0.18)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/jobs/${job.id}`}
                    style={{
                      display: "inline-block",
                      fontWeight: 900,
                      color: "#111",
                      fontSize: 18,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {job.title}
                  </Link>

                  <div style={{ opacity: 0.85, color: "rgba(0,0,0,.75)", marginTop: 4 }}>
                    {job.restaurant_name} — {job.city}, {job.state}
                  </div>

                  {(pay || type || cat) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {pay && <span style={chipStyle}>{pay}</span>}
                      {type && <span style={chipStyle}>{type}</span>}
                      {cat && <span style={chipStyle}>{cat}</span>}
                    </div>
                  )}
                </div>

                <Link
                  href={`/jobs/${job.id}`}
                  className="rn-btn-view"
                  style={{
                    backgroundColor: GREEN,
                    color: "#fef5ea",
                    padding: "10px 18px",
                    borderRadius: 18,
                    fontWeight: 700,
                    textDecoration: "none",
                    boxShadow: "0 10px 22px rgba(0,0,0,.16)",
                    whiteSpace: "nowrap",
                  }}
                >
                  View →
                </Link>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <Link
          href="/jobs"
          style={{
            color: "rgba(0,0,0,.85)",
            textDecoration: "none",
            fontWeight: 700,
            borderBottom: "1px solid rgba(0,0,0,.35)",
            paddingBottom: 2,
          }}
        >
          View all jobs
        </Link>
      </div>
    </div>
  );
}

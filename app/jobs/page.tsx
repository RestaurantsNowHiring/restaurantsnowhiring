import Link from "next/link";
import { supabase } from "../../lib/supabase";
import JobsFilterPanel from "../components/JobsFilterPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
  active: boolean;
  role_category: string | null;
};

type SearchParamsShape = { [key: string]: string | string[] | undefined };

export default async function JobsPage({
  searchParams,
}: {
  // ✅ In your Next.js version, searchParams can be a Promise
  searchParams?: Promise<SearchParamsShape> | SearchParamsShape;
}) {
  // ✅ unwrap safely
  const resolvedSearchParams = await Promise.resolve(searchParams);

  // ✅ /jobs?role=Line&role=Prep -> ["Line", "Prep"]
  const raw = resolvedSearchParams?.role;

  const rolesArray: string[] = Array.isArray(raw)
    ? raw.map((v) => decodeURIComponent(String(v))).filter(Boolean)
    : raw
    ? [decodeURIComponent(String(raw))]
    : [];

  // ✅ Build query
  let query = supabase
    .from("jobs")
    .select("id,title,restaurant_name,city,state,created_at,active,role_category")
    .eq("active", true)
    .order("created_at", { ascending: false });

  // ✅ Filter in the DB by role_category
  if (rolesArray.length > 0) {
    query = query.in("role_category", rolesArray);
  }

  const { data: jobs, error } = await query;
  const activeJobs: Job[] = (jobs ?? []) as Job[];

  return (
    <main
      style={{
        backgroundColor: "#eae7e2",
        minHeight: "100vh",
        // ✅ TopBanner is fixed height 50, give a little breathing room
        paddingTop: 70,
        paddingBottom: 64,
      }}
    >
      {/* PAGE HEADER (no hero image) */}
      <section style={{ width: "100vw", padding: "18px 0 14px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 54,
              fontWeight: 900,
              color: "#35806e",
              lineHeight: 1.05,
              fontFamily: "var(--font-coldsmith)",
              letterSpacing: 1,
              textTransform: "uppercase",
              textShadow: "0px 4px 12px rgba(0, 0, 0, 0.29)",
            }}
          >
            {rolesArray.length
              ? `${rolesArray.join(" / ").toUpperCase()} JOBS`
              : "BROWSE JOBS"}
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 760,
              color: "#000000ff",
              lineHeight: 1.6,
              fontSize: 16,
            }}
          >
            {rolesArray.length
              ? `Showing only Role Category: ${rolesArray.join(", ")}`
              : "Filter by location, position, or search keywords. Click a job to view details."}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link
              href="/post-job"
              className="hero-button"
              style={{
                backgroundColor: "#35806e",
                color: "#fef5ea",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 2,
                textDecoration: "none",
                fontSize: 18,
                fontFamily: "var(--font-coldsmith)",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              POST A JOB
            </Link>

            <Link
              href="/"
              className="hero-button"
              style={{
                backgroundColor: "#35806e",
                color: "#fef5ea",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 2,
                textDecoration: "none",
                fontSize: 18,
                fontFamily: "var(--font-coldsmith)",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              HOMEPAGE
            </Link>

            {rolesArray.length > 0 && (
              <Link
                href="/jobs"
                className="hero-button"
                style={{
                  backgroundColor: "#35806e",
                  border: "2px solid #000000",
                  color: "#fef5ea",
                  padding: "10px 20px",
                  fontWeight: 800,
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: 18,
                  fontFamily: "var(--font-coldsmith)",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                VIEW ALL JOBS
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ width: "100vw", padding: "18px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          {error ? (
            <div
              style={{
                backgroundColor: "#fef5ea",
                borderRadius: 10,
                padding: 18,
                fontWeight: 800,
                color: "rgba(0,0,0,.75)",
                border: "1px solid rgba(0,0,0,.12)",
              }}
            >
              Could not load jobs yet: {error.message}
            </div>
          ) : (
            <JobsFilterPanel jobs={activeJobs} initialRoleCategories={rolesArray} />
          )}
        </div>
      </section>
    </main>
  );
}

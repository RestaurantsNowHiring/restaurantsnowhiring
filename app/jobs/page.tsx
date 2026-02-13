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

export default async function JobsPage({
  searchParams,
}: {
  // ✅ In your Next.js version, searchParams can be a Promise
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}) {
  // ✅ unwrap it safely
  const resolvedSearchParams = await Promise.resolve(searchParams);

  // ✅ /jobs?role=Line&role=Prep  -> ["Line","Prep"]
  const raw = resolvedSearchParams?.role;

  const rolesArray: string[] = Array.isArray(raw)
    ? raw.map((v) => decodeURIComponent(String(v))).filter(Boolean)
    : raw
    ? [decodeURIComponent(String(raw))]
    : [];

  // ✅ DEBUG (optional — safe here)
  console.log("DEBUG resolvedSearchParams:", resolvedSearchParams);
  console.log("DEBUG raw role param:", raw);
  console.log("DEBUG rolesArray:", rolesArray);

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
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* HERO (FIXED) */}
      <section
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: 350,
          zIndex: 50,
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.55) 25%, rgba(0,0,0,.15) 45%, rgba(0,0,0,0) 70%)",
          }}
        />

        <div
          style={{
            position: "relative",
            height: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "42px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 65,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.05,
              fontFamily: "var(--font-coldsmith)",
              letterSpacing: 1,
              textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
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
              maxWidth: 700,
              color: "rgba(255,255,255,.9)",
              lineHeight: 1.6,
              fontSize: 16,
            }}
          >
            {rolesArray.length
              ? `Showing only Role Category: ${rolesArray.join(", ")}`
              : "Filter by location, position, or search keywords. Click a job to view details."}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <Link
              href="/post-job"
              className="hero-button"
              style={{
                backgroundColor: "#000000",
                border: "2px solid #000000",
                color: "#ffffff",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 20,
                fontFamily: "var(--font-coldsmith)",
              }}
            >
              POST A JOB
            </Link>

            <Link
              href="/"
              className="hero-button"
              style={{
                backgroundColor: "#000000",
                border: "2px solid #000000",
                color: "#ffffff",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 20,
                fontFamily: "var(--font-coldsmith)",
              }}
            >
              HOMEPAGE
            </Link>

            {rolesArray.length > 0 && (
              <Link
                href="/jobs"
                className="hero-button"
                style={{
                  backgroundColor: "#000000",
                  border: "2px solid #000000",
                  color: "#ffffff",
                  padding: "10px 20px",
                  fontWeight: 800,
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: 20,
                  fontFamily: "var(--font-coldsmith)",
                }}
              >
                VIEW ALL JOBS
              </Link>
            )}
          </div>
        </div>
      </section>

      <div style={{ height: 350 }} />

      {/* BACKGROUND */}
      <div
        style={{
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          width: "100%",
          minHeight: "100vh",
        }}
      >
        <div style={{ backgroundColor: "rgba(0, 0, 0, 0)", width: "100%" }}>
          <section style={{ width: "100vw", padding: "34px 0 64px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              {error ? (
                <div
                  style={{
                    backgroundColor: "#ffffffc0",
                    borderRadius: 10,
                    padding: 18,
                    fontWeight: 800,
                    color: "rgba(0,0,0,.75)",
                  }}
                >
                  Could not load jobs yet: {error.message}
                </div>
              ) : (
                <JobsFilterPanel jobs={activeJobs} initialRoleCategories={rolesArray} />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

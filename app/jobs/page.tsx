import type { Metadata } from "next";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "../../lib/jobStatus";
import JobsFilterPanel from "../components/JobsFilterPanel";
import {
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";
import { buildPageMetadata } from "../../lib/seo";
import { buildUniqueJobSlugMap } from "../../lib/jobSlugs";
import {
  getStateLandingPageByCode,
  MIN_JOBS_FOR_STATE_PAGE,
} from "../../lib/stateLandingPages";

type JobsSearchParamsShape = { [key: string]: string | string[] | undefined };

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<JobsSearchParamsShape> | JobsSearchParamsShape;
}): Promise<Metadata> {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const hasFilters = Object.keys(resolvedSearchParams ?? {}).length > 0;

  return buildPageMetadata({
    title: "Browse Restaurant Jobs Hiring Now",
    description:
      "Search restaurant jobs hiring now by role, location, and employment type on RestaurantsNowHiring.com.",
    path: "/jobs",
    robots: hasFilters
      ? {
          index: false,
          follow: true,
          googleBot: { index: false, follow: true },
        }
      : undefined,
  });
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  country?: string | null;
  created_at: string;
  approved_at?: string | null;
  expires_at?: string | null;
  active: boolean;
  status?: string | null;
  role_category: string | null;

  // ✅ Added for quick info chips
  pay_range: string | null;
  employment_type: string | null;
};

type SearchParamsShape = JobsSearchParamsShape;

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape> | SearchParamsShape;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const requestedState = Array.isArray(resolvedSearchParams?.state)
    ? resolvedSearchParams.state[0]
    : resolvedSearchParams?.state;
  const requestedCity = Array.isArray(resolvedSearchParams?.city)
    ? resolvedSearchParams.city[0]
    : resolvedSearchParams?.city;
  const initialLocationText = [requestedCity, requestedState]
    .map((value) => (value ? decodeURIComponent(String(value)).trim() : ""))
    .filter(Boolean)
    .join(", ");

  const raw = resolvedSearchParams?.role;

  const rolesArray: string[] = Array.isArray(raw)
    ? raw.map((v) => decodeURIComponent(String(v))).filter(Boolean)
    : raw
    ? [decodeURIComponent(String(raw))]
    : [];

  // ✅ Build query (added pay_range + employment_type)
  let query = supabase
    .from("jobs")
    .select(
      "id,title,restaurant_name,city,state,country,created_at,approved_at,expires_at,active,status,role_category,pay_range,employment_type"
    )
    .order("created_at", { ascending: false });

  if (rolesArray.length > 0) {
    query = query.in("role_category", rolesArray);
  }

  const initialResult = await query;

  const { data: jobs, error } = isMissingStatusColumnError(initialResult.error)
    ? await (rolesArray.length > 0
        ? supabase
            .from("jobs")
            .select(
              "id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,role_category,pay_range,employment_type"
            )
            .eq("active", true)
            .in("role_category", rolesArray)
            .order("created_at", { ascending: false })
        : supabase
            .from("jobs")
            .select(
              "id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,role_category,pay_range,employment_type"
            )
            .eq("active", true)
            .order("created_at", { ascending: false }))
    : initialResult;

  const activeJobs: Job[] = ((jobs ?? []) as Job[]).filter((job) =>
    isPubliclyVisibleJob(job.status, job.active)
  );

  const allJobsForSlugsResult = rolesArray.length
    ? await supabase
        .from("jobs")
        .select("id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,status,role_category,pay_range,employment_type")
        .order("created_at", { ascending: false })
    : { data: activeJobs, error: null };

  const allJobsForSlugsFallback = isMissingStatusColumnError(allJobsForSlugsResult.error)
    ? await supabase
        .from("jobs")
        .select("id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,role_category,pay_range,employment_type")
        .eq("active", true)
        .order("created_at", { ascending: false })
    : allJobsForSlugsResult;

  const visibleJobsForSlugs = ((allJobsForSlugsFallback.data ?? []) as Job[]).filter((job) =>
    isPubliclyVisibleJob(job.status, job.active)
  );
  const slugById = buildUniqueJobSlugMap(visibleJobsForSlugs);
  const jobsWithSlugs = activeJobs.map((job) => ({
    ...job,
    slug: slugById.get(job.id) ?? job.id,
  }));

  const stateCounts = new Map<string, number>();
  for (const job of visibleJobsForSlugs) {
    if (!isPubliclyVisibleJob(job.status, job.active)) continue;

    const code = job.state?.trim().toUpperCase();
    if (!code || !getStateLandingPageByCode(code)) continue;

    stateCounts.set(code, (stateCounts.get(code) ?? 0) + 1);
  }
  const liveStateLinks = Array.from(stateCounts.entries())
    .filter(([, count]) => count >= MIN_JOBS_FOR_STATE_PAGE)
    .map(([code, count]) => ({ state: getStateLandingPageByCode(code), count }))
    .filter((entry): entry is { state: NonNullable<ReturnType<typeof getStateLandingPageByCode>>; count: number } =>
      Boolean(entry.state),
    )
    .sort((a, b) => a.state.name.localeCompare(b.state.name));

  return (
    <main
      style={{
        backgroundColor: homeTheme.bg,
        minHeight: "100vh",
        paddingTop: 90,
        paddingBottom: 64,
      }}
    >
      <section style={{ width: "100%", padding: "18px 0 14px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 54,
              fontWeight: 700,
              color: homeTheme.green,
              lineHeight: 1.05,
              fontFamily: "var(--font-heading)",
              letterSpacing: 0,
            }}
          >
            {rolesArray.length
              ? `${rolesArray.join(" / ").toUpperCase()} JOBS`
              : "Browse Jobs"}
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 760,
              color: "rgba(0,0,0,.70)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
            }}
          >
            {rolesArray.length
              ? `Showing only Role Category: ${rolesArray.join(", ")}`
              : "Filter by location, position, or search keywords. Click a job to view details."}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link
              href="/post-job"
              className="hero-button rn-btn-primary"
              style={{
                ...homePrimaryButton,
              }}
            >
              Post a Job
            </Link>

            <Link
              href="/"
              className="hero-button rn-btn-secondary"
              style={{
                ...homeSecondaryButton,
              }}
            >
              Home
            </Link>

            {rolesArray.length > 0 && (
              <Link
                href="/jobs"
                className="hero-button rn-btn-secondary"
                style={{
                  ...homeSecondaryButton,
                }}
              >
                View all Jobs
              </Link>
            )}
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "18px 0 0" }}>
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
            <JobsFilterPanel
              jobs={jobsWithSlugs}
              initialRoleCategories={rolesArray}
              initialLocationText={initialLocationText}
            />
          )}
        </div>
      </section>

      {liveStateLinks.length > 0 && (
        <section style={{ width: "100%", padding: "26px 0 0" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
            <div
              style={{
                backgroundColor: "#f6f5f3",
                border: "1px solid rgba(0,0,0,.10)",
                borderRadius: 18,
                padding: 22,
                boxShadow: "0 18px 40px rgba(0,0,0,.10)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: homeTheme.green,
                  fontFamily: "var(--font-heading)",
                  fontSize: 34,
                }}
              >
                Browse restaurant jobs by state
              </h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                {liveStateLinks.map(({ state, count }) => (
                  <Link
                    key={state.code}
                    href={`/${state.slug}`}
                    style={{
                      border: "1px solid rgba(0,0,0,.12)",
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,.76)",
                      color: homeTheme.green,
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: 900,
                      padding: "9px 12px",
                      textDecoration: "none",
                    }}
                  >
                    {state.name} ({count})
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

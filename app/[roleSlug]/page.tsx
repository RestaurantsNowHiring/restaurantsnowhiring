import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JobsFilterPanel from "../components/JobsFilterPanel";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";
import { isMissingStatusColumnError, isNonExpiredPublicJob, isPubliclyVisibleJob } from "../../lib/jobStatus";
import { buildUniqueJobSlugMap } from "../../lib/jobSlugs";
import {
  getRestaurantRolePage,
  restaurantRolePages,
  type RestaurantRolePage,
} from "../../lib/restaurantRolePages";
import { absoluteUrl, buildPageMetadata, noIndexRobots } from "../../lib/seo";
import { supabase } from "../../lib/supabase";
import {
  getStateLandingPageBySlug,
  MIN_JOBS_FOR_STATE_PAGE,
  stateLandingPages,
  type StateLandingPage,
} from "../../lib/stateLandingPages";

type RoleRouteParams = { roleSlug?: string };

type RoleJob = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
  approved_at?: string | null;
  expires_at?: string | null;
  active: boolean;
  status?: string | null;
  role_category: string | null;
  pay_range: string | null;
  employment_type: string | null;
};

const JOB_SELECT = "id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,status,role_category,pay_range,employment_type";
const JOB_SELECT_WITHOUT_STATUS = "id,title,restaurant_name,city,state,created_at,approved_at,expires_at,active,role_category,pay_range,employment_type";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...restaurantRolePages.map((role) => ({ roleSlug: role.slug })),
    ...stateLandingPages.map((state) => ({ roleSlug: state.slug })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: RoleRouteParams | Promise<RoleRouteParams>;
}): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
  const state = getStateLandingPageBySlug(resolvedParams.roleSlug);

  if (state) {
    const { jobs } = await fetchVisibleJobs();
    const stateJobs = getLiveStateJobs(jobs, state);

    return buildPageMetadata({
      title: `Restaurant Jobs in ${state.name} | Restaurants Now Hiring`,
      description: `Browse restaurant jobs in ${state.name} including cashier, server, line cook, dishwasher, prep cook, shift leader, and restaurant manager openings.`,
      path: `/${state.slug}`,
      robots: stateJobs.length >= MIN_JOBS_FOR_STATE_PAGE ? undefined : noIndexRobots,
      absoluteTitle: true,
    });
  }

  const role = getRestaurantRolePage(resolvedParams.roleSlug);

  if (!role) {
    return buildPageMetadata({
      title: "Restaurant Jobs Hiring Now",
      description: "Browse active restaurant jobs hiring now on RestaurantsNowHiring.com.",
      path: "/jobs",
    });
  }

  return buildPageMetadata({
    title: role.metaTitle,
    description: role.metaDescription,
    path: `/${role.slug}`,
  });
}

async function fetchVisibleJobs() {
  const initialResult = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .order("created_at", { ascending: false })
    .limit(5000);

  const result = isMissingStatusColumnError(initialResult.error)
    ? await supabase
        .from("jobs")
        .select(JOB_SELECT_WITHOUT_STATUS)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5000)
    : initialResult;

  return {
    error: result.error,
    jobs: ((result.data ?? []) as RoleJob[]).filter((job) =>
      isPubliclyVisibleJob(job.status, job.active)
    ),
  };
}

function normalizeSearchValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function jobMatchesRole(job: RoleJob, role: RestaurantRolePage) {
  const category = normalizeSearchValue(job.role_category);
  const title = normalizeSearchValue(job.title);
  const categoryMatches = role.roleCategories.some(
    (roleCategory) => category === roleCategory.toLowerCase()
  );
  const titleMatches = role.titleKeywords.some((keyword) => title.includes(keyword.toLowerCase()));

  return categoryMatches || titleMatches;
}

function getLiveStateJobs(jobs: RoleJob[], state: StateLandingPage) {
  return jobs.filter(
    (job) =>
      job.state?.trim().toUpperCase() === state.code &&
      isNonExpiredPublicJob(job),
  );
}

type StateCitySummary = {
  name: string;
  count: number;
};

function getStateCities(jobs: RoleJob[]): StateCitySummary[] {
  const cityCounts = new Map<string, StateCitySummary>();

  for (const job of jobs) {
    const cityName = job.city?.trim();

    if (!cityName) {
      continue;
    }

    const cityKey = cityName.toLowerCase();
    const existingCity = cityCounts.get(cityKey);

    if (existingCity) {
      existingCity.count += 1;
    } else {
      cityCounts.set(cityKey, { name: cityName, count: 1 });
    }
  }

  return Array.from(cityCounts.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.name.localeCompare(b.name);
  });
}

const roleLinks = [
  { label: "Cashier Jobs", href: "/cashier-jobs" },
  { label: "Server Jobs", href: "/server-jobs" },
  { label: "Dishwasher Jobs", href: "/dishwasher-jobs" },
  { label: "Line Cook Jobs", href: "/line-cook-jobs" },
  { label: "Prep Cook Jobs", href: "/prep-cook-jobs" },
  { label: "Restaurant Manager Jobs", href: "/restaurant-manager-jobs" },
  { label: "Shift Leader Jobs", href: "/shift-leader-jobs" },
];

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildRolePageSchema(role: RestaurantRolePage, jobs: Array<RoleJob & { slug: string }>) {
  const pageUrl = absoluteUrl(`/${role.slug}`);

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: role.metaTitle,
      description: role.metaDescription,
      isPartOf: {
        "@type": "WebSite",
        name: "Restaurants Now Hiring",
        url: absoluteUrl("/"),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: role.pluralLabel,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${pageUrl}#jobs`,
      name: role.pluralLabel,
      numberOfItems: jobs.length,
      itemListElement: jobs.slice(0, 50).map((job, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/jobs/${job.slug}`),
        name: `${job.title} at ${job.restaurant_name}`,
      })),
    },
  ];
}

function StateLandingPageContent({
  state,
  jobs,
}: {
  state: StateLandingPage;
  jobs: Array<RoleJob & { slug: string }>;
}) {
  const cities = getStateCities(jobs);
  const visibleCities = cities.slice(0, 12);
  const hasMoreCities = cities.length > visibleCities.length;
  const companyCount = new Set(
    jobs
      .map((job) => job.restaurant_name?.trim().toLowerCase())
      .filter((company): company is string => Boolean(company)),
  ).size;
  const jobsPreview = jobs.slice(0, 6);
  const stateJobsHref = `/jobs?state=${encodeURIComponent(state.code)}`;

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
          <p
            style={{
              margin: "0 0 10px",
              color: "rgba(0,0,0,.58)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Restaurant jobs by state
          </p>
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
            Restaurant Jobs in {state.name}
          </h1>
          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              maxWidth: 860,
              color: "rgba(0,0,0,.70)",
              lineHeight: 1.65,
              fontSize: 16,
              fontFamily: "var(--font-body)",
              fontWeight: 650,
            }}
          >
            Explore current restaurant hiring across {state.name}, with fresh openings from local restaurants,
            hospitality groups, and quick-service teams. Use this page to scan statewide demand, jump into busy
            hiring cities, or browse the latest roles near you.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link href={stateJobsHref} className="hero-button rn-btn-primary" style={homePrimaryButton}>
              Browse {state.name} Jobs
            </Link>
            <Link href="/post-job" className="hero-button rn-btn-secondary" style={homeSecondaryButton}>
              Post a Job
            </Link>
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "8px 0 10px" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 18px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          {[
            { value: jobs.length, label: "Active Jobs" },
            { value: cities.length, label: "Cities Hiring" },
            { value: companyCount, label: "Restaurant Companies" },
          ].map((stat) => (
            <div key={stat.label} style={{ ...homeCardStyle, padding: "18px 20px", boxShadow: "0 12px 28px rgba(0,0,0,.09)" }}>
              <p
                style={{
                  margin: 0,
                  color: homeTheme.green,
                  fontFamily: "var(--font-heading)",
                  fontSize: 34,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "rgba(0,0,0,.66)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ width: "100%", padding: "18px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <div style={{ ...homeCardStyle, padding: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    color: homeTheme.green,
                    fontFamily: "var(--font-heading)",
                    fontSize: 38,
                    lineHeight: 1.1,
                  }}
                >
                  Current openings in {state.name}
                </h2>
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "rgba(0,0,0,.66)",
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.55,
                  }}
                >
                  Browse recent restaurant job openings across {state.name}.
                </p>
              </div>
              <Link href={stateJobsHref} className="hero-button rn-btn-secondary" style={homeSecondaryButton}>
                View all {state.name} jobs
              </Link>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {jobsPreview.map((job) => {
                const details = [job.employment_type, job.pay_range].filter(Boolean).join(" • ");

                return (
                  <article
                    key={job.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 14,
                      alignItems: "center",
                      backgroundColor: "#fff",
                      border: "1px solid rgba(0,0,0,.10)",
                      borderRadius: 16,
                      padding: 16,
                      boxShadow: "0 10px 24px rgba(0,0,0,.06)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          margin: 0,
                          color: "rgba(0,0,0,.84)",
                          fontFamily: "var(--font-heading)",
                          fontSize: 24,
                          lineHeight: 1.12,
                        }}
                      >
                        {job.title}
                      </h3>
                      <p
                        style={{
                          margin: "6px 0 0",
                          color: homeTheme.green,
                          fontFamily: "var(--font-body)",
                          fontSize: 15,
                          fontWeight: 900,
                        }}
                      >
                        {job.restaurant_name}
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          color: "rgba(0,0,0,.64)",
                          fontFamily: "var(--font-body)",
                          fontSize: 14,
                          fontWeight: 750,
                        }}
                      >
                        {job.city}, {job.state}
                        {details ? ` • ${details}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/jobs/${job.slug}`}
                      className="hero-button rn-btn-primary"
                      style={{ ...homePrimaryButton, padding: "10px 14px", borderRadius: 12 }}
                    >
                      View Job
                    </Link>
                  </article>
                );
              })}
            </div>

            <div style={{ marginTop: 18 }}>
              <Link href={stateJobsHref} className="hero-button rn-btn-primary" style={homePrimaryButton}>
                View all {state.name} jobs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "26px 0 0" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 18px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          <div style={{ ...homeCardStyle, padding: 22 }}>
            <h2 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 34 }}>
              Browse by role
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
                columnGap: 24,
                rowGap: 0,
                marginTop: 12,
              }}
            >
              {roleLinks.map((role) => (
                <Link
                  key={role.href}
                  href={role.href}
                  style={{
                    borderBottom: "1px solid rgba(53,128,110,.14)",
                    color: homeTheme.green,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    fontWeight: 900,
                    padding: "9px 0",
                    textDecoration: "none",
                  }}
                >
                  <span>{role.label}</span>
                  <span aria-hidden="true" style={{ color: "rgba(53,128,110,.72)", fontWeight: 900 }}>
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div style={{ ...homeCardStyle, padding: 22 }}>
            <h2 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 34 }}>
              Browse by city
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                color: "rgba(0,0,0,.62)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 750,
                lineHeight: 1.45,
              }}
            >
              Top cities by active restaurant job count.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
                columnGap: 18,
                rowGap: 0,
                marginTop: 10,
              }}
            >
              {visibleCities.map((city) => (
                <Link
                  key={city.name.toLowerCase()}
                  href={`/jobs?state=${encodeURIComponent(state.code)}&city=${encodeURIComponent(city.name)}`}
                  style={{
                    borderBottom: "1px solid rgba(0,0,0,.10)",
                    color: homeTheme.green,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 900,
                    padding: "9px 0",
                    textDecoration: "none",
                  }}
                >
                  <span>{city.name}</span>
                  <span style={{ color: "rgba(0,0,0,.54)", fontSize: 13, fontWeight: 850 }}>
                    {city.count} {city.count === 1 ? "job" : "jobs"}
                  </span>
                </Link>
              ))}
            </div>
            {hasMoreCities ? (
              <p
                style={{
                  margin: "12px 0 0",
                  color: "rgba(0,0,0,.58)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 750,
                  lineHeight: 1.45,
                }}
              >
                Showing the top {visibleCities.length} of {cities.length} cities with active jobs.
              </p>
            ) : null}
            <div style={{ marginTop: 14 }}>
              <Link
                href={stateJobsHref}
                className="hero-button rn-btn-secondary"
                style={{ ...homeSecondaryButton, padding: "10px 14px", borderRadius: 12 }}
              >
                View all {state.name} jobs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "26px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <div style={{ ...homeCardStyle, backgroundColor: "#fef5ea", padding: 24 }}>
            <h2 style={{ margin: 0, color: homeTheme.green, fontFamily: "var(--font-heading)", fontSize: 34 }}>
              About restaurant jobs in {state.name}
            </h2>
            <p style={{ color: "rgba(0,0,0,.72)", fontWeight: 700, lineHeight: 1.65 }}>
              Restaurants in {state.name} hire for a wide range of roles, from cashier and server positions to cooks,
              dishwashers, shift leaders, and managers. RestaurantsNowHiring helps job seekers find local restaurant
              openings and connect directly with employers across {state.name}.
            </p>
            <div
              style={{
                marginTop: 18,
                padding: 22,
                borderRadius: 18,
                backgroundColor: "rgba(53,128,110,.11)",
                border: "1px solid rgba(53,128,110,.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div style={{ maxWidth: 760 }}>
                <h3 style={{ margin: 0, color: homeTheme.green, fontSize: 24 }}>
                  Hiring restaurant workers in {state.name}?
                </h3>
                <p style={{ margin: "8px 0 0", color: "rgba(0,0,0,.72)", fontWeight: 700, lineHeight: 1.6 }}>
                  Post your restaurant job and reach local candidates looking for restaurant work in {state.name}.
                  Pricing is $9 per active approved public job ad every 30 days after the free trial.
                </p>
              </div>
              <Link href="/post-job" className="hero-button rn-btn-primary" style={homePrimaryButton}>
                Post a Job
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function RoleLandingPage({
  params,
}: {
  params: RoleRouteParams | Promise<RoleRouteParams>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const state = getStateLandingPageBySlug(resolvedParams.roleSlug);

  if (state) {
    const { jobs: visibleJobs } = await fetchVisibleJobs();
    const stateJobs = getLiveStateJobs(visibleJobs, state);

    if (stateJobs.length < MIN_JOBS_FOR_STATE_PAGE) notFound();

    const slugById = buildUniqueJobSlugMap(visibleJobs);
    const jobsWithSlugs = stateJobs.map((job) => ({
      ...job,
      slug: slugById.get(job.id) ?? job.id,
    }));

    return <StateLandingPageContent state={state} jobs={jobsWithSlugs} />;
  }

  const role = getRestaurantRolePage(resolvedParams.roleSlug);

  if (!role) notFound();

  const { jobs: visibleJobs, error } = await fetchVisibleJobs();
  const slugById = buildUniqueJobSlugMap(visibleJobs);
  const jobsWithSlugs = visibleJobs
    .filter((job) => jobMatchesRole(job, role))
    .map((job) => ({
      ...job,
      slug: slugById.get(job.id) ?? job.id,
    }));
  const relatedRoles = role.relatedSlugs
    .map((slug) => getRestaurantRolePage(slug))
    .filter((relatedRole): relatedRole is RestaurantRolePage => Boolean(relatedRole));
  const jsonLd = buildRolePageSchema(role, jobsWithSlugs);

  return (
    <main
      style={{
        backgroundColor: homeTheme.bg,
        minHeight: "100vh",
        paddingTop: 90,
        paddingBottom: 64,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <section style={{ width: "100%", padding: "18px 0 14px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <p
            style={{
              margin: "0 0 10px",
              color: "rgba(0,0,0,.58)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Restaurant role openings
          </p>

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
            {role.headline}
          </h1>

          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              maxWidth: 820,
              color: "rgba(0,0,0,.70)",
              lineHeight: 1.65,
              fontSize: 16,
              fontFamily: "var(--font-body)",
              fontWeight: 650,
            }}
          >
            {role.intro}
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link href="/post-job" className="hero-button rn-btn-primary" style={homePrimaryButton}>
              Post a Job
            </Link>
            <Link href="/jobs" className="hero-button rn-btn-secondary" style={homeSecondaryButton}>
              View All Jobs
            </Link>
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "12px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 18,
            }}
            aria-label="Related restaurant role pages"
          >
            <span
              style={{
                color: "rgba(0,0,0,.62)",
                fontFamily: "var(--font-body)",
                fontWeight: 900,
              }}
            >
              Explore related roles:
            </span>
            {relatedRoles.map((relatedRole) => (
              <Link
                key={relatedRole.slug}
                href={`/${relatedRole.slug}`}
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
                {relatedRole.pluralLabel}
              </Link>
            ))}
          </div>

          {jobsWithSlugs.length === 0 && !error && (
            <div
              style={{
                backgroundColor: "#fef5ea",
                borderRadius: 18,
                padding: 18,
                fontWeight: 800,
                color: "rgba(0,0,0,.75)",
                border: "1px solid rgba(0,0,0,.12)",
                boxShadow: "0 12px 28px rgba(0,0,0,.08)",
                marginBottom: 18,
              }}
            >
              {role.noJobsMessage} You can also browse all current restaurant openings or check related
              role pages above.
            </div>
          )}

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
              Could not load {role.pluralLabel.toLowerCase()} yet: {error.message}
            </div>
          ) : (
            <JobsFilterPanel jobs={jobsWithSlugs} initialRoleCategories={role.roleCategories} />
          )}
        </div>
      </section>
    </main>
  );
}

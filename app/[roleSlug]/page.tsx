import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JobsFilterPanel from "../components/JobsFilterPanel";
import { homePrimaryButton, homeSecondaryButton, homeTheme } from "../styles/homepageDesignSystem";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "../../lib/jobStatus";
import { buildUniqueJobSlugMap } from "../../lib/jobSlugs";
import {
  getRestaurantRolePage,
  restaurantRolePages,
  type RestaurantRolePage,
} from "../../lib/restaurantRolePages";
import { absoluteUrl, buildPageMetadata } from "../../lib/seo";
import { supabase } from "../../lib/supabase";

type RoleRouteParams = { roleSlug?: string };

type RoleJob = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
  active: boolean;
  status?: string | null;
  role_category: string | null;
  pay_range: string | null;
  employment_type: string | null;
};

const JOB_SELECT = "id,title,restaurant_name,city,state,created_at,active,status,role_category,pay_range,employment_type";
const JOB_SELECT_WITHOUT_STATUS = "id,title,restaurant_name,city,state,created_at,active,role_category,pay_range,employment_type";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamicParams = false;

export function generateStaticParams() {
  return restaurantRolePages.map((role) => ({ roleSlug: role.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: RoleRouteParams | Promise<RoleRouteParams>;
}): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
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

export default async function RoleLandingPage({
  params,
}: {
  params: RoleRouteParams | Promise<RoleRouteParams>;
}) {
  const resolvedParams = await Promise.resolve(params);
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

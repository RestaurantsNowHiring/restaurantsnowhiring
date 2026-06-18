import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import JobsFilterPanel from "../../components/JobsFilterPanel";
import {
  getCompanyName,
  getCompanyProfile,
  getPublicJobs,
  makeCompanySlug,
} from "../../../lib/companyPages";
import { buildUniqueJobSlugMap } from "../../../lib/jobSlugs";
import { buildPageMetadata } from "../../../lib/seo";
import { homeTheme } from "../../styles/homepageDesignSystem";

type CompanyPageParams = {
  companySlug: string;
};

function getBenefitsList(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function generateMetadata({
  params,
}: {
  params: CompanyPageParams | Promise<CompanyPageParams>;
}): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
  const companySlug = resolvedParams.companySlug;

  const jobs = await getPublicJobs();

  const companyJobs = jobs.filter(
    (job: any) =>
      makeCompanySlug(getCompanyName(job.restaurant_name)) === companySlug
  );

  if (companyJobs.length === 0) {
    return buildPageMetadata({
      title: "Restaurant Jobs | Restaurants Now Hiring",
      description: "Browse restaurant jobs hiring now.",
      path: `/companies/${companySlug}`,
    });
  }

  const companyName = getCompanyName(companyJobs[0].restaurant_name);
  const profile = await getCompanyProfile(companyName);

  return buildPageMetadata({
    title: `${companyName} Jobs | Restaurants Now Hiring`,
    description:
      profile?.company_short_description ||
      profile?.company_description ||
      `Browse restaurant jobs at ${companyName}, including hourly and management positions.`,
    path: `/companies/${companySlug}`,
  });
}

export default async function CompanyPage({
  params,
}: {
  params: CompanyPageParams | Promise<CompanyPageParams>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const companySlug = resolvedParams.companySlug;

  const jobs = await getPublicJobs();

  const companyJobs = jobs.filter(
    (job: any) =>
      makeCompanySlug(getCompanyName(job.restaurant_name)) === companySlug
  );

  if (companyJobs.length === 0) {
    notFound();
  }

  const companyName = getCompanyName(companyJobs[0].restaurant_name);
  const profile = await getCompanyProfile(companyName);
  const benefits = getBenefitsList(profile?.benefits_list);

  const slugById = buildUniqueJobSlugMap(companyJobs);

  const jobsWithSlugs = companyJobs.map((job: any) => ({
    ...job,
    slug: slugById.get(job.id) ?? job.id,
  }));

  const uniqueLocations = new Set(
    companyJobs
      .map((job: any) => [job.city, job.state].filter(Boolean).join(", "))
      .filter(Boolean)
  );

  const logoInitials = companyName
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const locationCount = profile?.location_count ?? uniqueLocations.size;

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
          <Link
            href="/companies"
            style={{
              color: homeTheme.green,
              textDecoration: "none",
              fontWeight: 900,
              fontFamily: "var(--font-body)",
            }}
          >
            ← All Companies
          </Link>

          <div
            style={{
              marginTop: 24,
              backgroundColor: "#f6f5f3",
              border: "1px solid rgba(0,0,0,.10)",
              borderRadius: 22,
              padding: 26,
              boxShadow: "0 18px 40px rgba(0,0,0,.10)",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 22,
              alignItems: "start",
            }}
          >
            <div
              style={{
                width: 92,
                height: 92,
                borderRadius: 22,
                backgroundColor: "#ffffff",
                border: "1px solid rgba(0,0,0,.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                color: homeTheme.green,
                fontFamily: "var(--font-heading)",
                fontSize: 34,
                fontWeight: 900,
                boxShadow: "0 10px 24px rgba(0,0,0,.08)",
              }}
            >
              {profile?.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.company_logo_url}
                  alt={`${companyName} logo`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    padding: 12,
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                logoInitials
              )}
            </div>

            <div>
              <p
                style={{
                  color: homeTheme.green,
                  fontWeight: 900,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Company Profile
              </p>

              <h1
                style={{
                  margin: "8px 0 0",
                  fontSize: 54,
                  fontWeight: 700,
                  color: homeTheme.green,
                  lineHeight: 1.05,
                  fontFamily: "var(--font-heading)",
                }}
              >
                {companyName}
              </h1>

              {profile?.company_short_description ? (
                <p
                  style={{
                    marginTop: 12,
                    maxWidth: 760,
                    color: "rgba(0,0,0,.72)",
                    lineHeight: 1.6,
                    fontSize: 17,
                    fontFamily: "var(--font-body)",
                    fontWeight: 650,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {profile.company_short_description}
                </p>
              ) : null}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 18,
                }}
              >
                <ProfileStat label="Open jobs" value={companyJobs.length} />
                <ProfileStat label="Locations" value={locationCount || "—"} />
                <ProfileStat
                  label="Headquarters"
                  value={profile?.headquarters || "Not listed"}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 18,
                }}
              >
                {profile?.company_website ? (
                  <a
                    href={profile.company_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      backgroundColor: homeTheme.green,
                      color: "#ffffff",
                      padding: "11px 16px",
                      borderRadius: 14,
                      textDecoration: "none",
                      fontWeight: 900,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    Company website ↗
                  </a>
                ) : null}

                <a
                  href="#available-jobs"
                  style={{
                    backgroundColor: "#ffffff",
                    color: homeTheme.green,
                    padding: "11px 16px",
                    borderRadius: 14,
                    textDecoration: "none",
                    fontWeight: 900,
                    fontFamily: "var(--font-body)",
                    border: "1px solid rgba(0,0,0,.12)",
                  }}
                >
                  View available jobs ↓
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {profile?.company_description || profile?.benefits_summary || benefits.length > 0 ? (
        <section style={{ width: "100%", padding: "22px 0 0" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
            <div
              style={{
                backgroundColor: "#f6f5f3",
                border: "1px solid rgba(0,0,0,.10)",
                borderRadius: 18,
                padding: 24,
                boxShadow: "0 18px 40px rgba(0,0,0,.10)",
              }}
            >
              {profile?.company_description ? (
                <>
                  <h2
                    style={{
                      margin: 0,
                      color: homeTheme.green,
                      fontFamily: "var(--font-heading)",
                      fontSize: 34,
                    }}
                  >
                    About {companyName}
                  </h2>

                  <p
                    style={{
                      margin: "12px 0 0",
                      color: "rgba(0,0,0,.72)",
                      lineHeight: 1.7,
                      fontSize: 16,
                      fontFamily: "var(--font-body)",
                      fontWeight: 650,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {profile.company_description}
                  </p>
                </>
              ) : null}

              {profile?.benefits_summary || benefits.length > 0 ? (
                <div style={{ marginTop: profile?.company_description ? 26 : 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      color: homeTheme.green,
                      fontFamily: "var(--font-heading)",
                      fontSize: 28,
                    }}
                  >
                    Benefits & Perks
                  </h3>

                  {profile?.benefits_summary ? (
                    <p
                      style={{
                        margin: "10px 0 0",
                        color: "rgba(0,0,0,.72)",
                        lineHeight: 1.7,
                        fontSize: 16,
                        fontFamily: "var(--font-body)",
                        fontWeight: 650,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {profile.benefits_summary}
                    </p>
                  ) : null}

                  {benefits.length > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        marginTop: 16,
                      }}
                    >
                      {benefits.map((benefit) => (
                        <div
                          key={benefit}
                          style={{
                            backgroundColor: "#ffffff",
                            border: "1px solid rgba(0,0,0,.10)",
                            borderRadius: 14,
                            padding: "12px 14px",
                            color: "rgba(0,0,0,.76)",
                            fontFamily: "var(--font-body)",
                            fontWeight: 850,
                          }}
                        >
                          ✓ {benefit}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section id="available-jobs" style={{ width: "100%", padding: "28px 0 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
          <h2
            style={{
              margin: 0,
              color: homeTheme.green,
              fontFamily: "var(--font-heading)",
              fontSize: 38,
            }}
          >
            Available Jobs at {companyName}
          </h2>

          <p
            style={{
              marginTop: 8,
              marginBottom: 18,
              color: "rgba(0,0,0,.65)",
              fontWeight: 800,
              fontFamily: "var(--font-body)",
            }}
          >
            Filter and search {companyJobs.length} open job
            {companyJobs.length === 1 ? "" : "s"} at {companyName}.
          </p>

          <JobsFilterPanel jobs={jobsWithSlugs} />
        </div>
      </section>
    </main>
  );
}

function ProfileStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 14,
        padding: "10px 13px",
        minWidth: 130,
      }}
    >
      <div
        style={{
          color: "rgba(0,0,0,.54)",
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: 0.45,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: homeTheme.green,
          fontFamily: "var(--font-body)",
          fontSize: 16,
          fontWeight: 900,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

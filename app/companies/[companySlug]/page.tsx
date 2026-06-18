import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCompanyName,
  getPublicJobs,
  makeCompanySlug,
} from "../../../lib/companyPages";
import { buildPageMetadata } from "../../../lib/seo";
import { homeTheme } from "../../styles/homepageDesignSystem";

type CompanyPageParams = {
  companySlug: string;
};

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

  return buildPageMetadata({
    title: `${companyName} Jobs | Restaurants Now Hiring`,
    description: `Browse restaurant jobs at ${companyName}, including hourly and management positions.`,
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

          <p
            style={{
              color: homeTheme.green,
              fontWeight: 900,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginTop: 28,
              marginBottom: 8,
            }}
          >
            Company Profile
          </p>

          <h1
            style={{
              margin: 0,
              fontSize: 54,
              fontWeight: 700,
              color: homeTheme.green,
              lineHeight: 1.05,
              fontFamily: "var(--font-heading)",
            }}
          >
            {companyName}
          </h1>

          <p
            style={{
              marginTop: 12,
              maxWidth: 760,
              color: "rgba(0,0,0,.72)",
              lineHeight: 1.6,
              fontSize: 17,
              fontFamily: "var(--font-body)",
              fontWeight: 650,
            }}
          >
            {companyName} is hiring restaurant teammates across multiple
            locations. Browse open hourly and leadership roles below.
          </p>
        </div>
      </section>

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
              }}
            >
              Explore current restaurant job openings from {companyName} on
              Restaurants Now Hiring. Open roles may include front-of-house,
              back-of-house, catering, hourly leadership, and management
              opportunities depending on location.
            </p>
          </div>
        </div>
      </section>

      <section style={{ width: "100%", padding: "28px 0 0" }}>
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
            {companyJobs.length} open job
            {companyJobs.length === 1 ? "" : "s"}
          </p>

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            {companyJobs.map((job: any) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                style={{
                  display: "block",
                  padding: 22,
                  border: "1px solid rgba(0,0,0,.10)",
                  borderRadius: 18,
                  textDecoration: "none",
                  color: "inherit",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 12px 28px rgba(0,0,0,.08)",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color: "rgba(0,0,0,.84)",
                    fontFamily: "var(--font-body)",
                    fontSize: 20,
                    fontWeight: 900,
                  }}
                >
                  {job.title}
                </h3>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "rgba(0,0,0,.62)",
                    fontWeight: 800,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {[job.city, job.state].filter(Boolean).join(", ")}
                </p>

                {job.role_category && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      color: "rgba(0,0,0,.60)",
                      fontWeight: 750,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {job.role_category}
                  </p>
                )}

                {job.pay_range && (
                  <p
                    style={{
                      margin: "14px 0 0",
                      color: homeTheme.green,
                      fontWeight: 900,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {job.pay_range}
                  </p>
                )}

                <p
                  style={{
                    margin: "16px 0 0",
                    color: homeTheme.green,
                    fontWeight: 900,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  View job →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

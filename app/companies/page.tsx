import type { Metadata } from "next";
import Link from "next/link";

import { getCompanyName, getPublicJobs, makeCompanySlug } from "../../lib/companyPages";
import { buildPageMetadata } from "../../lib/seo";
import { homeTheme } from "../styles/homepageDesignSystem";

export const metadata: Metadata = buildPageMetadata({
  title: "Restaurant Companies Hiring Now | Restaurants Now Hiring",
  description: "Browse restaurant companies hiring now across the United States.",
  path: "/companies",
});

export default async function CompaniesPage() {
  const jobs = await getPublicJobs();

  const companies = new Map<string, { name: string; slug: string; count: number }>();

  jobs.forEach((job: any) => {
    const name = getCompanyName(job.restaurant_name);
    if (!name) return;

    if (!companies.has(name)) {
      companies.set(name, {
        name,
        slug: makeCompanySlug(name),
        count: 0,
      });
    }

    companies.get(name)!.count++;
  });

  const list = Array.from(companies.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

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
              color: homeTheme.green,
              fontWeight: 900,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Restaurant Companies
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
            Restaurant Companies Hiring Now
          </h1>

          <p
            style={{
              marginTop: 10,
              maxWidth: 760,
              color: "rgba(0,0,0,.70)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-body)",
              fontWeight: 600,
            }}
          >
            Browse restaurant companies with active job openings on Restaurants Now Hiring.
          </p>
        </div>
      </section>

      <section style={{ width: "100%", padding: "18px 0 0" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 18px",
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {list.map((company) => (
            <Link
              key={company.slug}
              href={`/companies/${company.slug}`}
              style={{
                display: "block",
                padding: 22,
                border: "1px solid rgba(0,0,0,.10)",
                borderRadius: 18,
                textDecoration: "none",
                color: "inherit",
                backgroundColor: "#f6f5f3",
                boxShadow: "0 18px 40px rgba(0,0,0,.10)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: homeTheme.green,
                  fontFamily: "var(--font-heading)",
                  fontSize: 30,
                  lineHeight: 1.1,
                }}
              >
                {company.name}
              </h2>

              <p
                style={{
                  margin: "12px 0 0",
                  color: "rgba(0,0,0,.70)",
                  fontWeight: 900,
                  fontFamily: "var(--font-body)",
                }}
              >
                {company.count} open job{company.count === 1 ? "" : "s"}
              </p>

              <p
                style={{
                  margin: "14px 0 0",
                  color: homeTheme.green,
                  fontWeight: 900,
                  fontFamily: "var(--font-body)",
                }}
              >
                View jobs →
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

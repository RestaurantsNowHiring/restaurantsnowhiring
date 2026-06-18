import Link from "next/link";
import { getPublicJobs, makeCompanySlug } from "../../lib/companyPages";
import type { Metadata } from "next";
import { buildPageMetadata } from "../../lib/seo";

export default async function CompaniesPage() {
  const jobs = await getPublicJobs();

  const companies = new Map<
    string,
    {
      name: string;
      slug: string;
      count: number;
    }
  >();

  jobs.forEach((job: any) => {
    const name = job.restaurant_name?.trim();

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
        maxWidth: 1100,
        margin: "0 auto",
        padding: "120px 24px 60px",
      }}
    >
      <h1
        style={{
          color: "#35806e",
          fontSize: 48,
          marginBottom: 12,
        }}
      >
        Restaurant Companies Hiring Now
      </h1>

      <p
        style={{
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 32,
        }}
      >
        Browse restaurant companies with active job openings.
      </p>

      <div
        style={{
          display: "grid",
          gap: 18,
        }}
      >
        {list.map((company) => (
          <Link
            key={company.slug}
            href={`/companies/${company.slug}`}
            style={{
              padding: 24,
              border: "1px solid rgba(0,0,0,.12)",
              borderRadius: 18,
              textDecoration: "none",
              color: "inherit",
              backgroundColor: "#fff",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#35806e",
              }}
            >
              {company.name}
            </h2>

            <p
              style={{
                margin: "8px 0 0",
                fontWeight: 800,
              }}
            >
              {company.count} Open Job
              {company.count === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}

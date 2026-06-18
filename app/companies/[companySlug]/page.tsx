import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getCompanyName,
  getPublicJobs,
  makeCompanySlug,
} from "../../../lib/companyPages";
import { buildPageMetadata } from "../../../lib/seo";

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
        maxWidth: 1100,
        margin: "0 auto",
        padding: "120px 24px 60px",
      }}
    >
      <Link
        href="/companies"
        style={{
          color: "#35806e",
          textDecoration: "none",
          fontWeight: 700,
        }}
      >
        ← All Companies
      </Link>

      <h1
        style={{
          color: "#35806e",
          fontSize: 48,
          marginTop: 24,
          marginBottom: 12,
        }}
      >
        {companyName}
      </h1>

      <p
        style={{
          fontSize: 18,
          marginBottom: 40,
        }}
      >
        Browse open restaurant jobs at {companyName}.
      </p>

      <div style={{ display: "grid", gap: 20 }}>
        {companyJobs.map((job: any) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            style={{
              padding: 24,
              border: "1px solid rgba(0,0,0,.12)",
              borderRadius: 18,
              textDecoration: "none",
              color: "inherit",
              backgroundColor: "#fff",
            }}
          >
            <h2 style={{ margin: 0, color: "#222" }}>{job.title}</h2>

            <p style={{ marginTop: 10, color: "#555" }}>
              {job.city}, {job.state}
            </p>

            {job.role_category && <p style={{ fontWeight: 700 }}>{job.role_category}</p>}

            {job.pay_range && (
              <p style={{ color: "#35806e", fontWeight: 800 }}>
                {job.pay_range}
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}

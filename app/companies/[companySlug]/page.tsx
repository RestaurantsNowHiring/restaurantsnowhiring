import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicJobs, makeCompanySlug } from "../../../lib/companyPages";

export default async function CompanyPage({
  params,
}: {
  params: { companySlug: string };
}) {
  const jobs = await getPublicJobs();

  const companyJobs = jobs.filter(
    (job: any) =>
      makeCompanySlug(job.restaurant_name || "") === params.companySlug
  );

  if (companyJobs.length === 0) {
    notFound();
  }

  const companyName = companyJobs[0].restaurant_name;

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

      <div
        style={{
          display: "grid",
          gap: 20,
        }}
      >
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
            <h2
              style={{
                margin: 0,
                color: "#222",
              }}
            >
              {job.title}
            </h2>

            <p
              style={{
                marginTop: 10,
                color: "#555",
              }}
            >
              {job.city}, {job.state}
            </p>

            {job.role_category && (
              <p
                style={{
                  fontWeight: 700,
                }}
              >
                {job.role_category}
              </p>
            )}

            {job.pay_range && (
              <p
                style={{
                  color: "#35806e",
                  fontWeight: 800,
                }}
              >
                {job.pay_range}
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}

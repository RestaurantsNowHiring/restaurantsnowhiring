import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  description: string | null;
  created_at: string;
  active: boolean;
  pay_range: string | null;
  employment_type: string | null;
  address: string | null;
  how_to_apply: string | null;
  company_website?: string | null;
};


export default async function JobDetailsPage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams?.id;

  const HERO_HEIGHT = 320;

  const { data, error } = id
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,description,created_at,active,pay_range,employment_type,address,how_to_apply,company_website"
        )
        .eq("id", id)
        .limit(1)
    : { data: null, error: null };

  const job: Job | undefined = (data?.[0] as Job | undefined) ?? undefined;

  const notFound = !id || !!error || !job || job.active === false;

  const locationText =
    job?.city && job?.state ? `${job.city}, ${job.state}` : "";

  const postedText = job?.created_at
    ? new Date(job.created_at).toLocaleDateString()
    : "";

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* TOP HERO (FROZEN) */}
      <section
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: HERO_HEIGHT,
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
              "linear-gradient(90deg, rgba(0,0,0,.80) 0%, rgba(0,0,0,.60) 25%, rgba(0,0,0,.18) 50%, rgba(0,0,0,0) 75%)",
          }}
        />

        <div
          style={{
            position: "relative",
            height: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "34px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 10,
          }}
        >
          
          <h1
            style={{
              margin: 0,
              fontSize: 65,
              fontWeight: 900,
              lineHeight: 1.05,
              color: "#fff",
              maxWidth: 860,
              fontFamily: "var(--font-coldsmith)",
            }}
          >
            {notFound ? "Job Details" : job.title}
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 860,
              color: "rgba(255,255,255,.92)",
              lineHeight: 1.6,
              fontSize: 16,
            }}
          >
            {notFound
              ? "This job may be inactive, removed, or the link is incorrect."
              : `${job.restaurant_name} — ${locationText}`}
          </p>

          {/* Hero buttons (Saira Stencil) */}
          {/* Hero buttons */}
<div style={{ display: "flex", gap: 12, marginTop: 10 }}>
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
    Back to Jobs
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
    Home
  </Link>
</div>

        </div>
      </section>

      {/* Spacer so content starts below fixed hero */}
      <div style={{ height: HERO_HEIGHT }} />

      {/* WOOD BACKGROUND */}
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
        <div
          style={{
            backgroundColor: "rgba(0,0,0,.30)",
            width: "100%",
            minHeight: "100vh",
            padding: "34px 0 64px",
          }}
        >
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
            <div
              style={{
                backgroundColor: "#ffffffc0",
                border: "1px solid rgba(255,255,255,.10)",
                borderRadius: 10,
                padding: "22px 22px 18px",
                boxShadow: "0 10px 30px rgba(0,0,0,.89)",
                backdropFilter: "blur(2px)",
              }}
            >
              {notFound ? (
                <>
                  <div
                    style={{
                      color: "rgba(0,0,0,.78)",
                      fontWeight: 900,
                      fontSize: 18,
                    }}
                  >
                    Job not found
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      color: "rgba(0,0,0,.70)",
                      fontWeight: 700,
                    }}
                  >
                    This job may be inactive, removed, or the link is incorrect.
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: "rgba(0,0,0,.70)",
                      fontWeight: 700,
                    }}
                  >
                    Debug: ID ={" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {String(id)}
                    </span>
                  </div>

                  {error ? (
                    <div
                      style={{
                        marginTop: 10,
                        color: "rgba(0,0,0,.70)",
                        fontWeight: 700,
                      }}
                    >
                      Supabase error:{" "}
                      <span style={{ fontFamily: "monospace" }}>
                        {error.message}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {/* SUMMARY GRID */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                      marginBottom: 14,
                    }}
                  >
                    <InfoCard label="ROLE" value={job.title} />
                    <InfoCard label="COMPANY" value={job.restaurant_name} />
                    <InfoCard label="LOCATION" value={locationText} />
                    <InfoCard label="WEBSITE"value={
 job.company_website
      ? job.company_website.replace(/^https?:\/\//, "")
      : "Not listed"
  }
  href={job.company_website || undefined}
/> 
                  </div>

                  {/* SECONDARY GRID */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                      marginBottom: 18,
                    }}
                  >
                    <InfoCard label="PAY" value={job.pay_range || "Not listed"} />
                    <InfoCard
                      label="TYPE"
                      value={job.employment_type || "Not listed"}
                    />
                    <InfoCard
                      label="ADDRESS"
                      value={job.address || "Not listed"}
                    />
                  </div>

                  {/* DESCRIPTION */}
                  <SectionCard title="Description">
                    <div
                      style={{
                        color: "rgba(0,0,0,.82)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        fontWeight: 600,
                      }}
                    >
                      {job.description || "No description provided."}
                    </div>
                  </SectionCard>

                  {/* HOW TO APPLY */}
                  <SectionCard title="How to Apply">
                    <div
                      style={{
                        color: "rgba(0,0,0,.82)",
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        fontWeight: 600,
                      }}
                    >
                      {job.how_to_apply || "Not listed yet."}
                    </div>
                  </SectionCard>

                  {/* FOOT NOTE */}
                  <div
                    style={{
                      marginTop: 10,
                      color: "rgba(0,0,0,.70)",
                      fontWeight: 800,
                    }}
                  >
                    Posted: {postedText}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const safeHref = href
    ? href.startsWith("http://") || href.startsWith("https://")
      ? href
      : `https://${href}`
    : undefined;

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,.60)",
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 900, color: "#111", fontSize: 13, opacity: 0.75 }}>
        {label}
      </div>

      {safeHref ? (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            fontWeight: 900,
            color: "#ff7a00",
            fontSize: 18,
            marginTop: 6,
            textDecoration: "none",
            wordBreak: "break-word",
          }}
        >
          {value}
        </a>
      ) : (
        <div style={{ fontWeight: 900, color: "#111", fontSize: 18, marginTop: 6 }}>
          {value}
        </div>
      )}
    </div>
  );
}


function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.12)",
        borderRadius: 10,
        padding: 16,
        backgroundColor: "rgba(255,255,255,.60)",
        marginBottom: 14,
      }}
    >
      <div style={{ fontWeight: 900, color: "#111", fontSize: 18 }}>
        {title}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

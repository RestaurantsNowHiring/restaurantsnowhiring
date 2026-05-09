// app/page.tsx
import Image from "next/image";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "../lib/jobStatus";
import LatestJobsPanel from "./components/LatestJobsPanel";
import TopRolesSection from "./components/TopRolesSection";
import { ClipboardList, Search, ShieldCheck } from "lucide-react";
import { buildPageMetadata } from "../lib/seo";

export const metadata = buildPageMetadata({
  title: "Restaurant Jobs Hiring Now",
  description:
    "Find restaurant jobs hiring now across servers, cooks, bartenders, managers, hosts, and more on RestaurantsNowHiring.com.",
  path: "/",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  active: boolean;
  status?: string | null;
  created_at: string;

  // optional (pulled for chips / future use)
  pay_range?: string | null;
  employment_type?: string | null;
  role_category?: string | null;
};

export default async function HomePage() {
  const initialResult = await supabase
    .from("jobs")
    .select(
      "id,title,restaurant_name,city,state,active,status,created_at,pay_range,employment_type,role_category"
    )
    .order("created_at", { ascending: false });

  const { data: jobs } = isMissingStatusColumnError(initialResult.error)
    ? await supabase
        .from("jobs")
        .select("id,title,restaurant_name,city,state,active,created_at,pay_range,employment_type,role_category")
        .eq("active", true)
        .order("created_at", { ascending: false })
    : initialResult;

  const latestJobs: Job[] = ((jobs ?? []) as Job[])
    .filter((job) => isPubliclyVisibleJob(job.status, job.active))
    .slice(0, 6);

  // Theme tokens
  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";

  const pageWrap: React.CSSProperties = {
    backgroundColor: BG,
    minHeight: "100vh",
    paddingTop: 90, // room under TopBanner
    paddingBottom: 70,
  };

  const container: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 18px",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 800,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
  };

  const primaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: GREEN,
    color: "#fff",
    border: "1px solid rgba(0,0,0,.08)",
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: "#ffffff",
    color: "rgba(0,0,0,.75)",
  };

  // Temporarily disabled for MVP launch; flip to true when sponsor assets/support return.
  const SHOW_SPONSORS_SECTION = false;

  const featureCards = [
    {
      title: "Clean listings",
      body: "No clutter. Just the details job seekers actually need.",
      Icon: ClipboardList,
    },
    {
      title: "Fast search",
      body: "Browse roles by category and location in a couple clicks.",
      Icon: Search,
    },
    {
      title: "Verified posting flow",
      body: "Employers submit for review before a job goes public.",
      Icon: ShieldCheck,
    },
  ] as const;

  return (
    <main style={pageWrap}>
      <div style={container}>
        {/* HERO */}
        <section className="rn-home-hero">
          {/* Left: headline + CTAs */}
          <div style={cardStyle}>
            {/* Site name row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <img
                src="/logo-star.png"
                alt="Restaurants Now Hiring"
                style={{ height: 28, width: "auto", display: "block" }}
              />

              <div
                style={{
                  fontWeight: 900,
                  color: TEXT,
                  fontFamily: "var(--font-body)",
                  fontSize: 18,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "baseline",
                }}
              >
                <span>Restaurants</span>
                <span
                  style={{
                    color: GREEN,
                    textTransform: "uppercase",
                    margin: "0 3px",
                  }}
                >
                  NOWHiring
                </span>
                <span>.com</span>
              </div>
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 56,
                lineHeight: 1.02,
                fontWeight: 700,
                letterSpacing: 0,
                color: GREEN,
                fontFamily: "var(--font-heading)",
              }}
            >
              Restaurant jobs, hiring now.
            </h1>

            <p
              style={{
                marginTop: 10,
                marginBottom: 0,
                maxWidth: 680,
                color: "rgba(0,0,0,.70)",
                lineHeight: 1.6,
                fontSize: 16,
                fontFamily: "var(--font-body)",
                fontWeight: 600,
              }}
            >
              Find real restaurant jobs near you — with role category, location, and clear “how to
              apply” details.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <Link href="/jobs" style={primaryBtn} className="rn-btn-primary">
                Browse Jobs
              </Link>
              <Link href="/post-job" style={secondaryBtn} className="rn-btn-secondary">
                Post a Job
              </Link>
            </div>

            {/* Quick value props */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
                marginTop: 18,
              }}
            >
              {featureCards.map(({ title, body, Icon }) => (
                <div
                  key={title}
                  style={{
                    backgroundColor: "rgba(255,255,255,.75)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid rgba(53,128,110,0.20)",
                      backgroundColor: "rgba(53,128,110,0.08)",
                      marginBottom: 10,
                    }}
                    aria-hidden="true"
                  >
                    <Icon size={18} color={GREEN} />
                  </div>

                  <div
                    style={{
                      fontWeight: 900,
                      color: TEXT,
                      fontFamily: "var(--font-body)",
                      marginBottom: 6,
                      fontSize: 16,
                    }}
                  >
                    {title}
                  </div>

                  <div
                    style={{
                      color: "rgba(0,0,0,.72)",
                      lineHeight: 1.5,
                      fontWeight: 650,
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                    }}
                  >
                    {body}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Career Ladder Diagram */}
          <div
            style={{
              ...cardStyle,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: GREEN,
                fontFamily: "var(--font-heading)",
              }}
            >
              Your Way to 100k!
            </div>

            <div
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: "rgba(0,0,0,.75)",
                fontFamily: "var(--font-body)",
                fontWeight: 650,
              }}
            >
              Many restaurant leaders start at hourly roles and move into management within a few
              years.
            </div>

            <CareerLadder green={GREEN} border={BORDER} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <Link href="/jobs" style={secondaryBtn} className="rn-btn-secondary">
                Browse Jobs
              </Link>
              <Link href="/post-job" style={primaryBtn} className="rn-btn-primary">
                Post a Job
              </Link>
            </div>

            <div
              style={{
                marginTop: 4,
                color: "rgba(0,0,0,.55)",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
                lineHeight: 1.5,
              }}
            >
              This varies by brand, market, and performance — but the restaurant industry is one of
              the fastest paths to leadership.
            </div>
          </div>
        </section>

        {/* TOP ROLES */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ height: 1, width: 160, background: "rgba(0,0,0,.20)" }} />
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: TEXT,
                fontFamily: "var(--font-heading)",
              }}
            >
              Top Roles Hiring Now
            </div>
            <div style={{ height: 1, width: 160, background: "rgba(0,0,0,.20)" }} />
          </div>

          <TopRolesSection />
        </section>

        {/* LATEST JOBS */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <LatestJobsPanel jobs={latestJobs} />
        </section>

        {/* SPONSORS */}
        {SHOW_SPONSORS_SECTION ? (
          <section style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ height: 1, width: 160, background: "rgba(0,0,0,.20)" }} />
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: TEXT,
                  fontFamily: "var(--font-heading)",
                }}
              >
                Our Sponsors
              </div>
              <div style={{ height: 1, width: 160, background: "rgba(0,0,0,.20)" }} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {[
                { src: "/sponsor-1.png", alt: "Sponsor 1" },
                { src: "/sponsor-2.png", alt: "Sponsor 2" },
                { src: "/sponsor-3.png", alt: "Sponsor 3" },
                { src: "/sponsor-4.png", alt: "Sponsor 4" },
              ].map((s) => (
                <div
                  key={s.src}
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    height: 76,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12,
                  }}
                >
                  <Image
                    src={s.src}
                    alt={s.alt}
                    width={160}
                    height={48}
                    style={{
                      maxHeight: 48,
                      maxWidth: "100%",
                      width: "auto",
                      height: "auto",
                      objectFit: "contain",
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                textAlign: "center",
                color: "rgba(0,0,0,.55)",
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Interested in sponsoring RestaurantsNowHiring.com? Contact us to learn more.
            </div>
          </section>
        ) : null}

        {/* FOOTER */}
        <footer
          style={{
            marginTop: 18,
            textAlign: "center",
            color: "rgba(0,0,0,.50)",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-body)",
          }}
        >
          © 2026 RestaurantsNowHiring.com
        </footer>
      </div>

      {/* Responsive */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            .rn-home-hero {
              display: grid;
              grid-template-columns: 1.2fr 0.8fr;
              gap: 18px;
              align-items: stretch;
              margin-bottom: 18px;
            }
            @media (max-width: 980px) {
              .rn-home-hero {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

/**
 * Panda-style “ladder” diagram:
 * numbers on the left, roles on the right, vertical spine + dots.
 * Compact so it doesn’t take up the whole hero.
 */
function CareerLadder({
  green,
  border,
}: {
  green: string;
  border: string;
}) {
  const rows = [
    { pay: "$100k+", role: "Multi-Unit Leader", note: "Experienced leaders" },
    { pay: "$60k+", role: "General Manager", note: "Varies by market" },
    { pay: "$48k+", role: "Manager", note: "Often 6–18 months" },
    { pay: "Hourly", role: "Service & Kitchen Team", note: "Competitive hourly pay" },
  ] as const;

  const spineW = 26;

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,.70)",
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `1fr ${spineW}px 1.35fr`,
          gap: 10,
          alignItems: "center",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.role}
            style={{
              display: "contents",
            }}
          >
            {/* Left: Pay */}
            <div
              style={{
                textAlign: "right",
                paddingRight: 2,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: i === 0 ? 24 : 22,
                  color: green,
                  lineHeight: 1.05,
                  letterSpacing: -0.2,
                }}
              >
                {r.pay}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-body)",
                  fontWeight: 800,
                  fontSize: 11,
                  color: "rgba(0,0,0,.55)",
                }}
              >
                
              </div>
            </div>

            {/* Middle: Spine + dot + connector */}
            <div
              aria-hidden="true"
              style={{
                position: "relative",
                height: 54,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* vertical line */}
              <div
                style={{
                  position: "absolute",
                  top: -28,
                  bottom: -28,
                  left: "50%",
                  width: 4,
                  transform: "translateX(-50%)",
                  background: "rgba(53,128,110,0.22)",
                  borderRadius: 999,
                }}
              />
              {/* dot */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  backgroundColor: "#fff",
                  border: "3px solid rgba(53,128,110,0.35)",
                  boxShadow: "0 8px 18px rgba(0,0,0,.10)",
                  position: "relative",
                  zIndex: 2,
                }}
              />
              {/* horizontal connector to right */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  height: 3,
                  width: 16,
                  background: "rgba(53,128,110,0.22)",
                  borderRadius: 999,
                  transform: "translateX(6px)",
                }}
              />
            </div>

            {/* Right: Role */}
            <div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 950,
                  fontSize: 16,
                  color: "rgba(0,0,0,.85)",
                  lineHeight: 1.15,
                }}
              >
                {r.role}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-body)",
                  fontWeight: 750,
                  fontSize: 12,
                  color: "rgba(0,0,0,.62)",
                }}
              >
                {r.note}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tiny caption row (optional “path” hint) */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingTop: 10,
          borderTop: `1px dashed rgba(0,0,0,.12)`,
          color: "rgba(0,0,0,.55)",
          fontFamily: "var(--font-body)",
          fontWeight: 800,
          fontSize: 11,
        }}
      >

      </div>
    </div>
  );
}

import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  BriefcaseBusiness,
  Search,
  ShieldCheck,
  Users,
  ArrowRight,
} from "lucide-react";

export const metadata = buildPageMetadata({
  title: "About Restaurants Now Hiring",
  description: "Learn about Restaurants Now Hiring, a focused restaurant job board for hospitality employers and job seekers.",
  path: "/about",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AboutPage() {
  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.88)";
  const MUTED = "rgba(0,0,0,.62)";

  const pageWrap: React.CSSProperties = {
    backgroundColor: BG,
    minHeight: "100vh",
    paddingTop: 92,
    paddingBottom: 70,
  };

  const container: React.CSSProperties = {
    maxWidth: 1120,
    margin: "0 auto",
    padding: "0 18px",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,.08)",
  };

  const smallCard: React.CSSProperties = {
    backgroundColor: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 10px 22px rgba(0,0,0,.05)",
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    padding: "0 18px",
    borderRadius: 16,
    textDecoration: "none",
    fontWeight: 900,
    fontFamily: "var(--font-body)",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 10px 22px rgba(0,0,0,.06)",
    whiteSpace: "nowrap",
  };

  const primaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: GREEN,
    color: "#fff",
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: "#fff",
    color: "rgba(0,0,0,.78)",
  };

  const eyebrowIconWrap = (green = false): React.CSSProperties => ({
    width: 42,
    height: 42,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: green ? "rgba(53,128,110,.12)" : "rgba(0,0,0,.04)",
    border: `1px solid ${green ? "rgba(53,128,110,.18)" : BORDER}`,
    marginBottom: 12,
  });

  return (
    <main style={pageWrap}>
      <div style={container}>
        {/* INTRO */}
        <section style={{ ...cardStyle, marginBottom: 28 }}>
          <div className="rn-about-hero">
            <div>
              <div style={eyebrowIconWrap(true)}>
                <BriefcaseBusiness size={22} color={GREEN} />
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 56,
                  lineHeight: 1,
                  fontWeight: 700,
                  color: GREEN,
                  fontFamily: "var(--font-heading)",
                }}
              >
                About Restaurants Now Hiring
              </h1>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  maxWidth: 620,
                  color: MUTED,
                  lineHeight: 1.55,
                  fontSize: 17,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Restaurants Now Hiring is a focused job board that helps restaurants hire faster and
                helps job seekers find the right roles with clear, practical listings.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                <Link href="/jobs" style={primaryBtn} className="rn-btn-primary">
                  Browse Jobs
                </Link>
                <Link href="/post-job" style={secondaryBtn} className="rn-btn-secondary">
                  Post a Job
                </Link>
              </div>
            </div>

            <div className="rn-about-hero-side" style={smallCard}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 0.3,
                  color: MUTED,
                  textTransform: "uppercase",
                  fontFamily: "var(--font-body)",
                }}
              >
                What matters here
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {[
                  {
                    icon: <Search size={18} color={GREEN} />,
                    title: "Easy to scan",
                    body: "Find restaurant jobs by role and location in seconds.",
                  },
                  {
                    icon: <ShieldCheck size={18} color={GREEN} />,
                    title: "Reviewed quality",
                    body: "Listings are checked before they go live to keep standards high.",
                  },
                  {
                    icon: <Users size={18} color={GREEN} />,
                    title: "Built for restaurants",
                    body: "Everything is tailored to restaurant teams and job seekers.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38px 1fr",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div style={eyebrowIconWrap(true)}>{item.icon}</div>
                    <div>
                      <div
                        style={{
                          fontWeight: 900,
                          color: TEXT,
                          fontFamily: "var(--font-body)",
                          fontSize: 16,
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          color: MUTED,
                          lineHeight: 1.5,
                          fontWeight: 700,
                          fontFamily: "var(--font-body)",
                          fontSize: 14,
                        }}
                      >
                        {item.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* VALUE */}
        <section style={{ ...cardStyle, marginBottom: 28 }}>
          <SectionHeader title="Why People Use It" />

          <div className="rn-about-three-col">
            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <Search size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Find better-fit jobs faster</div>
              <div className="rn-about-card-body">
                Listings stay focused on essentials like role, location, schedule, and how to
                apply.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <BriefcaseBusiness size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Post roles with less friction</div>
              <div className="rn-about-card-body">
                Restaurant teams can submit openings quickly and get approved jobs in front of
                active candidates.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <ShieldCheck size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Maintain listing quality</div>
              <div className="rn-about-card-body">
                Review keeps postings clear, professional, and useful for both applicants and hiring
                managers.
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ ...cardStyle, marginBottom: 28 }}>
          <SectionHeader title="How It Works" />

          <div style={{ ...smallCard, maxWidth: 960, margin: "0 auto" }}>
            <div className="rn-about-process">
              {[
                "Employers submit a listing with role details.",
                "Our team reviews the listing before publishing.",
                "Candidates browse and apply through clear job pages.",
              ].map((item, i) => (
                <div
                  key={item}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "34px 1fr",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      backgroundColor: "rgba(53,128,110,.10)",
                      color: GREEN,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      color: TEXT,
                      fontWeight: 800,
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    {item}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section style={cardStyle}>
          <SectionHeader title="Ready to Get Started?" />

          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: TEXT,
                fontSize: 17,
                lineHeight: 1.55,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Browse current openings or post a role today. If you need help, our contact page is
              always available.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 20,
              }}
            >
              <Link href="/contact" style={primaryBtn} className="rn-btn-primary">
                Contact
                <ArrowRight size={16} />
              </Link>
              <Link href="/jobs" style={secondaryBtn} className="rn-btn-secondary">
                Browse Jobs
              </Link>
            </div>
          </div>
        </section>

        <footer
          style={{
            marginTop: 18,
            textAlign: "center",
            color: MUTED,
            fontSize: 13,
            fontWeight: 800,
            fontFamily: "var(--font-body)",
          }}
        >
          Restaurants Now Hiring
        </footer>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rn-about-hero {
              display: grid;
              grid-template-columns: 1.2fr .8fr;
              gap: 20px;
              align-items: stretch;
            }

            .rn-about-three-col {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 16px;
            }

            .rn-about-process {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 14px;
            }

            .rn-about-card-title {
              font-weight: 900;
              font-size: 18px;
              color: ${TEXT};
              font-family: var(--font-body);
              margin-bottom: 10px;
            }

            .rn-about-card-body {
              color: ${MUTED};
              line-height: 1.6;
              font-weight: 700;
              font-family: var(--font-body);
              font-size: 15px;
            }

            @media (max-width: 980px) {
              .rn-about-hero,
              .rn-about-three-col,
              .rn-about-process {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      className="rn-section-header-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        marginBottom: 18,
      }}
    >
      <div style={{ height: 1, width: 170, background: "rgba(0,0,0,.18)" }} />
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: "rgba(0,0,0,.88)",
          fontFamily: "var(--font-heading)",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div style={{ height: 1, width: 170, background: "rgba(0,0,0,.18)" }} />
    </div>
  );
}

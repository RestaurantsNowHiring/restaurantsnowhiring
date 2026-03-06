import Link from "next/link";
import {
  BriefcaseBusiness,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";

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
        {/* HERO */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div className="rn-about-hero">
            <div>
              <div style={eyebrowIconWrap(true)}>
                <BriefcaseBusiness size={22} color={GREEN} />
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 58,
                  lineHeight: 0.98,
                  fontWeight: 700,
                  color: GREEN,
                  fontFamily: "var(--font-heading)",
                }}
              >
                About
              </h1>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  maxWidth: 700,
                  color: MUTED,
                  lineHeight: 1.65,
                  fontSize: 18,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Restaurants Now Hiring helps restaurants post open roles and helps job seekers find
                restaurant jobs faster — by role, location, and real details.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                <Link href="/jobs" style={primaryBtn}>
                  Browse Jobs
                </Link>
                <Link href="/post-job" style={secondaryBtn}>
                  Post a Job
                </Link>
                <Link href="/" style={secondaryBtn}>
                  Home
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
                    title: "Easy browsing",
                    body: "Find jobs by role and location without clutter.",
                  },
                  {
                    icon: <ShieldCheck size={18} color={GREEN} />,
                    title: "Reviewed listings",
                    body: "Employers submit jobs for review before they go live.",
                  },
                  {
                    icon: <Users size={18} color={GREEN} />,
                    title: "Built for restaurants",
                    body: "Focused specifically on restaurant roles and hiring needs.",
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

        {/* QUICK VALUE STRIP */}
        <section
          style={{
            ...cardStyle,
            marginBottom: 18,
            paddingTop: 18,
            paddingBottom: 18,
          }}
        >
          <div className="rn-about-stats">
            {[
              {
                title: "For Job Seekers",
                body: "Browse restaurant roles by category and location, then open a listing to see the details that matter.",
              },
              {
                title: "For Employers",
                body: "Create an employer account, submit jobs for review, and publish approved listings publicly.",
              },
              {
                title: "Quality First",
                body: "We keep listings clean, readable, and focused on what people need to apply.",
              },
            ].map((item) => (
              <div key={item.title} style={smallCard}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    color: TEXT,
                    fontFamily: "var(--font-body)",
                    marginBottom: 10,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    color: MUTED,
                    lineHeight: 1.6,
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                  }}
                >
                  {item.body}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* WHAT WE DO */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <SectionHeader title="What We Do" />

          <div className="rn-about-three-col">
            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <Search size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">For Job Seekers</div>
              <div className="rn-about-card-body">
                Browse restaurant roles by category and location. Click any job to view details
                like pay, schedule, and how to apply.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <ClipboardCheck size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">For Employers</div>
              <div className="rn-about-card-body">
                Create an employer account to submit jobs for review. Once approved, your listing is
                published publicly.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <ShieldCheck size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Quality First</div>
              <div className="rn-about-card-body">
                We keep listings clean and easy to read — no clutter, no confusion, just the info
                people need to apply.
              </div>
            </div>
          </div>

          <div style={{ ...smallCard, marginTop: 14 }}>
            <div
              style={{
                fontWeight: 900,
                fontSize: 18,
                color: TEXT,
                fontFamily: "var(--font-body)",
                marginBottom: 14,
              }}
            >
              How jobs get posted
            </div>

            <div className="rn-about-process">
              {[
                "Employers submit a job listing.",
                "Listings are reviewed before going live.",
                "Approved jobs appear under Browse Jobs.",
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

        {/* WHY INDUSTRY */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <SectionHeader title="Why The Restaurant Industry" />

          <div
            style={{
              color: TEXT,
              lineHeight: 1.7,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              maxWidth: 920,
              margin: "0 auto 18px",
              textAlign: "center",
            }}
          >
            Restaurants are one of the best places to build real, transferable skills fast —
            communication, teamwork, leadership, and operations. For many people, it’s not just a
            job. It’s a career path with momentum.
          </div>

          <div className="rn-about-three-col">
            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <BriefcaseBusiness size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Start Anywhere</div>
              <div className="rn-about-card-body">
                Many careers in restaurants start at entry-level and build quickly through
                consistent performance and training.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <TrendingUp size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Grow Fast</div>
              <div className="rn-about-card-body">
                With the right opportunity, people can move from hourly roles into leadership in a
                relatively short time.
              </div>
            </div>

            <div style={smallCard}>
              <div style={eyebrowIconWrap(true)}>
                <Users size={20} color={GREEN} />
              </div>
              <div className="rn-about-card-title">Real Career Upside</div>
              <div className="rn-about-card-body">
                Strong performers can grow into bigger leadership roles over time as responsibility,
                skill, and results increase.
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "14px 16px",
              borderRadius: 16,
              border: `1px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,.55)",
              color: MUTED,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.55,
              fontFamily: "var(--font-body)",
            }}
          >
            Note: Pay and timelines vary by company, role, market, and performance. We share this
            to highlight the industry’s potential — not to promise specific earnings.
          </div>
        </section>

        {/* QUESTIONS / CTA */}
        <section style={cardStyle}>
          <SectionHeader title="Questions" />

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
                fontSize: 18,
                lineHeight: 1.65,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Need help or have feedback? Visit the Contact page and send us a note.
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
              <Link href="/contact" style={primaryBtn}>
                Contact
                <ArrowRight size={16} />
              </Link>
              <Link href="/jobs" style={secondaryBtn}>
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
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            .rn-about-hero {
              display: grid;
              grid-template-columns: 1.2fr .8fr;
              gap: 18px;
              align-items: stretch;
            }

            .rn-about-stats,
            .rn-about-three-col {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 14px;
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
              .rn-about-stats,
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
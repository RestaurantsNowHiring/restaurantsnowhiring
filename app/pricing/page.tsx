import Link from "next/link";
import {
  BadgeDollarSign,
  Check,
  ShieldCheck,
  Clock3,
  RefreshCcw,
  BriefcaseBusiness,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PricingPage() {
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

  const iconWrap = (green = false): React.CSSProperties => ({
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

  const checkRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    gap: 10,
    alignItems: "start",
    color: TEXT,
    fontSize: 15,
    lineHeight: 1.55,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
  };

  return (
    <main style={pageWrap}>
      <div style={container}>
        {/* HERO */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div className="rn-pricing-hero">
            <div>
              <div style={iconWrap(true)}>
                <BadgeDollarSign size={22} color={GREEN} />
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
                Pricing
              </h1>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  maxWidth: 720,
                  color: MUTED,
                  lineHeight: 1.65,
                  fontSize: 18,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Simple pricing for restaurant employers. Start with a free trial, then pay per job
                post every 30 days while your post stays active.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                <Link href="/post-job" style={primaryBtn} className="rn-btn-primary">
                  Post a Job
                </Link>
                <Link href="/employer-login" style={secondaryBtn} className="rn-btn-secondary">
                  Employer Login
                </Link>
                <Link href="/" style={secondaryBtn} className="rn-btn-secondary">
                  Home
                </Link>
              </div>
            </div>

            <div style={smallCard}>
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
                Quick summary
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {[
                  {
                    icon: <Clock3 size={18} color={GREEN} />,
                    title: "30-day free trial",
                    body: "New employers can start posting before paid billing begins.",
                  },
                  {
                    icon: <BadgeDollarSign size={18} color={GREEN} />,
                    title: "$9 per post",
                    body: "Each active post renews every 30 days unless canceled.",
                  },
                  {
                    icon: <RefreshCcw size={18} color={GREEN} />,
                    title: "Auto-renews",
                    body: "Posts stay active and billed every 30 days until you stop them.",
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
                    <div style={iconWrap(true)}>{item.icon}</div>
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

        {/* MAIN PLAN */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <SectionHeader title="Employer Plan" />

          <div className="rn-pricing-main">
            <div
              style={{
                ...smallCard,
                border: "1px solid rgba(53,128,110,.20)",
                boxShadow: "0 16px 30px rgba(0,0,0,.06)",
              }}
            >
              <div style={iconWrap(true)}>
                <BriefcaseBusiness size={20} color={GREEN} />
              </div>

              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: TEXT,
                  fontFamily: "var(--font-body)",
                }}
              >
                Restaurants Now Hiring Employer
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 52,
                    lineHeight: 1,
                    fontWeight: 700,
                    color: GREEN,
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  $9
                </div>
                <div
                  style={{
                    color: MUTED,
                    fontWeight: 800,
                    fontSize: 16,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  per post / every 30 days
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 34,
                  padding: "0 12px",
                  borderRadius: 999,
                  backgroundColor: "rgba(53,128,110,.10)",
                  border: "1px solid rgba(53,128,110,.14)",
                  color: GREEN,
                  fontWeight: 900,
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                }}
              >
                30-day free trial for new employers
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 12,
                }}
              >
                {[
                  "Post a restaurant job listing for public visibility after approval.",
                  "Each job post stays active for 30 days at a time.",
                  "After the free trial, each active post is billed at $9 every 30 days.",
                  "Cancel a post before renewal to stop future charges.",
                  "Best for restaurants that want a simple pay-per-post setup.",
                ].map((item) => (
                  <div key={item} style={checkRow}>
                    <Check size={18} color={GREEN} style={{ marginTop: 2 }} />
                    <div>{item}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
                <Link href="/post-job" style={primaryBtn} className="rn-btn-primary">
                  Start Posting
                </Link>
                <Link href="/contact" style={secondaryBtn} className="rn-btn-secondary">
                  Contact
                </Link>
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div style={smallCard}>
                <div style={iconWrap(true)}>
                  <ShieldCheck size={20} color={GREEN} />
                </div>
                <div className="rn-pricing-card-title">What’s included</div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    marginTop: 12,
                  }}
                >
                  {[
                    "Employer account access",
                    "Job submission for review",
                    "Public job listing after approval",
                    "Simple recurring billing per active post",
                  ].map((item) => (
                    <div key={item} style={checkRow}>
                      <Check size={18} color={GREEN} style={{ marginTop: 2 }} />
                      <div>{item}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={smallCard}>
                <div style={iconWrap(true)}>
                  <RefreshCcw size={20} color={GREEN} />
                </div>
                <div className="rn-pricing-card-title">How billing works</div>
                <div className="rn-pricing-card-body" style={{ marginTop: 12 }}>
                  You’ll agree to a 30-day free trial, then active posts auto-renew every 30 days
                  at <strong style={{ color: TEXT }}>$9 per post</strong> unless canceled.
                </div>
              </div>
            </div>
          </div>
        </section>

    

        {/* FAQ */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <SectionHeader title="Common Questions" />

          <div style={{ display: "grid", gap: 14 }}>
            {[
              {
                q: "Is pricing per employer or per job post?",
                a: "Pricing is per active job post. Each post is billed separately at $9 every 30 days after the free trial period.",
              },
              {
                q: "Do posts renew automatically?",
                a: "Yes. Active posts auto-renew every 30 days unless canceled before the next billing cycle.",
              },
              {
                q: "Can I stop billing on a post?",
                a: "Yes. Cancel the post before renewal and future charges for that post stop.",
              },
              {
                q: "Does every employer get a free trial?",
                a: "The plan is designed around a one-month free trial for new employers before recurring post billing begins.",
              },
            ].map((item) => (
              <div key={item.q} style={smallCard}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 17,
                    color: TEXT,
                    fontFamily: "var(--font-body)",
                    marginBottom: 8,
                  }}
                >
                  {item.q}
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
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={cardStyle}>
          <SectionHeader title="Ready To Post?" />

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
              Start your employer setup, submit a job, and take advantage of the free trial before
              paid post renewals begin.
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
              <Link href="/post-job" style={primaryBtn} className="rn-btn-primary">
                Post a Job
              </Link>
              <Link href="/contact" style={secondaryBtn} className="rn-btn-secondary">
                Contact
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
            .rn-pricing-hero {
              display: grid;
              grid-template-columns: 1.2fr .8fr;
              gap: 18px;
              align-items: stretch;
            }

            .rn-pricing-main {
              display: grid;
              grid-template-columns: 1.05fr .95fr;
              gap: 18px;
            }

            .rn-pricing-three-col {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 14px;
            }

            .rn-pricing-card-title {
              font-weight: 900;
              font-size: 18px;
              color: ${TEXT};
              font-family: var(--font-body);
            }

            .rn-pricing-card-body {
              color: ${MUTED};
              line-height: 1.6;
              font-weight: 700;
              font-family: var(--font-body);
              font-size: 15px;
            }

            @media (max-width: 980px) {
              .rn-pricing-hero,
              .rn-pricing-main,
              .rn-pricing-three-col {
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
import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  HelpCircle,
  PauseCircle,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";

export const metadata = buildPageMetadata({
  title: "Simple Pricing for Restaurant Hiring",
  description:
    "Start with a 30-day free trial. Approved public restaurant jobs are just $9 per 30-day listing with no long-term contracts.",
  path: "/pricing",
});

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
    border: `1px solid rgba(255,255,255,.72)`,
    borderRadius: 28,
    padding: 28,
    boxShadow: "0 24px 60px rgba(0,0,0,.08)",
  };

  const whiteCard: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,.92)",
    border: `1px solid rgba(0,0,0,.07)`,
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 16px 34px rgba(0,0,0,.055)",
  };

  const pricingCard: React.CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(255,255,255,.98) 0%, rgba(246,245,243,.95) 100%)",
    border: "1px solid rgba(53,128,110,.22)",
    borderRadius: 28,
    padding: 24,
    boxShadow: "0 30px 70px rgba(53,128,110,.18), 0 12px 28px rgba(0,0,0,.08)",
    position: "relative",
    overflow: "hidden",
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    padding: "0 20px",
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
    borderColor: "rgba(0,0,0,.08)",
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: "#fff",
    color: "rgba(0,0,0,.78)",
  };

  const iconWrap = (green = false): React.CSSProperties => ({
    width: 50,
    height: 50,
    borderRadius: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: green
      ? "linear-gradient(135deg, rgba(53,128,110,.16), rgba(53,128,110,.07))"
      : "rgba(0,0,0,.04)",
    border: `1px solid ${green ? "rgba(53,128,110,.20)" : BORDER}`,
    boxShadow: green ? "inset 0 1px 0 rgba(255,255,255,.9), 0 10px 18px rgba(53,128,110,.10)" : "none",
    marginBottom: 14,
  });

  const checkRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    gap: 12,
    alignItems: "start",
    color: TEXT,
    fontSize: 15.5,
    lineHeight: 1.55,
    fontWeight: 800,
    fontFamily: "var(--font-body)",
  };

  const checkIcon: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(53,128,110,.12)",
    border: "1px solid rgba(53,128,110,.18)",
    marginTop: 1,
  };

  const includedItems = [
    "30-day free trial",
    "No charge today",
    "$9 per approved job ad every 30 days",
    "Cancel anytime",
    "Only approved jobs are billed",
    "Active jobs auto-renew every 30 days",
    "Pause/remove jobs anytime",
    "Google Jobs optimized",
    "Employer dashboard included",
  ];

  const faqItems = [
    {
      question: "What is billed after the free trial?",
      answer:
        "After the 30-day free trial, approved jobs are billed $9 per 30-day listing. Pending jobs are never billed.",
    },
    {
      question: "Will I be charged today?",
      answer:
        "No. You can create an employer account and submit your first job during the trial without a charge today.",
    },
    {
      question: "What happens after 30 days?",
      answer:
        "Approved active jobs automatically renew for another 30 days. Pause or remove a listing from your employer dashboard to prevent its next renewal.",
    },
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. You can pause or remove jobs at any time. Pausing removes a job from public view immediately and prevents future renewal charges. Current 30-day listing periods are not prorated or refunded.",
    },
  ];

  return (
    <main style={pageWrap}>
      <div style={container}>
        <section
          style={{
            ...cardStyle,
            marginBottom: 22,
            background:
              "radial-gradient(circle at 12% 18%, rgba(53,128,110,.12), transparent 30%), linear-gradient(135deg, #f8f5ee 0%, #f6f5f3 54%, #ffffff 100%)",
          }}
        >
          <div className="rn-pricing-hero">
            <div className="rn-pricing-hero-copy">
              <div style={iconWrap(true)}>
                <BadgeDollarSign size={22} color={GREEN} />
              </div>

              <p
                style={{
                  margin: "0 0 12px",
                  color: GREEN,
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  fontFamily: "var(--font-body)",
                }}
              >
                RestaurantsNowHiring.com pricing
              </p>

              <h1
                style={{
                  margin: 0,
                  fontSize: 56,
                  lineHeight: 1.02,
                  letterSpacing: -0.8,
                  fontWeight: 700,
                  color: GREEN,
                  fontFamily: "var(--font-heading)",
                }}
              >
                Simple Pricing for Restaurant Hiring
              </h1>

              <p
                style={{
                  marginTop: 18,
                  marginBottom: 0,
                  maxWidth: 650,
                  color: MUTED,
                  lineHeight: 1.65,
                  fontSize: 18,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Start with a 30-day free trial. There is no charge today. Approved
               job ads are billed $9 per 30-day listing after approval.
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
                <Link href="/employer-login?next=/post-job" style={primaryBtn} className="rn-btn-primary">
                  Post Your First Job Free
                </Link>
                <Link href="/employer-dashboard" style={secondaryBtn} className="rn-btn-secondary">
                  Manage Jobs
                </Link>
              </div>
            </div>

            <aside style={pricingCard} aria-label="Pricing summary">
              <div className="rn-pricing-card-glow" aria-hidden="true" />
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      color: GREEN,
                      backgroundColor: "rgba(53,128,110,.11)",
                      border: "1px solid rgba(53,128,110,.18)",
                      borderRadius: 999,
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 900,
                      fontFamily: "var(--font-body)",
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                    }}
                  >
                    <ShieldCheck size={17} /> 30-Day Free Trial
                  </div>
                  <span
                    style={{
                      color: "rgba(0,0,0,.58)",
                      fontSize: 13,
                      fontWeight: 900,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    No charge today
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 22,
                    paddingBottom: 18,
                    borderBottom: "1px solid rgba(0,0,0,.08)",
                  }}
                >
                  <div
                    style={{
                      color: TEXT,
                      fontFamily: "var(--font-heading)",
                      fontSize: 76,
                      lineHeight: 0.9,
                      fontWeight: 800,
                      letterSpacing: -1.5,
                    }}
                  >
                    $9
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      color: MUTED,
                      fontFamily: "var(--font-body)",
                      fontSize: 16,
                      lineHeight: 1.45,
                      fontWeight: 900,
                    }}
                  >
                    per approved ad every 30 days
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                  {[
                    "Only approved job ads are billed",
                    "Active jobs automatically renew every 30 days",
                    "Pause or remove jobs anytime",
                  ].map((item) => (
                    <div key={item} style={checkRow}>
                      <span style={checkIcon}>
                        <Check size={15} color={GREEN} strokeWidth={3} />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: 20,
                    color: MUTED,
                    fontSize: 15,
                    lineHeight: 1.55,
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  No charge today. Jobs are billed in 30-day listing periods. Pausing a job removes it from public view immediately and prevents future renewals. Current listing periods are not prorated or refunded.
                </div>

                <Link
                  href="/employer-login?next=/post-job"
                  style={{ ...primaryBtn, width: "100%", marginTop: 22 }}
                  className="rn-btn-primary"
                >
                  Start Your Free Trial
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section className="rn-pricing-main" style={{ marginBottom: 22 }}>
          <div style={cardStyle}>
            <SectionHeader title="What You Get" />
            <div style={{ display: "grid", gap: 14, marginTop: 22 }}>
              {includedItems.map((item) => (
                <div key={item} style={checkRow}>
                  <span style={checkIcon}>
                    <Check size={15} color={GREEN} strokeWidth={3} />
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <SectionHeader title="Built For Restaurant Hiring" />
            <div className="rn-pricing-feature-grid" style={{ marginTop: 18 }}>
              {[
                {
                  icon: <Clock3 size={24} color={GREEN} strokeWidth={2.4} />,
                  title: "Trial-first",
                  body: "Create an employer account and submit jobs for review before paid billing starts.",
                },
                {
                  icon: <PauseCircle size={24} color={GREEN} strokeWidth={2.4} />,
                  title: "Pause anytime",
                  body: "Listings can be paused or removed from the dashboard when the role is filled.",
                },
                {
                  icon: <SearchCheck size={24} color={GREEN} strokeWidth={2.4} />,
                  title: "Google Jobs optimized",
                  body: "Public approved jobs include structured job data for search visibility.",
                },
                {
                  icon: <BriefcaseBusiness size={24} color={GREEN} strokeWidth={2.4} />,
                  title: "Dashboard included",
                  body: "Employers can review listing status and manage active, paused, or removed ads in one place.",
                },
              ].map((feature) => (
                <div key={feature.title} style={whiteCard} className="rn-pricing-feature-card">
                  <div style={iconWrap(true)}>{feature.icon}</div>
                  <h3
                    style={{
                      margin: 0,
                      color: TEXT,
                      fontSize: 18,
                      fontFamily: "var(--font-heading)",
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      margin: "8px 0 0",
                      color: MUTED,
                      fontSize: 14,
                      lineHeight: 1.55,
                      fontWeight: 700,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, marginBottom: 22, backgroundColor: "#fff" }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <SectionHeader title="FAQ" />
            <div className="rn-pricing-faq-list" style={{ marginTop: 18 }}>
              {faqItems.map((item) => (
                <details key={item.question} className="rn-pricing-faq-item">
                  <summary className="rn-pricing-faq-summary">
                    <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                      <HelpCircle size={20} color={GREEN} style={{ flex: "0 0 auto" }} />
                      <span>{item.question}</span>
                    </span>
                    <ChevronDown className="rn-pricing-faq-chevron" size={20} color={GREEN} />
                  </summary>
                  <p className="rn-pricing-faq-answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            ...cardStyle,
            background:
              "linear-gradient(135deg, rgba(53,128,110,.96), rgba(41,103,88,.96)), radial-gradient(circle at 18% 20%, rgba(255,255,255,.22), transparent 34%)",
            borderColor: "rgba(53,128,110,.24)",
            boxShadow: "0 28px 70px rgba(53,128,110,.20)",
          }}
        >
          <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
            <p
              style={{
                margin: "0 0 10px",
                color: "rgba(255,255,255,.78)",
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                fontFamily: "var(--font-body)",
              }}
            >
              Start Hiring Faster
            </p>
            <SectionHeader title="Post Your First Restaurant Job Today" tone="light" />
            <p
              style={{
                margin: "12px auto 0",
                color: "rgba(255,255,255,.86)",
                fontSize: 18,
                lineHeight: 1.65,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Start your 30-day free trial, submit a job for approval, and manage every listing from
              your employer dashboard.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
              <Link
                href="/employer-login?next=/post-job"
                style={{ ...primaryBtn, backgroundColor: "#fff", color: GREEN, borderColor: "rgba(255,255,255,.45)" }}
                className="rn-btn-secondary"
              >
                Post Your First Job Free
              </Link>
              <Link
                href="/contact"
                style={{
                  ...secondaryBtn,
                  backgroundColor: "rgba(255,255,255,.10)",
                  color: "#fff",
                  borderColor: "rgba(255,255,255,.34)",
                }}
                className="rn-btn-secondary"
              >
                Questions? Contact Us
              </Link>
            </div>
          </div>
        </section>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rn-pricing-hero {
              display: grid;
              grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
              gap: 24px;
              align-items: stretch;
            }

            .rn-pricing-hero-copy {
              align-self: center;
              padding: 6px 0;
            }

            .rn-pricing-card-glow {
              position: absolute;
              inset: -45% -25% auto auto;
              width: 220px;
              height: 220px;
              border-radius: 999px;
              background: radial-gradient(circle, rgba(53,128,110,.16), transparent 66%);
              pointer-events: none;
            }

            .rn-pricing-main {
              display: grid;
              grid-template-columns: .86fr 1.14fr;
              gap: 22px;
            }

            .rn-pricing-feature-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 16px;
            }

            .rn-pricing-feature-card {
              transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
            }

            .rn-pricing-feature-card:hover {
              transform: translateY(-2px);
              border-color: rgba(53,128,110,.18) !important;
              box-shadow: 0 20px 42px rgba(53,128,110,.10), 0 10px 24px rgba(0,0,0,.055) !important;
            }

            .rn-pricing-faq-list {
              display: grid;
              gap: 12px;
            }

            .rn-pricing-faq-item {
              background: #f8f7f4;
              border: 1px solid rgba(0,0,0,.07);
              border-radius: 20px;
              box-shadow: 0 12px 26px rgba(0,0,0,.04);
              overflow: hidden;
            }

            .rn-pricing-faq-summary {
              min-height: 62px;
              padding: 18px 20px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              color: rgba(0,0,0,.88);
              font-size: 17px;
              font-weight: 800;
              font-family: var(--font-heading);
              list-style: none;
            }

            .rn-pricing-faq-summary::-webkit-details-marker {
              display: none;
            }

            .rn-pricing-faq-chevron {
              flex: 0 0 auto;
              transition: transform .18s ease;
            }

            .rn-pricing-faq-item[open] .rn-pricing-faq-chevron {
              transform: rotate(180deg);
            }

            .rn-pricing-faq-answer {
              margin: 0;
              padding: 0 20px 20px 52px;
              color: rgba(0,0,0,.62);
              font-size: 14.5px;
              line-height: 1.65;
              font-weight: 700;
              font-family: var(--font-body);
            }

            @media (max-width: 900px) {
              .rn-pricing-hero,
              .rn-pricing-main,
              .rn-pricing-feature-grid {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 640px) {
              .rn-pricing-hero h1 {
                font-size: 42px !important;
              }

              .rn-pricing-faq-summary {
                align-items: flex-start;
                padding: 16px;
              }

              .rn-pricing-faq-answer {
                padding: 0 16px 18px 48px;
              }
            }
          `,
        }}
      />
    </main>
  );
}

function SectionHeader({ title, tone = "default" }: { title: string; tone?: "default" | "light" }) {
  return (
    <h2
      style={{
        margin: 0,
        color: tone === "light" ? "#fff" : "#35806e",
        fontSize: 28,
        lineHeight: 1.15,
        fontFamily: "var(--font-heading)",
      }}
    >
      {title}
    </h2>
  );
}

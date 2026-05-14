import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Check,
  Clock3,
  HelpCircle,
  PauseCircle,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";

export const metadata = buildPageMetadata({
  title: "Simple Pricing for Restaurant Hiring",
  description:
    "Start with a 30-day free trial, pay $9 per active approved restaurant job ad every 30 days, and pause or cancel anytime.",
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
    border: `1px solid ${BORDER}`,
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 18px 40px rgba(0,0,0,.08)",
  };

  const whiteCard: React.CSSProperties = {
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

  const includedItems = [
    "30-day free trial",
    "No charge today",
    "$9 per active approved job ad every 30 days",
    "Cancel anytime",
    "Only active approved public ads are billed",
    "Jobs auto-pause after 30 days",
    "Pause/remove jobs anytime",
    "Google Jobs optimized",
    "Employer dashboard included",
  ];

  const faqItems = [
    {
      question: "What is billed after the free trial?",
      answer:
        "After the 30-day free trial, pricing is $9 per active approved public job ad every 30 days. Pending, paused, rejected, removed, or private ads are not billed.",
    },
    {
      question: "Will I be charged today?",
      answer:
        "No. You can create an employer account and submit your first job during the trial without a charge today.",
    },
    {
      question: "What happens after 30 days?",
      answer:
        "Approved job ads automatically pause after 30 days. You can manage, pause, remove, or reactivate listings from the employer dashboard.",
    },
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. Pause or remove jobs anytime from your dashboard. Only active approved public ads count toward billing.",
    },
  ];

  return (
    <main style={pageWrap}>
      <div style={container}>
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div className="rn-pricing-hero">
            <div>
              <div style={iconWrap(true)}>
                <BadgeDollarSign size={22} color={GREEN} />
              </div>

              <p
                style={{
                  margin: "0 0 10px",
                  color: MUTED,
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
                  fontSize: 58,
                  lineHeight: 0.98,
                  fontWeight: 700,
                  color: GREEN,
                  fontFamily: "var(--font-heading)",
                }}
              >
                Simple Pricing for Restaurant Hiring
              </h1>

              <p
                style={{
                  marginTop: 16,
                  marginBottom: 0,
                  maxWidth: 720,
                  color: MUTED,
                  lineHeight: 1.65,
                  fontSize: 18,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Start with a 30-day free trial. There is no charge today, and only active approved
                public job ads are billed after approval.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
                <Link href="/employer-login?next=/post-job" style={primaryBtn} className="rn-btn-primary">
                  Start Your Free Trial
                </Link>
                <Link href="/employer-dashboard" style={secondaryBtn} className="rn-btn-secondary">
                  Manage Jobs
                </Link>
              </div>
            </div>

            <aside style={whiteCard} aria-label="Pricing summary">
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: GREEN,
                  fontWeight: 900,
                  fontFamily: "var(--font-body)",
                }}
              >
                <ShieldCheck size={18} /> 30-day free trial
              </div>

              <div
                style={{
                  marginTop: 16,
                  color: TEXT,
                  fontFamily: "var(--font-heading)",
                  fontSize: 48,
                  lineHeight: 1,
                  fontWeight: 800,
                }}
              >
                $9
                <span
                  style={{
                    color: MUTED,
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    fontWeight: 800,
                    marginLeft: 8,
                  }}
                >
                  / active approved ad / 30 days
                </span>
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: MUTED,
                  fontSize: 15,
                  lineHeight: 1.55,
                  fontWeight: 700,
                  fontFamily: "var(--font-body)",
                }}
              >
                No charge today. Jobs auto-pause after 30 days so you stay in control of what is
                public and billable.
              </div>
            </aside>
          </div>
        </section>

        <section className="rn-pricing-main" style={{ marginBottom: 18 }}>
          <div style={cardStyle}>
            <SectionHeader title="What You Get" />
            <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
              {includedItems.map((item) => (
                <div key={item} style={checkRow}>
                  <Check size={18} color={GREEN} style={{ marginTop: 2 }} />
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
                  icon: <Clock3 size={20} color={GREEN} />,
                  title: "Trial-first",
                  body: "Create an employer account and submit jobs for review before paid billing starts.",
                },
                {
                  icon: <PauseCircle size={20} color={GREEN} />,
                  title: "Pause anytime",
                  body: "Listings can be paused or removed from the dashboard when the role is filled.",
                },
                {
                  icon: <SearchCheck size={20} color={GREEN} />,
                  title: "Google Jobs optimized",
                  body: "Public approved jobs include structured job data for search visibility.",
                },
                {
                  icon: <BriefcaseBusiness size={20} color={GREEN} />,
                  title: "Dashboard included",
                  body: "Employers can review listing status, manage ads, and reactivate roles in one place.",
                },
              ].map((feature) => (
                <div key={feature.title} style={whiteCard}>
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

        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <SectionHeader title="FAQ" />
          <div className="rn-pricing-faq-grid" style={{ marginTop: 18 }}>
            {faqItems.map((item) => (
              <article key={item.question} style={whiteCard}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <HelpCircle size={20} color={GREEN} style={{ flex: "0 0 auto", marginTop: 2 }} />
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        color: TEXT,
                        fontSize: 17,
                        fontFamily: "var(--font-heading)",
                      }}
                    >
                      {item.question}
                    </h3>
                    <p
                      style={{
                        margin: "8px 0 0",
                        color: MUTED,
                        fontSize: 14,
                        lineHeight: 1.6,
                        fontWeight: 700,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {item.answer}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={cardStyle}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <SectionHeader title="Ready To Hire Restaurant Staff?" />
            <p
              style={{
                margin: "12px auto 0",
                color: TEXT,
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
              <Link href="/employer-login?next=/post-job" style={primaryBtn} className="rn-btn-primary">
                Post Your First Job Free
              </Link>
              <Link href="/contact" style={secondaryBtn} className="rn-btn-secondary">
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
              grid-template-columns: 1.2fr .8fr;
              gap: 18px;
              align-items: stretch;
            }

            .rn-pricing-main {
              display: grid;
              grid-template-columns: .9fr 1.1fr;
              gap: 18px;
            }

            .rn-pricing-feature-grid,
            .rn-pricing-faq-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
            }

            @media (max-width: 900px) {
              .rn-pricing-hero,
              .rn-pricing-main,
              .rn-pricing-feature-grid,
              .rn-pricing-faq-grid {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 640px) {
              .rn-pricing-hero h1 {
                font-size: 42px !important;
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
    <h2
      style={{
        margin: 0,
        color: "#35806e",
        fontSize: 28,
        lineHeight: 1.15,
        fontFamily: "var(--font-heading)",
      }}
    >
      {title}
    </h2>
  );
}

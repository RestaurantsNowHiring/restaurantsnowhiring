"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Mail,
  BriefcaseBusiness,
  CircleHelp,
  ArrowRight,
  ShieldCheck,
  Send,
} from "lucide-react";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

export default function ContactPage() {
  const GREEN = homeTheme.green;
  const BG = homeTheme.bg;
  const BORDER = homeTheme.border;
  const TEXT = homeTheme.text;
  const MUTED = homeTheme.muted;
  const ERROR = "#b00020";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data?.error || "Something went wrong. Please try again.");
        return;
      }

      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setShowSuccessModal(true);
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
    ...homeCardStyle,
  };

  const smallCard: React.CSSProperties = {
    backgroundColor: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 10px 22px rgba(0,0,0,.05)",
  };

  const primaryBtn: React.CSSProperties = {
    ...homePrimaryButton,
    gap: 8,
  };

  const secondaryBtn: React.CSSProperties = {
    ...homeSecondaryButton,
    gap: 8,
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

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    color: TEXT,
    fontSize: 14,
    fontWeight: 900,
    fontFamily: "var(--font-body)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 52,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    backgroundColor: "#fff",
    padding: "0 14px",
    outline: "none",
    color: TEXT,
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.04)",
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 170,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    backgroundColor: "#fff",
    padding: "14px",
    outline: "none",
    color: TEXT,
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.04)",
    resize: "vertical" as const,
  };

  return (
    <main style={pageWrap}>
      <div style={container}>
        {/* HERO */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div className="rn-contact-hero">
            <div>
              <div style={iconWrap(true)}>
                <Mail size={22} color={GREEN} />
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
                Contact
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
                Questions, feedback, or help with a listing? Send us a message and we’ll get back to
                you.
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
                Good reasons to reach out
              </div>

              <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                {[
                  {
                    icon: <BriefcaseBusiness size={18} color={GREEN} />,
                    title: "Employer help",
                    body: "Posting jobs, employer accounts, listing edits, or review questions.",
                  },
                  {
                    icon: <CircleHelp size={18} color={GREEN} />,
                    title: "General questions",
                    body: "How the site works, feature requests, or anything confusing.",
                  },
                  {
                    icon: <ShieldCheck size={18} color={GREEN} />,
                    title: "Listing concerns",
                    body: "Report inaccurate information or something that needs review.",
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

        {/* MAIN CONTACT SECTION */}
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <div className="rn-contact-form-grid">
            {/* LEFT */}
            <div>
              <SectionHeader title="Send A Message" align="left" />

              <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
                <div className="rn-contact-two-col">
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      required
                      style={inputStyle}
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Email *</label>
                    <input
                      required
                      type="email"
                      style={inputStyle}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Subject *</label>
                  <input
                    required
                    style={inputStyle}
                    placeholder="Employer question, listing issue, feedback, etc."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Message *</label>
                  <textarea
                    required
                    style={textareaStyle}
                    placeholder="Tell us what you need help with."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                {errorMessage && (
                  <div
                    style={{
                      color: ERROR,
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      ...primaryBtn,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.75 : 1,
                    }}
                  >
                    <Send size={16} />
                    {isSubmitting ? "Sending..." : "Submit"}
                  </button>

                  <Link href="/jobs" style={secondaryBtn}>
                    Browse Jobs
                  </Link>
                </div>
              </form>
            </div>

            {/* RIGHT */}
            <div style={{ display: "grid", gap: 14 }}>
              <div style={smallCard}>
                <div className="rn-contact-card-title">Contact inbox</div>
                <div className="rn-contact-card-body">
                  Messages from this form are sent directly to:
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: `1px solid ${BORDER}`,
                    backgroundColor: "rgba(255,255,255,.58)",
                    color: TEXT,
                    fontSize: 15,
                    fontWeight: 900,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  Team@ReataurantsNOWHiring.com
                </div>
              </div>

              <div style={smallCard}>
                <div className="rn-contact-card-title">Helpful info to include</div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 10,
                    color: TEXT,
                    fontSize: 14,
                    lineHeight: 1.5,
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <div>• Your name and best email</div>
                  <div>• Company name, if you’re an employer</div>
                  <div>• Job title or listing details, if relevant</div>
                  <div>• A quick description of the issue or question</div>
                </div>
              </div>

              <div style={smallCard}>
                <div className="rn-contact-card-title">Common reasons people write in</div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  {[
                    "I need help posting a job.",
                    "I want to update or fix a listing.",
                    "A job listing looks inaccurate.",
                    "I have feedback about the site.",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: `1px solid ${BORDER}`,
                        backgroundColor: "rgba(255,255,255,.58)",
                        color: TEXT,
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section style={cardStyle}>
          <SectionHeader title="Need Something Else?" />

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
              You can also browse open listings or head back to the homepage.
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
              <Link href="/jobs" style={primaryBtn}>
                Browse Jobs
                <ArrowRight size={16} />
              </Link>
              <Link href="/" style={secondaryBtn}>
                Home
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

      {showSuccessModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "#ffffff",
              borderRadius: 24,
              border: `1px solid ${BORDER}`,
              boxShadow: "0 24px 60px rgba(0,0,0,.20)",
              padding: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 999,
                backgroundColor: "rgba(53,128,110,.12)",
                color: GREEN,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 900,
                margin: "0 auto 16px",
                fontFamily: "var(--font-body)",
              }}
            >
              ✓
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: 30,
                lineHeight: 1.05,
                color: "rgba(0,0,0,.88)",
                fontFamily: "var(--font-heading)",
              }}
            >
              Message sent
            </h2>

            <p
              style={{
                marginTop: 14,
                marginBottom: 0,
                color: "rgba(0,0,0,.68)",
                fontSize: 15,
                lineHeight: 1.6,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Thanks for reaching out. Your message was submitted successfully.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 22,
              }}
            >
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                style={{
                  ...primaryBtn,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            .rn-contact-hero {
              display: grid;
              grid-template-columns: 1.15fr .85fr;
              gap: 18px;
              align-items: stretch;
            }

            .rn-contact-form-grid {
              display: grid;
              grid-template-columns: 1.1fr .9fr;
              gap: 18px;
            }

            .rn-contact-two-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 14px;
            }

            .rn-contact-card-title {
              font-weight: 900;
              font-size: 18px;
              color: ${TEXT};
              font-family: var(--font-body);
              margin-bottom: 10px;
            }

            .rn-contact-card-body {
              color: ${MUTED};
              line-height: 1.6;
              font-weight: 700;
              font-family: var(--font-body);
              font-size: 15px;
            }

            @media (max-width: 980px) {
              .rn-contact-hero,
              .rn-contact-form-grid,
              .rn-contact-two-col {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

function SectionHeader({
  title,
  align = "center",
}: {
  title: string;
  align?: "center" | "left";
}) {
  if (align === "left") {
    return (
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "rgba(0,0,0,.88)",
            fontFamily: "var(--font-heading)",
          }}
        >
          {title}
        </div>
      </div>
    );
  }

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
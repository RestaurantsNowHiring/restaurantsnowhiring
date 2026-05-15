"use client";

import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CircleHelp,
  FilePenLine,
  Flag,
  Mail,
  Send,
} from "lucide-react";
import {
  homeCardStyle,
  homePrimaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

export default function ContactPage() {
  const GREEN = homeTheme.green;
  const BG = homeTheme.bg;
  const CARD = homeTheme.card;
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
  const successDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSuccessModal) return;
    successDialogRef.current?.focus();
  }, [showSuccessModal]);

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setShowSuccessModal(false);
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = successDialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || !trimmedEmail || !trimmedSubject || !trimmedMessage) {
      setErrorMessage("Please fill out your name, email, subject, and message.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
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

  const heroCard: React.CSSProperties = {
    ...homeCardStyle,
    borderRadius: 28,
    padding: "clamp(30px, 5vw, 58px)",
    marginBottom: 24,
    boxShadow: "0 20px 44px rgba(0,0,0,.08)",
  };

  const formCard: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 28,
    padding: "clamp(24px, 4vw, 38px)",
    boxShadow: "0 18px 42px rgba(0,0,0,.10)",
  };

  const supportCard: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: `1px solid rgba(53,128,110,.16)`,
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 14px 32px rgba(0,0,0,.06)",
  };

  const primaryBtn: React.CSSProperties = {
    ...homePrimaryButton,
    gap: 8,
    minHeight: 54,
    width: "100%",
    borderRadius: 16,
    fontSize: 16,
  };

  const iconWrap = (size = 46): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(53,128,110,.12)",
    border: "1px solid rgba(53,128,110,.18)",
    color: GREEN,
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 9,
    color: TEXT,
    fontSize: 14,
    fontWeight: 900,
    fontFamily: "var(--font-body)",
  };

  const fieldBase: React.CSSProperties = {
    width: "100%",
    borderRadius: 16,
    border: `1px solid ${BORDER}`,
    backgroundColor: "#fff",
    outline: "none",
    color: TEXT,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.035)",
  };

  const inputStyle: React.CSSProperties = {
    ...fieldBase,
    height: 58,
    padding: "0 16px",
  };

  const textareaStyle: React.CSSProperties = {
    ...fieldBase,
    minHeight: 190,
    padding: "16px",
    resize: "vertical" as const,
    lineHeight: 1.55,
  };

  const supportItems = [
    { icon: BriefcaseBusiness, label: "Employer support" },
    { icon: FilePenLine, label: "Listing updates" },
    { icon: CircleHelp, label: "General questions" },
    { icon: Flag, label: "Report a listing" },
  ];

  return (
    <main style={pageWrap}>
      <div style={container}>
        <section style={heroCard}>
          <div className="rn-contact-hero-clean">
            <div style={iconWrap(52)}>
              <Mail aria-hidden="true" size={25} />
            </div>

            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(46px, 7vw, 68px)",
                  lineHeight: 0.96,
                  fontWeight: 700,
                  color: GREEN,
                  fontFamily: "var(--font-heading)",
                }}
              >
                Contact Us
              </h1>

              <p
                style={{
                  marginTop: 16,
                  marginBottom: 0,
                  maxWidth: 790,
                  color: MUTED,
                  lineHeight: 1.65,
                  fontSize: 18,
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                Questions, employer support, listing updates, or feedback? Send us a message and
                we’ll get back to you.
              </p>
            </div>
          </div>
        </section>

        <section className="rn-contact-layout" aria-label="Contact form and support information">
          <div style={formCard}>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  color: GREEN,
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: 0.4,
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                Send a message
              </div>
              <h2
                style={{
                  margin: 0,
                  color: TEXT,
                  fontFamily: "var(--font-heading)",
                  fontSize: "clamp(30px, 4vw, 42px)",
                  fontWeight: 700,
                  lineHeight: 1.02,
                }}
              >
                How can we help?
              </h2>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
              <div className="rn-contact-two-col">
                <div>
                  <label htmlFor="contact-name" style={labelStyle}>
                    Name *
                  </label>
                  <input
                    id="contact-name"
                    required
                    aria-invalid={!!errorMessage && !name.trim()}
                    aria-describedby={errorMessage ? "contact-form-error" : undefined}
                    style={inputStyle}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="contact-email" style={labelStyle}>
                    Email *
                  </label>
                  <input
                    id="contact-email"
                    required
                    aria-invalid={!!errorMessage && !email.trim()}
                    aria-describedby={errorMessage ? "contact-form-error" : undefined}
                    type="email"
                    style={inputStyle}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" style={labelStyle}>
                  Subject *
                </label>
                <input
                  id="contact-subject"
                  required
                  aria-invalid={!!errorMessage && !subject.trim()}
                  aria-describedby={errorMessage ? "contact-form-error" : undefined}
                  style={inputStyle}
                  placeholder="Employer question, listing issue, feedback, etc."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="contact-message" style={labelStyle}>
                  Message *
                </label>
                <textarea
                  id="contact-message"
                  required
                  aria-invalid={!!errorMessage && !message.trim()}
                  aria-describedby={errorMessage ? "contact-form-error" : undefined}
                  style={textareaStyle}
                  placeholder="Tell us what you need help with."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {errorMessage && (
                <div
                  id="contact-form-error"
                  role="alert"
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

              <button
                className="rn-btn-primary"
                type="submit"
                disabled={isSubmitting}
                style={{
                  ...primaryBtn,
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.75 : 1,
                }}
              >
                <Send size={17} aria-hidden="true" />
                {isSubmitting ? "Sending..." : "Submit"}
              </button>
            </form>
          </div>

          <aside style={supportCard} aria-label="Support information">
            <div style={{ ...iconWrap(48), marginBottom: 18 }}>
              <Mail aria-hidden="true" size={22} />
            </div>

            <h2
              style={{
                margin: 0,
                color: TEXT,
                fontFamily: "var(--font-heading)",
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              Support info
            </h2>

            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                color: MUTED,
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1.65,
                fontFamily: "var(--font-body)",
              }}
            >
              Use this form for account help, listing changes, site questions, or anything that
              needs our team’s review.
            </p>

            <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
              {supportItems.map(({ icon: Icon, label }) => (
                <div className="rn-support-row" key={label}>
                  <span style={iconWrap(38)}>
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="rn-support-detail-card">
              <div className="rn-support-detail-label">Email</div>
              <div className="rn-support-detail-value">team@restaurantsnowhiring.com</div>
            </div>

            <div className="rn-support-detail-card rn-support-response-card">
              <div className="rn-support-detail-label">Typical response</div>
              <div className="rn-support-detail-value">Within 1 business day</div>
            </div>
          </aside>
        </section>

        <footer
          style={{
            marginTop: 24,
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
          role="presentation"
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
            ref={successDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-success-title"
            aria-describedby="contact-success-description"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
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
              id="contact-success-title"
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
              id="contact-success-description"
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
                className="rn-btn-primary"
                type="button"
                onClick={() => setShowSuccessModal(false)}
                style={{
                  ...homePrimaryButton,
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
        dangerouslySetInnerHTML={{
          __html: `
            .rn-contact-hero-clean {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 22px;
              align-items: center;
            }

            .rn-contact-layout {
              display: grid;
              grid-template-columns: minmax(0, 1.45fr) minmax(300px, .72fr);
              gap: 24px;
              align-items: start;
            }

            .rn-contact-two-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
            }

            .rn-support-row {
              display: grid;
              grid-template-columns: 38px minmax(0, 1fr);
              gap: 12px;
              align-items: center;
              color: ${TEXT};
              font-family: var(--font-body);
              font-size: 15px;
              font-weight: 900;
            }

            .rn-support-detail-card {
              margin-top: 22px;
              padding: 16px;
              border-radius: 18px;
              background: rgba(246,245,243,.82);
              border: 1px solid rgba(53,128,110,.14);
            }

            .rn-support-response-card {
              margin-top: 12px;
            }

            .rn-support-detail-label {
              color: ${MUTED};
              font-family: var(--font-body);
              font-size: 12px;
              font-weight: 900;
              letter-spacing: .35px;
              margin-bottom: 6px;
              text-transform: uppercase;
            }

            .rn-support-detail-value {
              color: ${TEXT};
              font-family: var(--font-body);
              font-size: 15px;
              font-weight: 900;
              line-height: 1.45;
              overflow-wrap: anywhere;
            }

            @media (max-width: 980px) {
              .rn-contact-layout,
              .rn-contact-two-col {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 640px) {
              .rn-contact-hero-clean {
                grid-template-columns: 1fr;
                gap: 18px;
              }
            }
          `,
        }}
      />
    </main>
  );
}

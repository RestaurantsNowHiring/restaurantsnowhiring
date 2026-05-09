import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Learn how Restaurants Now Hiring handles employer accounts, job listings, contact messages, and platform data.",
  path: "/privacy",
});

const privacySections = [
  {
    title: "Information We Collect",
    body: "We may collect information submitted through the platform, such as employer account details, job listing content, contact form submissions, email addresses, and basic authentication-related information.",
  },
  {
    title: "How We Use Information",
    body: "We use information to provide and improve the platform, create and manage employer accounts, publish and moderate job listings, respond to messages, send account-related emails, and support platform security.",
  },
  {
    title: "Third-Party Services",
    body: "RestaurantsNowHiring.com currently uses third-party services including Supabase for authentication and data storage, Resend for email delivery, and Google Workspace for business communications.",
  },
  {
    title: "Cookies and Authentication",
    body: "The platform may use cookies or similar browser storage to support authentication, sessions, security, and core site functionality.",
  },
  {
    title: "Data Sharing",
    body: "We may share information with service providers that help operate the platform, when needed to provide requested functionality, or when required by applicable law.",
  },
  {
    title: "Public Job Listings",
    body: "Information included in approved job listings may be publicly visible on RestaurantsNowHiring.com, including employer names, job details, locations, and application instructions provided by the employer.",
  },
  {
    title: "Security",
    body: "We use reasonable MVP-stage safeguards intended to protect platform information, but no website, hosting provider, or transmission method can be guaranteed to be completely secure.",
  },
  {
    title: "Children’s Privacy",
    body: "RestaurantsNowHiring.com is intended for employer hiring activity and job seeker use by individuals old enough to work in restaurant roles. The platform is not directed to children.",
  },
  {
    title: "Changes to Privacy Policy",
    body: "This temporary Privacy Policy may be updated as the platform evolves and after review by legal counsel. Updates will be reflected on this page.",
  },
  {
    title: "Contact",
    body: "Questions about this temporary Privacy Policy can be sent to team@restaurantsnowhiring.com.",
  },
];

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: homeTheme.bg,
        color: homeTheme.text,
        paddingTop: 110,
        paddingBottom: 80,
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, padding: 28, marginBottom: 18 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid rgba(53,128,110,0.18)",
              backgroundColor: "rgba(53,128,110,0.08)",
              color: homeTheme.green,
              fontWeight: 900,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            Temporary MVP privacy policy
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 56,
              lineHeight: 0.98,
              fontWeight: 700,
              color: homeTheme.green,
              fontFamily: "var(--font-heading)",
            }}
          >
            Privacy Policy
          </h1>

          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              maxWidth: 760,
              color: homeTheme.muted,
              lineHeight: 1.65,
              fontSize: 17,
              fontFamily: "var(--font-body)",
              fontWeight: 700,
            }}
          >
            This temporary privacy policy explains the basic MVP data practices for
            RestaurantsNowHiring.com and is designed to be easy for legal counsel to revise.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <Link href="/terms" style={homePrimaryButton} className="rn-btn-primary">
              View Terms & Conditions
            </Link>
            <Link href="/contact" style={homeSecondaryButton} className="rn-btn-secondary">
              Contact Us
            </Link>
          </div>
        </section>

        <section
          style={{
            ...homeCardStyle,
            display: "grid",
            gap: 14,
            backgroundColor: "#fff",
          }}
        >
          {privacySections.map((section) => (
            <article
              key={section.title}
              style={{
                border: `1px solid ${homeTheme.border}`,
                borderRadius: 16,
                padding: 18,
                backgroundColor: "#f6f5f3",
              }}
            >
              <h2
                style={{
                  margin: "0 0 8px 0",
                  color: homeTheme.text,
                  fontSize: 20,
                  fontWeight: 900,
                  fontFamily: "var(--font-body)",
                }}
              >
                {section.title}
              </h2>
              <p
                style={{
                  margin: 0,
                  maxWidth: "none",
                  color: homeTheme.muted,
                  lineHeight: 1.65,
                  fontSize: 15,
                  fontWeight: 650,
                  fontFamily: "var(--font-body)",
                }}
              >
                {section.body}
              </p>
            </article>
          ))}

          <div
            style={{
              border: "1px solid rgba(53,128,110,0.22)",
              borderRadius: 16,
              padding: 18,
              backgroundColor: "rgba(53,128,110,0.08)",
              color: homeTheme.text,
              fontWeight: 800,
              fontFamily: "var(--font-body)",
              lineHeight: 1.6,
            }}
          >
            Note: This temporary privacy policy is subject to review and revision by legal counsel.
          </div>
        </section>
      </div>
    </main>
  );
}

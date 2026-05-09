import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

export const metadata = buildPageMetadata({
  title: "Terms and Conditions",
  description:
    "Review the Restaurants Now Hiring terms for restaurant employers, job seekers, listings, moderation, and platform use.",
  path: "/terms",
});

const termsSections = [
  {
    title: "Acceptance of Terms",
    body: "By accessing or using RestaurantsNowHiring.com, you agree to these temporary Terms & Conditions. If you do not agree, please do not use the platform.",
  },
  {
    title: "Platform Description",
    body: "RestaurantsNowHiring.com is an MVP job listing platform intended to help restaurant employers publish openings and help job seekers discover restaurant hiring opportunities.",
  },
  {
    title: "Employer Responsibilities",
    body: "Employers are responsible for the accuracy, completeness, and legality of the information they submit, including job titles, descriptions, requirements, application instructions, and company details.",
  },
  {
    title: "Prohibited Content",
    body: "Users may not submit content that is false, misleading, discriminatory, unlawful, abusive, spam-like, unrelated to restaurant hiring, or otherwise inappropriate for a professional job listing platform.",
  },
  {
    title: "Account Security",
    body: "Account holders are responsible for maintaining the confidentiality of their login credentials and for activity that occurs under their account.",
  },
  {
    title: "Job Listing Moderation",
    body: "RestaurantsNowHiring.com may review, edit, reject, pause, or remove job listings or accounts that appear incomplete, inaccurate, inappropriate, or inconsistent with the purpose of the platform.",
  },
  {
    title: "No Employment Guarantee",
    body: "RestaurantsNowHiring.com does not guarantee that employers will receive applicants, that job seekers will obtain employment, or that any hiring outcome will occur through use of the platform.",
  },
  {
    title: "Service Availability",
    body: "The platform is provided as an MVP and may change, experience interruptions, or become unavailable while features are tested, improved, or maintained.",
  },
  {
    title: "Limitation of Liability",
    body: "To the extent permitted by applicable law, RestaurantsNowHiring.com is not responsible for indirect, incidental, consequential, or other damages arising from use of, or inability to use, the platform.",
  },
  {
    title: "Future Paid Services",
    body: "RestaurantsNowHiring.com may introduce optional paid services in the future. Any paid features will be presented with separate details before they are made available for use.",
  },
  {
    title: "Changes to Terms",
    body: "These temporary Terms & Conditions may be updated as the platform evolves and after review by legal counsel. Continued use of the platform after updates means you accept the revised terms.",
  },
  {
    title: "Contact",
    body: "Questions about these temporary Terms & Conditions can be sent to team@restaurantsnowhiring.com.",
  },
];

export default function TermsPage() {
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
            Temporary MVP terms
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
            Terms & Conditions
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
            These temporary terms are intended for the RestaurantsNowHiring.com MVP and are kept
            simple so legal counsel can review and revise them later.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <Link href="/privacy" style={homePrimaryButton} className="rn-btn-primary">
              View Privacy Policy
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
          {termsSections.map((section) => (
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
            Note: These temporary terms are subject to review and revision by legal counsel.
          </div>
        </section>
      </div>
    </main>
  );
}

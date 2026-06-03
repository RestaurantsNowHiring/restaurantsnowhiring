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
    "Learn how Restaurants Now Hiring handles employer account data, team member details, job postings, candidate submissions, payments, analytics, and service providers.",
  path: "/privacy",
});

const lastUpdated = "June 3, 2026";
const contactEmail = "team@restaurantsnowhiring.com";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const privacySections: LegalSection[] = [
  {
    title: "1. Information We Collect",
    paragraphs: [
      "We collect information that users provide directly, information generated through use of the service, and limited technical information collected automatically or through service providers.",
    ],
    bullets: [
      "Employer account information, such as names, login emails, company details, phone numbers, account settings, and support or contact email addresses.",
      "Team member information, such as invited user names, emails, roles, permissions, invitation status, and account activity related to employer team access.",
      "Store, location, job posting, and job template information, such as restaurant names, addresses, job titles, job descriptions, schedules, compensation details provided by employers, candidate routing emails, and application instructions.",
      "Candidate submission and contact information, such as a candidate’s name, email, phone number, message, job of interest, submission status, and related communications.",
      "Payment and subscription information handled by Stripe, such as checkout sessions, subscription status, plan details, customer identifiers, invoices, payment status, and limited payment metadata. We do not intend to store full credit card numbers on RestaurantsNowHiring.com servers.",
      "Technical, device, and usage information, such as IP address, browser type, device information, pages viewed, referring pages, timestamps, logs, errors, security events, and analytics events.",
    ],
  },
  {
    title: "2. How We Use Information",
    paragraphs: [
      "We use information to operate, maintain, secure, and improve RestaurantsNowHiring.com and to provide the features requested by employers, candidates, and visitors.",
    ],
    bullets: [
      "Provide the service and core website functionality.",
      "Create, authenticate, and manage employer accounts and team access.",
      "Create, review, publish, display, pause, remove, and manage job ads, store details, and job templates.",
      "Route candidate interest and contact information to the employer that posted the job or to the employer-designated routing email.",
      "Process paid job ads, subscriptions, trials, renewals, cancellations, invoices, and billing support through Stripe.",
      "Send transactional emails, including account, password, invitation, contact, job, billing, candidate submission, and service-related messages.",
      "Debug errors, monitor performance, improve user experience, protect security, prevent misuse, conduct basic analytics, and comply with legal, billing, tax, or operational obligations.",
    ],
  },
  {
    title: "3. How Information Is Shared",
    paragraphs: [
      "We share information when needed to provide the service, support requested features, operate the business, or comply with legal and safety obligations.",
    ],
    bullets: [
      "Candidate submissions may be shared with the employer that posted the job, employer account users, and employer-designated routing emails. The posting employer may use that information for its own hiring communications and decisions.",
      "Public job ad information may be displayed on RestaurantsNowHiring.com and may be visible to visitors and search engines.",
      "Service providers may process information for us, including Stripe for payments, Supabase for authentication and database services, hosting providers, email delivery providers, analytics providers such as Vercel Analytics or similar basic website analytics tools, security tools, and business operations providers.",
      "We may share information if we believe disclosure is necessary to comply with law, legal process, billing or tax obligations, safety needs, security investigations, fraud prevention, or enforcement of our Terms of Service.",
      "Information may be disclosed or transferred in connection with a merger, acquisition, financing, reorganization, sale of assets, bankruptcy, or similar business transaction involving RestaurantsNowHiring.com.",
    ],
  },
  {
    title: "4. Payment Processing",
    paragraphs: [
      "Payments, subscriptions, trials, renewals, cancellations, invoices, and payment methods are processed by Stripe. RestaurantsNowHiring.com may receive limited payment and subscription details from Stripe so we can activate paid features, provide billing support, reconcile subscriptions, and maintain account status.",
      "RestaurantsNowHiring.com should not receive or store full credit card numbers through the app. Stripe’s handling of payment information is governed by Stripe’s own privacy practices, available at https://stripe.com/privacy.",
    ],
  },
  {
    title: "5. Cookies and Analytics",
    paragraphs: [
      "RestaurantsNowHiring.com may use cookies, local storage, or similar technologies for authentication, sessions, security, preferences, and core site functionality.",
      "We may also use basic website analytics, including Vercel Analytics or similar tools, to understand site usage, performance, and errors. Browser or device settings may allow users to limit certain cookies or tracking technologies, but some site features may not work correctly without required session or authentication storage.",
    ],
  },
  {
    title: "6. Data Retention",
    paragraphs: [
      "We retain information for as long as reasonably needed to provide the service, maintain employer accounts and job records, route and manage candidate submissions, support billing and subscriptions, comply with legal, tax, accounting, security, and business obligations, resolve disputes, and enforce agreements.",
      "Retention periods may vary depending on the type of information, account status, legal requirements, backup schedules, and operational needs. We may retain limited records after account closure where needed for legitimate business, legal, billing, security, or audit purposes.",
    ],
  },
  {
    title: "7. Security",
    paragraphs: [
      "We use reasonable administrative, technical, and organizational safeguards intended to protect information. However, no website, app, database, payment processor, hosting provider, email system, or internet transmission can be guaranteed to be perfectly secure.",
      "Users are responsible for using strong passwords, protecting account credentials, and limiting team access to authorized personnel.",
    ],
  },
  {
    title: "8. User Choices and Privacy Rights",
    paragraphs: [
      "Users may contact us to request account assistance or to ask to access, correct, update, delete, or receive information about personal information associated with their account or submission. We may need to verify the request and may retain information where permitted or required for legal, billing, security, or operational reasons.",
      "Depending on where a user lives, state privacy laws may provide rights to know, access, correct, delete, obtain a copy of, or opt out of certain uses of personal information. California residents may have rights under California privacy laws if those laws apply to the business and the relevant data. This Policy does not represent that RestaurantsNowHiring.com currently meets any specific California Consumer Privacy Act threshold or that every state privacy law applies in every situation.",
      "To make a request, contact us at the email below. We will review requests and respond as required by applicable law.",
    ],
  },
  {
    title: "9. Children’s Privacy",
    paragraphs: [
      "RestaurantsNowHiring.com is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information through the service, please contact us so we can review and take appropriate action.",
    ],
  },
  {
    title: "10. Third-Party Links and Employers",
    paragraphs: [
      "Job postings, application instructions, employer communications, and site pages may link to employer websites, third-party application systems, maps, payment pages, or other third-party services. Those third parties have their own privacy policies and practices.",
      "RestaurantsNowHiring.com is not the employer and does not control how an employer uses candidate information after it is shared with the posting employer or employer-designated contact.",
    ],
  },
  {
    title: "11. Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy as the service, business model, legal requirements, service providers, or data practices change. When we update this Policy, we will revise the Last updated date above.",
      "Continued use of the service after an updated Policy is posted means the updated Policy applies to information collected or processed after the effective date, subject to applicable law.",
    ],
  },
  {
    title: "12. Contact Information",
    paragraphs: [
      `Questions, account assistance requests, cancellation assistance requests, or privacy requests can be sent to ${contactEmail}.`,
    ],
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
            Last updated: {lastUpdated}
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
              maxWidth: 800,
              color: homeTheme.muted,
              lineHeight: 1.65,
              fontSize: 17,
              fontFamily: "var(--font-body)",
              fontWeight: 700,
            }}
          >
            This Policy is provided for general informational purposes and should be reviewed by
            qualified legal counsel.
          </p>

          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              maxWidth: 800,
              color: homeTheme.muted,
              lineHeight: 1.65,
              fontSize: 16,
              fontFamily: "var(--font-body)",
              fontWeight: 650,
            }}
          >
            This Policy explains how RestaurantsNowHiring.com collects, uses, shares, retains, and
            protects information for employer accounts, job ads, candidate submissions, payments,
            analytics, and related website operations.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <Link href="/terms" style={homePrimaryButton} className="rn-btn-primary">
              View Terms of Service
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
              {section.paragraphs?.map((paragraph) => (
                <p
                  key={paragraph}
                  style={{
                    margin: "0 0 10px 0",
                    maxWidth: "none",
                    color: homeTheme.muted,
                    lineHeight: 1.65,
                    fontSize: 15,
                    fontWeight: 650,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul
                  style={{
                    margin: "8px 0 0 20px",
                    padding: 0,
                    color: homeTheme.muted,
                    lineHeight: 1.65,
                    fontSize: 15,
                    fontWeight: 650,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {section.bullets.map((bullet) => (
                    <li key={bullet} style={{ marginBottom: 6 }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

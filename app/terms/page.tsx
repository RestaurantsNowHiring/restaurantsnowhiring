import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "Review the Restaurants Now Hiring terms for employer accounts, job advertising, candidate submissions, subscriptions, billing, and platform use.",
  path: "/terms",
});

const lastUpdated = "June 3, 2026";
const contactEmail = "team@restaurantsnowhiring.com";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const termsSections: LegalSection[] = [
  {
    title: "1. Acceptance of Terms",
    paragraphs: [
      "By accessing or using RestaurantsNowHiring.com, you agree to these Terms of Service. If you use the service on behalf of a restaurant, restaurant group, or other business, you represent that you have authority to bind that business to these Terms.",
      "If you do not agree to these Terms, do not use the service.",
    ],
  },
  {
    title: "2. Description of the Service",
    paragraphs: [
      "RestaurantsNowHiring.com is a restaurant job advertising platform. The service helps employers create accounts, manage team access, store business and location details, create job templates, post job ads, and route candidate interest to employer-designated contact emails.",
      "Candidates and other visitors may browse restaurant job ads and may submit interest or contact information for a specific job posting.",
    ],
  },
  {
    title: "3. RestaurantsNowHiring.com Is a Job Advertising Platform Only",
    paragraphs: [
      "RestaurantsNowHiring.com is not the employer for jobs advertised on the site. RestaurantsNowHiring.com is not a staffing agency, recruiting agency, recruiter, professional employer organization, background screening provider, payroll provider, or hiring decision-maker.",
      "Employers are solely responsible for their recruiting, interview, selection, hiring, onboarding, employment, and workplace decisions. We do not guarantee that any employer will respond to a candidate, interview a candidate, make a job offer, or hire any candidate.",
    ],
  },
  {
    title: "4. Employer Accounts and Team Access",
    paragraphs: [
      "Employers may create accounts and invite or manage team members where available. Employers are responsible for keeping login credentials secure, ensuring team members have appropriate authorization, and promptly removing access for anyone who should no longer use the account.",
      "Activity by team members or other users with access to an employer account may be treated as activity of that employer account.",
    ],
  },
  {
    title: "5. Employer Responsibilities",
    paragraphs: [
      "Employers are responsible for every job ad, store profile, template, routing email, communication, and other content submitted through their accounts.",
    ],
    bullets: [
      "Provide accurate, current, and complete job titles, descriptions, wages or compensation details where required, locations, schedules, requirements, and application instructions.",
      "Comply with all applicable federal, state, and local laws and regulations, including wage and hour laws, pay transparency laws, labor and employment laws, privacy laws, and recordkeeping obligations.",
      "Comply with equal employment opportunity and non-discrimination laws and avoid content or practices that discriminate against protected classes or otherwise violate law.",
      "Confirm that they have proper authorization to post on behalf of the restaurant, brand, franchise, location, or business named in the account or job ad.",
      "Handle candidate communications professionally, lawfully, and in accordance with their own hiring policies and legal obligations.",
    ],
  },
  {
    title: "6. Candidate and User Responsibilities",
    paragraphs: [
      "Candidates and other users are responsible for submitting accurate information, using the service lawfully, and deciding whether to communicate with or apply to any employer.",
      "Users may not interfere with the service, attempt unauthorized access, scrape or misuse data, impersonate another person or business, submit malicious code, or use the service for unlawful, deceptive, abusive, or spam-related purposes.",
    ],
  },
  {
    title: "7. Job Posting Content Rules",
    paragraphs: [
      "Job ads and related employer content must be truthful, job-related, and appropriate for a restaurant hiring platform.",
    ],
    bullets: [
      "Do not post false, misleading, discriminatory, unlawful, abusive, harassing, obscene, infringing, spam, or unrelated content.",
      "Do not post jobs for businesses or locations you are not authorized to represent.",
      "Do not include content that violates wage, hour, pay transparency, equal employment opportunity, privacy, consumer protection, or other applicable laws.",
      "RestaurantsNowHiring.com may review, reject, edit, pause, remove, or decline to display postings or accounts at any time when we believe doing so is appropriate for safety, quality, legal, operational, or platform integrity reasons.",
    ],
  },
  {
    title: "8. Candidate Submissions",
    paragraphs: [
      "When a candidate submits interest or contact information for a specific job, that information may be sent directly to the employer that posted the job or to the routing email designated by that employer. Candidate submissions may also be stored and displayed in employer account tools.",
      "RestaurantsNowHiring.com does not guarantee that a candidate submission will result in an employer response, interview, job offer, or employment relationship.",
    ],
  },
  {
    title: "9. Subscriptions, Billing, Trials, Renewals, Cancellation, and Refunds",
    paragraphs: [
      "RestaurantsNowHiring.com may offer paid job ads, subscriptions, trials, and other paid features. Payments and billing tools are processed by Stripe, and use of paid features may also be subject to Stripe’s terms, payment authorization flows, and payment method requirements.",
      "After the 30-day free trial, each approved active job listing is billed at $9 every 30 days and automatically renews for another 30-day listing period. Employers can prevent a listing's next renewal by pausing or removing it before the renewal date.",
      "Cancellation should be reasonably easy. Employers can cancel or manage billing through available account or billing portal tools when enabled, or by contacting us at the email below for account assistance. Cancellation will stop future renewals according to the applicable plan terms, but it may not reverse charges that have already been incurred.",
      "Fees are generally non-refundable unless a refund is required by law or expressly stated in the applicable offer, checkout flow, or written agreement. We may change prices or paid features prospectively, and we will provide notice where required by law or where the service flow indicates notice is appropriate.",
    ],
  },
  {
    title: "10. Account Suspension or Termination",
    paragraphs: [
      "We may suspend, restrict, or terminate access to the service, accounts, job postings, candidate routing, or paid features if we believe a user or employer has violated these Terms, created risk for the service, failed to pay amounts owed, misused the platform, or if suspension is needed for security, legal, operational, or platform integrity reasons.",
    ],
  },
  {
    title: "11. Intellectual Property",
    paragraphs: [
      "RestaurantsNowHiring.com, including its site design, branding, software, copy, graphics, and platform features, is owned by us or our licensors and is protected by intellectual property laws. These Terms do not transfer ownership of the service to users.",
      "Employers and users retain rights in content they submit, but they grant RestaurantsNowHiring.com a non-exclusive license to host, store, display, reproduce, transmit, and otherwise use that content as needed to operate, promote, secure, support, and improve the service.",
    ],
  },
  {
    title: "12. Disclaimers",
    paragraphs: [
      "The service is provided on an “as is” and “as available” basis. To the fullest extent permitted by law, RestaurantsNowHiring.com disclaims warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability, and reliability.",
      "We do not verify every employer, candidate, job posting, wage statement, hiring claim, or communication. Users should use their own judgment and conduct their own diligence before communicating, applying, interviewing, hiring, or accepting employment.",
    ],
  },
  {
    title: "13. Limitation of Liability",
    paragraphs: [
      "To the fullest extent permitted by law, RestaurantsNowHiring.com and its owners, operators, employees, contractors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; lost profits; lost data; lost business; hiring outcomes; employment disputes; or damages arising from employer or candidate conduct.",
      "To the fullest extent permitted by law, any aggregate liability arising from or related to the service or these Terms will be limited to the amount paid by the user or employer to RestaurantsNowHiring.com for the service giving rise to the claim during the three months before the claim arose, or one hundred dollars if no amount was paid.",
    ],
  },
  {
    title: "14. Indemnification",
    paragraphs: [
      "Employers and users agree to defend, indemnify, and hold harmless RestaurantsNowHiring.com and its owners, operators, employees, contractors, and service providers from claims, liabilities, damages, losses, and expenses, including reasonable attorneys’ fees, arising from their content, job postings, candidate communications, hiring or employment decisions, misuse of the service, violation of these Terms, or violation of applicable law or third-party rights.",
    ],
  },
  {
    title: "15. Changes to the Service or Terms",
    paragraphs: [
      "We may update, suspend, discontinue, or change parts of the service over time. We may also update these Terms as the service, business model, legal requirements, or operational needs change.",
      "When we update these Terms, we will revise the Last updated date above. Continued use of the service after updated Terms are posted means you accept the updated Terms.",
    ],
  },
  {
    title: "16. Governing Law",
    paragraphs: [
      "These Terms are governed by the laws of the State of Maryland, without regard to conflict of law rules, unless applicable law requires otherwise.",
    ],
  },
  {
    title: "17. Contact Information",
    paragraphs: [
      `Questions about these Terms or cancellation assistance can be sent to ${contactEmail}.`,
    ],
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
            Terms of Service
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
            These Terms are provided for general informational purposes and should be reviewed by
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
            These Terms describe how employers, candidates, and other users may use
            RestaurantsNowHiring.com as a restaurant job advertising platform.
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

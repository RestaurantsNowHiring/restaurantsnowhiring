import Link from "next/link";
import { buildPageMetadata } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Post Your First Job Free",
  description: "Start the Restaurants Now Hiring Free First Job eligibility process.",
  path: "/post-free",
  robots: { index: true, follow: true },
});

export default function PostFreeEntryPage() {
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "120px 20px 72px", color: "#263b35" }}>
    <section style={{ padding: 32, borderRadius: 18, background: "#fff", border: "1px solid #cddbd7" }}>
      <p style={{ color: "#35806e", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Free First Job</p>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 52, lineHeight: 1, margin: "8px 0 18px" }}>Post your first job free</h1>
      <p style={{ fontSize: 18, lineHeight: 1.65 }}>This is the universal starting point for the Free First Job application. The application form is coming next.</p>
      <p style={{ lineHeight: 1.65 }}>Visiting this page does not establish eligibility or publish a job. Every request will require email verification, server-side eligibility review, and RNH Admin approval before publication.</p>
      <Link href="/contact" style={{ display: "inline-block", marginTop: 10, color: "#286758", fontWeight: 850 }}>Questions? Contact RNH</Link>
    </section>
  </main>;
}

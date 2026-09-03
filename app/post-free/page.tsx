import { buildPageMetadata } from "../../lib/seo";
import PostFreeForm from "./PostFreeForm";

export const metadata = buildPageMetadata({ title: "Post Your First Job Free", description: "Post your restaurant's first job free for 30 days.", path: "/post-free", robots: { index: true, follow: true } });

export default function PostFreeEntryPage() {
  return <main style={{ minHeight: "100vh", padding: "120px 20px 72px", color: "#263b35", background: "#f2f7f4" }}>
    <section style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(22px, 5vw, 44px)", borderRadius: 18, background: "#fff", border: "1px solid #cddbd7", boxShadow: "0 16px 50px rgba(38,59,53,.12)" }}>
      <p style={{ color: "#35806e", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Free First Job</p>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px, 7vw, 58px)", lineHeight: 1, margin: "8px 0 18px" }}>Post Your First Job Free</h1>
      <p style={{ fontSize: 20, fontWeight: 750, lineHeight: 1.5 }}>No account required. No credit card. Your job can run free for 30 days.</p>
      <p style={{ fontSize: 17, lineHeight: 1.65, marginBottom: 30 }}>Complete the form below. We’ll ask you to verify your email before your job is submitted for review.</p>
      <PostFreeForm />
    </section>
  </main>;
}

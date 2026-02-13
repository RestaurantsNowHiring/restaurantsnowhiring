import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AboutPage() {
  // ✅ Theme tokens (match your newer pages)
  const GREEN = "#35806e";
  const BG = "#ffffff";
  const CARD = "#f6f5f3";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";

  const pageWrap: React.CSSProperties = {
    backgroundColor: BG,
    minHeight: "100vh",
    paddingTop: 90, // breathing room under TopBanner
    paddingBottom: 70,
  };

  const container: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 18px",
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginBottom: 18,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 56,
    lineHeight: 1.02,
    fontWeight: 700,
    letterSpacing: 0,
    color: GREEN,
    fontFamily: "var(--font-heading)",
  };

  const subtitleStyle: React.CSSProperties = {
    marginTop: 10,
    marginBottom: 0,
    maxWidth: 780,
    color: "rgba(0,0,0,.70)",
    lineHeight: 1.6,
    fontSize: 16,
    fontFamily: "var(--font-body)",
    fontWeight: 600,
  };

  const topButtons: React.CSSProperties = {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 800,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 10px 22px rgba(0,0,0,.10)",
  };

  const primaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: GREEN,
    color: "#fff",
    border: `1px solid rgba(0,0,0,.08)`,
  };

  const secondaryBtn: React.CSSProperties = {
    ...buttonBase,
    backgroundColor: "#ffffff",
    color: "rgba(0,0,0,.75)",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: "22px 22px 26px",
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  };

  const sectionTitleRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 18,
    marginTop: 6,
  };

  const sectionLine: React.CSSProperties = {
    height: 1,
    width: 180,
    background: "rgba(0,0,0,.20)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 800,
    color: TEXT,
    fontFamily: "var(--font-heading)",
    letterSpacing: 0,
    textAlign: "center",
  };

  const smallNote: React.CSSProperties = {
    marginTop: 10,
    color: "rgba(0,0,0,.55)",
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    lineHeight: 1.6,
  };

  return (
    <main style={pageWrap}>
      <div style={container}>
        {/* Header */}
        <div style={headerRow}>
          <div style={{ minWidth: 260 }}>
            <h1 style={titleStyle}>About</h1>
            <p style={subtitleStyle}>
              Restaurants Now Hiring helps restaurants post open roles and helps job seekers
              find restaurant jobs faster — by role, location, and real details.
            </p>
          </div>

          <div style={topButtons}>
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

        {/* Section: What We Do */}
        <div style={cardStyle}>
          <div style={sectionTitleRow}>
            <div style={sectionLine} />
            <div style={sectionTitle}>What We Do</div>
            <div style={sectionLine} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <InfoCard
              title="For Job Seekers"
              body="Browse restaurant roles by category and location. Click any job to view details like pay, schedule, and how to apply."
            />
            <InfoCard
              title="For Employers"
              body="Create an employer account to submit jobs for review. Once approved, your listing is published publicly."
            />
            <InfoCard
              title="Quality First"
              body="We keep listings clean and easy to read — no clutter, no confusion, just the info people need to apply."
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <SectionCard title="How jobs get posted">
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.8,
                  color: "rgba(0,0,0,.82)",
                  fontWeight: 650,
                  fontFamily: "var(--font-body)",
                }}
              >
                <li>Employers submit a job listing.</li>
                <li>Listings are reviewed before going live.</li>
                <li>Approved jobs appear under Browse Jobs.</li>
              </ul>
            </SectionCard>
          </div>
        </div>

        {/* Section: Why Restaurants */}
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={sectionTitleRow}>
            <div style={sectionLine} />
            <div style={sectionTitle}>Why The Restaurant Industry</div>
            <div style={sectionLine} />
          </div>

          <div
            style={{
              color: "rgba(0,0,0,.82)",
              lineHeight: 1.8,
              fontWeight: 650,
              fontFamily: "var(--font-body)",
              fontSize: 15,
              maxWidth: 980,
              margin: "0 auto",
            }}
          >
            Restaurants are one of the best places to build real, transferable skills fast —
            communication, teamwork, leadership, and operations. For many people, it’s not
            just a job… it’s a career path with momentum.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            <InfoCard
              title="Start Anywhere"
              body="Many careers in restaurants start at entry-level and build quickly through consistent performance and training."
            />
            <InfoCard
              title="Grow Fast"
              body="With the right opportunity, people can move from hourly roles into leadership in a relatively short time."
            />
            <InfoCard
              title="Real Career Upside"
              body="It’s possible for strong performers to grow from minimum wage to six figures within about five years in some organizations."
            />
          </div>

          <div style={smallNote}>
            Note: Pay and timelines vary by company, role, market, and performance. We share this
            to highlight the potential of the industry — not to promise specific earnings.
          </div>
        </div>

        {/* Section: Questions */}
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={sectionTitleRow}>
            <div style={sectionLine} />
            <div style={sectionTitle}>Questions</div>
            <div style={sectionLine} />
          </div>

          <div
            style={{
              color: "rgba(0,0,0,.82)",
              lineHeight: 1.7,
              fontWeight: 650,
              fontFamily: "var(--font-body)",
              maxWidth: 980,
              margin: "0 auto",
            }}
          >
            Need help or have feedback? Visit the Contact page and send us a note.
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/contact" style={primaryBtn}>
              Contact
            </Link>
            <Link href="/jobs" style={secondaryBtn}>
              Browse Jobs
            </Link>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            textAlign: "center",
            color: "rgba(0,0,0,.55)",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-body)",
          }}
        >
          Restaurants Now Hiring
        </div>
      </div>
    </main>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  const BORDER = "rgba(0,0,0,.10)";

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,.72)",
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 12px 24px rgba(0,0,0,.08)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,.90)",
          fontSize: 18,
          fontFamily: "var(--font-heading)",
          letterSpacing: 0,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 10,
          color: "rgba(0,0,0,.78)",
          lineHeight: 1.7,
          fontWeight: 650,
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      >
        {body}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const BORDER = "rgba(0,0,0,.10)";

  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        padding: 16,
        backgroundColor: "rgba(255,255,255,.72)",
        boxShadow: "0 12px 24px rgba(0,0,0,.08)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,.90)",
          fontSize: 18,
          fontFamily: "var(--font-heading)",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

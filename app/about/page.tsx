import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AboutPage() {
  const HERO_HEIGHT = 320;
  const BANNER_HEIGHT = 50; // your fixed TopBanner height

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* HERO (fixed under banner) */}
      <section
        style={{
          position: "fixed",
          top: BANNER_HEIGHT,
          left: 0,
          width: "100vw",
          height: HERO_HEIGHT,
          zIndex: 900,
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.55) 25%, rgba(0,0,0,.18) 45%, rgba(0,0,0,0) 70%)",
          }}
        />

        <div
          style={{
            position: "relative",
            height: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "42px 18px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 65,
              fontWeight: 900,
              color: "#fff",
              lineHeight: 1.05,
              fontFamily: "var(--font-coldsmith)",
              letterSpacing: 1,
              textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
              textTransform: "uppercase",
            }}
          >
            About
          </h1>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 760,
              color: "rgba(255,255,255,.92)",
              lineHeight: 1.6,
              fontSize: 16,
              fontFamily: "var(--font-coldsmith)",
            }}
          >
            Restaurants Now Hiring helps restaurants post open roles and helps job seekers
            find restaurant jobs faster — by role, location, and real details.
          </p>

          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            <Link
              href="/jobs"
              className="hero-button"
              style={{
                backgroundColor: "#000000",
                border: "2px solid #000000",
                color: "#ffffff",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 20,
                fontFamily: "var(--font-coldsmith)",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Browse Jobs
            </Link>

            <Link
              href="/post-job"
              className="hero-button"
              style={{
                backgroundColor: "#000000",
                border: "2px solid #000000",
                color: "#ffffff",
                padding: "10px 20px",
                fontWeight: 800,
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 20,
                fontFamily: "var(--font-coldsmith)",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Post a Job
            </Link>
          </div>
        </div>
      </section>

      {/* Spacer so content starts below TopBanner + fixed hero */}
      <div style={{ height: BANNER_HEIGHT + HERO_HEIGHT }} />

      {/* WOOD BACKGROUND */}
      <div
        style={{
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "repeat",
          width: "100%",
          minHeight: "100vh",
        }}
      >
        <div style={{ backgroundColor: "rgba(0,0,0,0.10)", width: "100%" }}>
          <section style={{ width: "100vw", padding: "40px 0 80px" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              <div
                style={{
                  backgroundColor: "rgba(255,255,255,.85)",
                  borderRadius: 14,
                  padding: "26px 24px",
                  boxShadow: "0 16px 40px rgba(0,0,0,.35)",
                  border: "1px solid rgba(0,0,0,.10)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.35)" }} />
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      color: "rgba(0,0,0,.85)",
                      fontFamily: "var(--font-coldsmith)",
                      textTransform: "uppercase",
                    }}
                  >
                    What We Do
                  </div>
                  <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.35)" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
                  <InfoCard
                    title="For Job Seekers"
                    body="Browse open restaurant roles by category and location. Click any job to view details like pay, schedule, and how to apply."
                  />
                  <InfoCard
                    title="For Employers"
                    body="Create an employer account to post jobs for review. Once approved, your listing is published to the public jobs page."
                  />
                  <InfoCard
                    title="Quality First"
                    body="We keep listings clean and easy to read — no clutter, no confusion, just the info people need to apply."
                  />
                </div>

                <div style={{ marginTop: 18 }}>
                  <SectionCard title="How jobs get posted">
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: "rgba(0,0,0,.82)", fontWeight: 700 }}>
                      <li>Employers submit a job listing.</li>
                      <li>Listings are reviewed before going live.</li>
                      <li>Approved jobs appear under Browse Jobs and Top Roles Hiring Now.</li>
                    </ul>
                  </SectionCard>

                  <SectionCard title="Questions?">
                    <div style={{ color: "rgba(0,0,0,.82)", lineHeight: 1.7, fontWeight: 700 }}>
                      Visit the Contact page and send us a note. We’ll respond as soon as we can.
                    </div>

                    <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                      <Link
                        href="/contact"
                        className="hero-button"
                        style={{
                          backgroundColor: "#000000",
                          border: "2px solid #000000",
                          color: "#ffffff",
                          padding: "10px 20px",
                          fontWeight: 800,
                          borderRadius: 6,
                          textDecoration: "none",
                          fontSize: 18,
                          fontFamily: "var(--font-coldsmith)",
                          letterSpacing: 1,
                          textTransform: "uppercase",
                        }}
                      >
                        Contact
                      </Link>
                      <Link
                        href="/"
                        className="hero-button"
                        style={{
                          backgroundColor: "#000000",
                          border: "2px solid #000000",
                          color: "#ffffff",
                          padding: "10px 20px",
                          fontWeight: 800,
                          borderRadius: 6,
                          textDecoration: "none",
                          fontSize: 18,
                          fontFamily: "var(--font-coldsmith)",
                          letterSpacing: 1,
                          textTransform: "uppercase",
                        }}
                      >
                        Home
                      </Link>
                    </div>
                  </SectionCard>
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  textAlign: "center",
                  color: "rgba(255,255,255,.85)",
                  fontSize: 13,
                  fontFamily: "var(--font-coldsmith)",
                }}
              >
                Restaurants Now Hiring
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,.70)",
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,.90)",
          fontSize: 18,
          fontFamily: "var(--font-coldsmith)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 10, color: "rgba(0,0,0,.82)", lineHeight: 1.7, fontWeight: 700 }}>
        {body}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.12)",
        borderRadius: 10,
        padding: 16,
        backgroundColor: "rgba(255,255,255,.70)",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,.90)",
          fontSize: 20,
          fontFamily: "var(--font-coldsmith)",
          textTransform: "uppercase",
          letterSpacing: 0.9,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

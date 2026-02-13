import Link from "next/link";
import { supabase } from "../lib/supabase";
import LatestJobsPanel from "./components/LatestJobsPanel";
import TopRolesSection from "./components/TopRolesSection";


type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  active: boolean;
  created_at: string;
};

export default async function HomePage() {
  // Pull the latest active jobs (for the homepage list)
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id,title,restaurant_name,city,state,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const latestJobs: Job[] = (jobs ?? []) as Job[];

  return (
    <main style={{ backgroundColor: "#ffffff", minHeight: "100vh" }}>
      {/* HERO SECTION */}
      <section
        style={{
          position: "relative",
          width: "100vw",
          height: "40vh",
          minHeight: 450,
          backgroundImage: "url('/hero.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      >
        {/* DARK OVERLAY */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.75) 0%, rgba(0,0,0,.55) 15%, rgba(0,0,0,.15) 20%, rgba(0,0,0,0) 50%)",
          }}
        />

        {/* CONTENT */}
        {/* CONTENT */}
<div
  style={{
    position: "relative",
    height: "100%",
    width: "100%",
    padding: "96px 24px 0 24px",
    display: "flex",
    alignItems: "flex-start",
    gap: 1, // 👈 controls how far right the text block sits
  }}
>
  {/* LEFT COLUMN: LOGO + SITE NAME (stays far left) */}
  <div style={{ flexShrink: 0 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <img
        src="/logo-star.png"
        alt="Restaurants Now Hiring"
        style={{
          height: 50,
          width: "auto",
          display: "block",
        }}
      />

      <span
        style={{
          fontSize: 30,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: 0.4,
          lineHeight: 1,
          whiteSpace: "nowrap",
          fontFamily: "var(--font-coldsmith)",
        }}
      >
        Restaurants
        <span style={{ color: "#ff7a00" }}>NOW</span>Hiring.com
      </span>
    </div>
  </div>

  {/* RIGHT COLUMN: EVERYTHING ELSE (moves together) */}
  <div style={{ maxWidth: 700 }}>
    {/* HEADLINE */}
    <h1
      style={{
        fontSize: 80,
        fontWeight: 900,
        lineHeight: 1.05,
        marginBottom: 5,
        color: "#ffffff",
        fontFamily: "var(--font-coldsmith)",
        letterSpacing: 1,
        marginTop: 40, // 👈 pushes this block down without moving the logo
        textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
      }}
    >
      RESTAURANT JOBS
    </h1>

    <h2
      style={{
        fontSize: 50,
        fontWeight: 900,
        color: "#ff7a00",
        marginBottom: 20,
        fontFamily: "var(--font-coldsmith)",
        letterSpacing: 1,
        textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
      }}
    >
      HIRING NOW
    </h2>

    {/* SUBTEXT */}
    <p
      style={{
        maxWidth: 520,
        fontSize: 20,
        lineHeight: 1.6,
        color: "rgba(255,255,255,.9)",
        marginBottom: 28,
                textShadow: "0px 4px 12px rgba(0,0,0,0.65)",

      }}
    >
      Find real restaurant jobs hiring near you.
    </p>

    {/* CTA BUTTONS */}
    <div style={{ display: "flex", gap: 15 }}>
      <Link
  href="/jobs"
  className="hero-button"
  style={{
    backgroundColor: "#000000",
    border: "2px solid #000000",
    color: "#ffffff",
    padding: "10px 20px",
    fontWeight: 700,
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 20,
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 1,
  }}
>
  BROWSE JOBS
</Link>


      <Link
  href="/post-job"
  className="hero-button"
  style={{
    backgroundColor: "#000000",
    border: "2px solid #000000",
    color: "#ffffff",
    padding: "10px 20px",
    fontWeight: 700,
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 20,
    fontFamily: "var(--font-coldsmith)",
    letterSpacing: 1,
  }}
>
  POST A JOB
</Link>

    </div>
  </div>
</div>

      </section>

      {/* SITE BACKGROUND (everything below hero) */}
      <div
        style={{
          backgroundImage: "url('/background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          width: "100%",
        }}
      >
        {/* DARK OVERLAY */}
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0)",
            width: "100%",
          }}
        >
          {/* OUR SPONSORS */}
          <section
            style={{
              width: "100vw",
              padding: "46px 0 34px",
              borderTop: "1px solid rgb(255, 116, 2)",
              backgroundColor: "transparent",
            }}
          >
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              <div
                style={{
                  backgroundColor: "rgba(255, 249, 249, 0)",
                  border: "1px solid rgba(255, 255, 255, 0)",
                  borderRadius: 10,
                  padding: "26px 22px 28px",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0)",
                  backdropFilter: "blur(2px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    marginBottom: 20,
                  }}
                >
                  <div style={{ height: 1, width: 120, background: "rgb(0, 0, 0)" }} />
                  <div
                    style={{
                      fontSize: 45,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      color: "#ffffff",
                      fontFamily: "var(--font-coldsmith)",
                      textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
                    }}
                  >
                    OUR SPONSORS
                  </div>
                  <div style={{ height: 1, width: 120, background: "rgb(0, 0, 0)" }} />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 16,
                  }}
                >
                  {[
                    { src: "/sponsor-1.png", alt: "Sponsor 1" },
                    { src: "/sponsor-2.png", alt: "Sponsor 2" },
                    { src: "/sponsor-3.png", alt: "Sponsor 3" },
                    { src: "/sponsor-4.png", alt: "Sponsor 4" },
                  ].map((sponsor) => (
                    <div
                      key={sponsor.src}
                      style={{
                        backgroundColor: "rgba(0,0,0,.35)",
                        border: "1px solid rgba(255,255,255,.10)",
                        borderRadius: 10,
                        height: 92,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 14,
                      }}
                    >
                      <img
                        src={sponsor.src}
                        alt={sponsor.alt}
                        style={{
                          maxHeight: 58,
                          maxWidth: "100%",
                          width: "auto",
                          height: "auto",
                          objectFit: "contain",
                          filter: "drop-shadow(0 6px 10px rgba(0,0,0,.35))",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <TopRolesSection />

          {/* LATEST JOB LISTINGS (WORKING FILTERS) */}
          <section
            style={{
              width: "100vw",
              padding: "18px 0 54px",
              backgroundColor: "transparent",
            }}
          >
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
              {/* This renders the interactive dropdowns + filtering */}
              <LatestJobsPanel jobs={latestJobs} />
            </div>
          </section>

          {/* FOOTER */}
          <footer
            style={{
              borderTop: "1px solid rgba(255,255,255,.15)",
              padding: "24px 0",
              textAlign: "center",
              color: "rgba(255,255,255,.6)",
              fontSize: 13,
            }}
          >
            © 2026 RestaurantsNowHiring.com
          </footer>
        </div>
      </div>
    </main>
  );
}

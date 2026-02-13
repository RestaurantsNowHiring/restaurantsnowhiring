import Link from "next/link";

type RoleCard = {
  title: string;
  imageSrc: string;
  roleFilters: string[]; // role_category values
  objectPosition?: string;
};

function buildJobsHref(roleFilters: string[]) {
  const params = new URLSearchParams();
  roleFilters.forEach((r) => params.append("role", r));
  return `/jobs?${params.toString()}`; // role=Line&role=Prep
}

export default function TopRolesSection() {
  const roles: RoleCard[] = [
    {
      title: "Line / Prep Cooks",
      imageSrc: "/roles/line-cooks.jpg",
      roleFilters: ["Line", "Prep"],
      objectPosition: "center 20%",
    },
    {
      title: "Cashier / Server",
      imageSrc: "/roles/servers.jpg",
      roleFilters: ["Cashier", "Server"],
      objectPosition: "center center",
    },
    {
      title: "Managers",
      imageSrc: "/roles/managers.jpg",
      roleFilters: ["Manager"],
      objectPosition: "center 19%",
    },
  ];

  return (
    <section style={{ width: "100vw", padding: "10px 0 26px", backgroundColor: "transparent" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}>
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0)",
            borderRadius: 14,
            padding: "22px 22px 26px",
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0)",
            backdropFilter: "blur(2px)",
            border: "1px solid rgba(0, 0, 0, 0)",
          }}
        >
          {/* Title row */}
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
                fontSize: 45,
                fontWeight: 900,
                letterSpacing: 1.2,
                color: "#ffffff",
                fontFamily: "var(--font-coldsmith)",
                textTransform: "uppercase",
                textShadow: "0px 4px 12px rgba(0,0,0,0.65)",
              }}
            >
              TOP ROLES HIRING NOW
            </div>
            <div style={{ height: 1, width: 180, background: "rgba(0,0,0,.35)" }} />
          </div>

          {/* Cards */}
          <div
            className="roles-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 18,
            }}
          >
            {roles.map((r) => {
              const href = buildJobsHref(r.roleFilters);

              return (
                <div
                  key={r.title}
                  className="role-card"
                  style={{
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(0,0,0,.12)",
                    boxShadow: "0 10px 22px rgba(0,0,0,.20)",
                    backgroundColor: "rgba(247, 236, 223, 0.85)",
                  }}
                >
                  <div style={{ width: "100%", height: 210, overflow: "hidden" }}>
                    <img
                      src={r.imageSrc}
                      alt={r.title}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: r.objectPosition ?? "center",
                        display: "block",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      backgroundColor: "#ffffff",
                      padding: "14px 14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        color: "#000000",
                        fontWeight: 900,
                        fontSize: 26,
                        letterSpacing: 1,
                        fontFamily: "var(--font-coldsmith)",
                        textTransform: "uppercase",
                        textShadow: "0 2px 10px rgba(0,0,0,.55)",
                      }}
                    >
                      {r.title}
                    </div>

                    <Link
                      href={href}
                      className="hero-button"
                      style={{
                        backgroundColor: "#000000",
                        color: "#ffffff",
                        padding: "8px 16px",
                        borderRadius: 8,
                        fontWeight: 900,
                        textDecoration: "none",
                        border: "2px solid #000000",
                        fontFamily: "var(--font-coldsmith)",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        boxShadow: "0 10px 18px rgba(0, 0, 0, 0.45)",
                      }}
                    >
                      Explore Jobs →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

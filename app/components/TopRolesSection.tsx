import Link from "next/link";

type RoleCard = {
  title: string;
  imageSrc: string;
  roleFilters: string[]; // role_category values
  href?: string;
  objectPosition?: string;
  imageScale?: number; // ✅ allows "zoom" per image
};

function buildJobsHref(roleFilters: string[]) {
  const params = new URLSearchParams();
  roleFilters.forEach((r) => params.append("role", r));
  return `/jobs?${params.toString()}`; // role=Line&role=Prep
}

export default function TopRolesSection() {
  // ✅ Theme tokens (match newer pages)
  const GREEN = "#35806e";
  const BORDER = "rgba(0,0,0,.10)";
  const TEXT = "rgba(0,0,0,.85)";
  const MUTED = "rgba(0,0,0,.65)";

  const roles: RoleCard[] = [
    {
      title: "Line / Prep Cooks",
      imageSrc: "/roles/line-cooks.JPG",
      roleFilters: ["Line", "Prep"],
      href: "/line-cook-jobs",
      objectPosition: "center 20%",
      imageScale: 1.03,
    },
    {
      title: "Cashier / Server",
      imageSrc: "/roles/servers.jpg",
      roleFilters: ["Cashier", "Server"],
      href: "/server-jobs",
      objectPosition: "center 25%",
      imageScale: 1.03,
    },
    {
      title: "Managers",
      imageSrc: "/roles/managers.jpg",
      roleFilters: ["Manager"],
      href: "/restaurant-manager-jobs",
      // ✅ tweak these two until it feels perfect
      objectPosition: "center center", // move “camera” up/down
      imageScale: 1.8, // zoom in
    },
  ];

  return (
    <section style={{ padding: "6px 0 0", backgroundColor: "transparent" }}>
      <div
        className="rn-roles-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {roles.map((r) => {
          const href = r.href ?? buildJobsHref(r.roleFilters);

          return (
            <div
              key={r.title}
              style={{
                borderRadius: 18,
                overflow: "hidden",
                border: `1px solid ${BORDER}`,
                backgroundColor: "#ffffff",
                boxShadow: "0 14px 30px rgba(0,0,0,.10)",
                display: "flex",
                flexDirection: "column",
                minHeight: 320,
              }}
            >
              {/* Image */}
              <div style={{ width: "100%", height: 170, overflow: "hidden" }}>
                <img
                  src={r.imageSrc}
                  alt={r.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: r.objectPosition ?? "center",
                    display: "block",
                    transform: `scale(${r.imageScale ?? 1.01})`,
                  }}
                />
              </div>

              {/* Content */}
              <div
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    color: TEXT,
                    fontFamily: "var(--font-heading)",
                    lineHeight: 1.15,
                  }}
                >
                  {r.title}
                </div>

                <div
                  style={{
                    color: MUTED,
                    fontFamily: "var(--font-body)",
                    fontWeight: 650,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Browse active openings in this category.
                </div>

                <div style={{ marginTop: "auto" }}>
                  <Link
                    href={href}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 14px",
                      borderRadius: 14,
                      backgroundColor: GREEN,
                      color: "#fff",
                      textDecoration: "none",
                      fontFamily: "var(--font-body)",
                      fontWeight: 900,
                      border: "1px solid rgba(0,0,0,.08)",
                      boxShadow: "0 12px 24px rgba(0,0,0,.14)",
                      whiteSpace: "nowrap",
                    }}
                    aria-label={`Explore jobs for ${r.title}`}
                    title={`Explore jobs for ${r.title}`}
                  >
                    Explore Jobs <span style={{ marginLeft: 8, fontWeight: 900 }}>→</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Responsive */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 980px) {
              .rn-roles-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            }
            @media (max-width: 640px) {
              .rn-roles-grid { grid-template-columns: 1fr; }
            }
          `,
        }}
      />
    </section>
  );
}

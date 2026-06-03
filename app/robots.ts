import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/jobs", "/jobs/", "/contact", "/about", "/pricing", "/terms", "/privacy"],
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/login",
          "/login/",
          "/signup",
          "/signup/",
          "/employer-dashboard",
          "/employer-dashboard/",
          "/employer-welcome",
          "/employer-welcome/",
          "/forgot-password",
          "/forgot-password/",
          "/reset-password",
          "/reset-password/",
          "/check-email",
          "/check-email/",
          "/post-job",
          "/post-job/",
          "/employer-login",
          "/employer-login/",
          "/invite",
          "/invite/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

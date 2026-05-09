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
          "/employer-dashboard",
          "/employer-dashboard/",
          "/employer-welcome",
          "/forgot-password",
          "/reset-password",
          "/check-email",
          "/post-job",
          "/employer-login",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

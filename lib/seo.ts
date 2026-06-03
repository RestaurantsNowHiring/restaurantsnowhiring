import type { Metadata } from "next";

const CANONICAL_SITE_URL = "https://www.restaurantsnowhiring.com";
export const SITE_NAME = "Restaurants Now Hiring";
export const DEFAULT_SITE_TITLE = "Restaurants Now Hiring | Restaurant Jobs Hiring Now";
export const DEFAULT_SITE_DESCRIPTION =
  "Find restaurant jobs hiring now across servers, cooks, bartenders, managers, hosts, and more.";

export function getSiteUrl() {
  return CANONICAL_SITE_URL;
}

export function absoluteUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${getSiteUrl()}#organization`,
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: absoluteUrl("/logo-star.png"),
  };
}

export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}#website`,
    name: SITE_NAME,
    url: getSiteUrl(),
    publisher: {
      "@id": `${getSiteUrl()}#organization`,
    },
  };
}

export function buildPageMetadata({
  title,
  description,
  path,
  robots,
  image = "/logo-star.png",
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  robots?: Metadata["robots"];
  image?: string;
  absoluteTitle?: boolean;
}): Metadata {
  const url = absoluteUrl(path);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
    },
    robots,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      images: [
        {
          url: absoluteUrl(image),
          alt: SITE_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(image)],
    },
  };
}

export const noIndexRobots = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} satisfies Metadata["robots"];

export function truncateMetaDescription(value: string, maxLength = 155) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

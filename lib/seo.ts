import type { Metadata } from "next";

const CANONICAL_SITE_URL = "https://www.restaurantsnowhiring.com";
const SITE_NAME = "Restaurants Now Hiring";

export function getSiteUrl() {
  return CANONICAL_SITE_URL;
}

export function absoluteUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalizedPath}`;
}

export function buildPageMetadata({
  title,
  description,
  path,
  robots,
  image = "/logo-star.png",
}: {
  title: string;
  description: string;
  path: string;
  robots?: Metadata["robots"];
  image?: string;
}): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
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

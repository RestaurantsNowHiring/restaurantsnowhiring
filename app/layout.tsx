// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import localFont from "next/font/local";
import { Inter, Sora } from "next/font/google";
import type { Metadata, Viewport } from "next";
import TopBanner from "./components/TopBanner";
import GoogleAnalytics from "./components/GoogleAnalytics";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  getSiteUrl,
  serializeJsonLd,
} from "../lib/seo";
import { Analytics } from "@vercel/analytics/next";

const googleAnalyticsMeasurementId = process.env.NEXT_PUBLIC_GA_ID;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

// Keep Coldsmith available (optional)
const coldsmith = localFont({
  src: "./fonts/Coldsmith.otf",
  variable: "--font-coldsmith",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: "Restaurants Now Hiring",
  title: {
    default: DEFAULT_SITE_TITLE,
    template: "%s | Restaurants Now Hiring",
  },
  description: DEFAULT_SITE_DESCRIPTION,
  alternates: {
    canonical: getSiteUrl(),
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: getSiteUrl(),
    siteName: "Restaurants Now Hiring",
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [
      {
        url: "/logo-star.png",
        alt: "Restaurants Now Hiring",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    images: ["/logo-star.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#35806e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const globalStructuredData = [buildOrganizationSchema(), buildWebSiteSchema()];

  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} ${coldsmith.variable}`}
    >
      <body
        style={{
          margin: 0,
          backgroundColor: "#000",
          color: "#fff",
        }}
      >
        <TopBanner />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(globalStructuredData) }}
        />

        {/* Skip link for accessibility */}
        <a
          href="#main-content"
          className="sr-only sr-only-focusable bg-black text-white px-4 py-2 rounded"
        >
          Skip to main content
        </a>

        <div id="main-content" tabIndex={-1} style={{ padding: 0 }}>
          {children}
        </div>

        <footer
          className="global-site-footer"
          style={{
            borderTop: "1px solid rgba(255,255,255,.15)",
            padding: "18px 24px",
            fontSize: 13,
            color: "rgba(255,255,255,.7)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 14,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <Link href="/terms" style={{ color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
              Terms
            </Link>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
              Privacy
            </Link>
            <Link href="/pricing" style={{ color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
              Pricing
            </Link>
            <Link href="/admin/login" style={{ color: "rgba(255,255,255,.85)", textDecoration: "underline" }}>
              Admin
            </Link>
          </div>
          © {new Date().getFullYear()} RestaurantsNowHiring.com
        </footer>
        <Suspense fallback={null}>
          <GoogleAnalytics measurementId={googleAnalyticsMeasurementId} />
        </Suspense>
        <Script id="apollo-website-tracker" strategy="afterInteractive">
          {`
            function initApollo() {
              var n = Math.random().toString(36).substring(7),
                o = document.createElement("script");
              o.src = "https://assets.apollo.io/micro/website-tracker/tracker.iife.js?nocache=" + n;
              o.async = true;
              o.defer = true;
              o.onload = function() {
                window.trackingFunctions.onLoad({
                  appId: "6a7a830bf210580014aa739a"
                });
              };
              document.head.appendChild(o);
            }
            initApollo();
          `}
        </Script>
        <Analytics />
      </body>
    </html>
  );
}

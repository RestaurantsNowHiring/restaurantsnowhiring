// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";
import localFont from "next/font/local";
import { Inter, Sora } from "next/font/google";
import type { Metadata, Viewport } from "next";
import TopBanner from "./components/TopBanner";
import { getSiteUrl } from "../lib/seo";
import { Analytics } from "@vercel/analytics/next";

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
    default: "Restaurants Now Hiring | Restaurant Jobs Hiring Now",
    template: "%s | Restaurants Now Hiring",
  },
  description:
    "Browse restaurant jobs hiring now or post restaurant openings for review on RestaurantsNowHiring.com.",
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
    title: "Restaurants Now Hiring | Restaurant Jobs Hiring Now",
    description:
      "Browse restaurant jobs hiring now or post restaurant openings for review on RestaurantsNowHiring.com.",
    images: [
      {
        url: "/logo-star.png",
        alt: "Restaurants Now Hiring",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Restaurants Now Hiring | Restaurant Jobs Hiring Now",
    description:
      "Browse restaurant jobs hiring now or post restaurant openings for review on RestaurantsNowHiring.com.",
    images: ["/logo-star.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#35806e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <Analytics />
      </body>
    </html>
  );
}

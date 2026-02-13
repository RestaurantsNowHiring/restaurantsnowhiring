// src/app/layout.tsx
import "./globals.css";
import localFont from "next/font/local";
import TopBanner from "./components/TopBanner";
import EmployerConfirmGate from "./components/EmployerConfirmGate";


const coldsmith = localFont({
  src: "./fonts/Coldsmith.otf",
  variable: "--font-coldsmith",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={coldsmith.variable}>
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
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 bg-black text-white px-4 py-2 rounded"
        >
          Skip to main content
        </a>

        <main id="main-content" style={{ padding: 0 }}>
          {children}
        </main>

        <footer
          style={{
            borderTop: "1px solid rgba(255,255,255,.15)",
            padding: "18px 24px",
            fontSize: 13,
            color: "rgba(255,255,255,.7)",
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} RestaurantsNowHiring.com
        </footer>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Check Your Email",
  description:
    "Check your email for private Restaurants Now Hiring account confirmation or password reset instructions.",
  path: "/check-email",
  robots: noIndexRobots,
});

export default function CheckEmailLayout({ children }: { children: ReactNode }) {
  return children;
}

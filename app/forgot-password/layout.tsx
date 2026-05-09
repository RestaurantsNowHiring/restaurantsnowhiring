import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Forgot Password",
  description:
    "Request a private password reset link for your Restaurants Now Hiring account.",
  path: "/forgot-password",
  robots: noIndexRobots,
});

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

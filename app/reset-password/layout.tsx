import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Reset Password",
  description:
    "Privately reset the password for your Restaurants Now Hiring account.",
  path: "/reset-password",
  robots: noIndexRobots,
});

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

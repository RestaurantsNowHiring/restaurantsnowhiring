import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Employer Login and Signup",
  description:
    "Log in or create an employer account to post restaurant jobs on RestaurantsNowHiring.com.",
  path: "/employer-login",
  robots: noIndexRobots,
});

export default function EmployerLoginLayout({ children }: { children: ReactNode }) {
  return children;
}

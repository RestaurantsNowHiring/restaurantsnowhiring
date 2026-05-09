import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Employer Welcome",
  description:
    "Confirm your employer account email before posting restaurant jobs on RestaurantsNowHiring.com.",
  path: "/employer-welcome",
  robots: noIndexRobots,
});

export default function EmployerWelcomeLayout({ children }: { children: ReactNode }) {
  return children;
}

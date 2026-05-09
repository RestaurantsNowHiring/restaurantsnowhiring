import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Employer Dashboard",
  description:
    "Private employer dashboard for managing restaurant job posts on RestaurantsNowHiring.com.",
  path: "/employer-dashboard",
  robots: noIndexRobots,
});

export default function EmployerDashboardLayout({ children }: { children: ReactNode }) {
  return children;
}

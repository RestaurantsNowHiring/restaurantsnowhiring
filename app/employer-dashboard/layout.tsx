import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Employer Dashboard",
  robots: noIndexRobots,
};

export default function EmployerDashboardLayout({ children }: { children: ReactNode }) {
  return children;
}

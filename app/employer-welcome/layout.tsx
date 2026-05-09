import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Employer Welcome",
  robots: noIndexRobots,
};

export default function EmployerWelcomeLayout({ children }: { children: ReactNode }) {
  return children;
}

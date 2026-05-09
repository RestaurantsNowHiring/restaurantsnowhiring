import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Check Your Email",
  robots: noIndexRobots,
};

export default function CheckEmailLayout({ children }: { children: ReactNode }) {
  return children;
}

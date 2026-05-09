import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Admin",
  robots: noIndexRobots,
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}

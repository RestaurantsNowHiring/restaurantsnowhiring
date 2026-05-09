import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Admin",
  description: "Private Restaurants Now Hiring administration area.",
  path: "/admin",
  robots: noIndexRobots,
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}

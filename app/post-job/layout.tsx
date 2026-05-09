import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Post a Restaurant Job",
  description:
    "Post restaurant hiring opportunities for review on RestaurantsNowHiring.com.",
  path: "/post-job",
  robots: noIndexRobots,
});

export default function PostJobLayout({ children }: { children: ReactNode }) {
  return children;
}

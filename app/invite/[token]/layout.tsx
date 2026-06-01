import type { ReactNode } from "react";
import { buildPageMetadata, noIndexRobots } from "../../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Accept Team Invitation",
  description: "Accept an invitation to join an existing RestaurantsNOWHiring.com employer team.",
  path: "/invite",
  robots: noIndexRobots,
});

export default function InviteLayout({ children }: { children: ReactNode }) {
  return children;
}

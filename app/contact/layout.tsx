import type { ReactNode } from "react";
import { buildPageMetadata } from "../../lib/seo";

export const metadata = buildPageMetadata({
  title: "Contact Restaurants Now Hiring",
  description:
    "Contact Restaurants Now Hiring for job board questions, employer support, restaurant hiring help, and general inquiries.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}

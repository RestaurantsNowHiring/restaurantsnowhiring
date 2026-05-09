import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Forgot Password",
  robots: noIndexRobots,
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

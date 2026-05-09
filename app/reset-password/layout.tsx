import type { ReactNode } from "react";
import { noIndexRobots } from "../../lib/seo";

export const metadata = {
  title: "Reset Password",
  robots: noIndexRobots,
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function EmployerConfirmGate() {
  const router = useRouter();
  const pathname = usePathname();

  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      // Pages we allow even if not confirmed:
      const allow =
        pathname === "/employer-welcome" ||
        pathname === "/employer-login";

      // If not logged in: only force them away from employer-welcome/post-job
      if (!session?.user) {
        // if they try welcome while logged out, send to login
        if (pathname === "/employer-welcome") router.replace("/employer-login");
        if (mounted) setChecked(true);
        return;
      }

      const confirmed = !!session.user.email_confirmed_at;

      // If logged in but NOT confirmed: force them to employer-welcome
      if (!confirmed && !allow) {
        router.replace("/employer-welcome");
        return;
      }

      // If confirmed but still on welcome: send home
      if (confirmed && pathname === "/employer-welcome") {
        router.replace("/");
        return;
      }

      if (mounted) setChecked(true);
    }

    run();

    const { data: listener } = supabase.auth.onAuthStateChange(() => run());

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  // This component doesn’t render UI. It just redirects.
  // checked is here only to avoid unnecessary flicker if you later want it.
  return null;
}

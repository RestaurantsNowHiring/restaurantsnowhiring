"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  homeCardStyle,
  homeInputStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type EmployerAccessScope = "single_location" | "multi_location" | "full_account_access";

type EmployerAccess = {
  role: EmployerRole;
  userType: EmployerAccessScope;
  assignedStoreIds: string[];
  accountId: string | null;
  accountName: string | null;
  restaurantBrandName: string | null;
  locationName: string | null;
  ownerUserId: string;
  ownerEmail: string;
  canManageProfile: boolean;
  canManageBilling: boolean;
  canManageJobs: boolean;
  canViewCandidates: boolean;
  canUpdateCandidateStatuses: boolean;
  canManageTeam: boolean;
  canManageNotificationRouting: boolean;
};

function employerAccountHeaders(token: string) {
  const selectedEmployerAccountId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("rn-selected-employer-account-id");

  return {
    Authorization: `Bearer ${token}`,
    ...(selectedEmployerAccountId
      ? { "X-Employer-Account-Id": selectedEmployerAccountId }
      : {}),
  };
}

export default function AtsIntegrationPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [employerAccess, setEmployerAccess] = useState<EmployerAccess | null>(null);

  const loadEmployerAccess = useCallback(async (token: string) => {
    const response = await fetch("/api/employer/me", {
      headers: employerAccountHeaders(token),
    });

    if (!response.ok) {
      setEmployerAccess(null);
      setAuthStatus("allowed");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { employer?: EmployerAccess } | null;
    setEmployerAccess(payload?.employer ?? null);
    setAuthStatus("allowed");
  }, []);

  useEffect(() => {
    let mounted = true;

    async function checkAuthAndLoadAccess() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }

      await loadEmployerAccess(token);
    }

    void checkAuthAndLoadAccess();

    return () => {
      mounted = false;
    };
  }, [loadEmployerAccess, router]);

  if (authStatus === "loading") {
    return <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading ATS integration…</main>;
  }

  return (
    <main
      data-employer-account-id={employerAccess?.accountId ?? undefined}
      style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 72, backgroundColor: homeTheme.bg }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Employer Dashboard
          </p>
          <div className="rn-ats-header-row">
            <div>
              <h1 style={{ margin: "8px 0", fontSize: 38, lineHeight: 1.1, fontFamily: "var(--font-heading)", color: homeTheme.green }}>
                ATS Integration
              </h1>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700, maxWidth: 780 }}>
                Import jobs directly from your public careers page. RestaurantsNowHiring will scan your careers page, detect your applicant tracking system, and allow you to import jobs for review before they are published.
              </p>
            </div>
            <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
            Import from Careers Page
          </h2>
          <div className="rn-ats-import-form">
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Careers Page URL
              <input
                type="url"
                placeholder="https://company.com/careers"
                style={{ ...homeInputStyle, marginTop: 6 }}
                aria-describedby="ats-import-note"
              />
            </label>
            <div>
              <button
                type="button"
                className="rn-btn-primary"
                style={{ ...homePrimaryButton, opacity: 0.62, cursor: "not-allowed" }}
                disabled
              >
                Import Jobs
              </button>
            </div>
            <p id="ats-import-note" style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>
              Coming soon. ATS importing is currently under development.
            </p>
          </div>
        </section>

        <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
            Imported Jobs
          </h2>
          <p style={{ marginBottom: 0, color: homeTheme.muted, fontWeight: 800 }}>
            No jobs have been imported yet.
          </p>
        </section>
      </div>
    </main>
  );
}

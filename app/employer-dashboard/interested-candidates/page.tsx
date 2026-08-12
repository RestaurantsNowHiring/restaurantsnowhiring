"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";
import InterestedCandidatesExperience, { type CandidateSubmission } from "./InterestedCandidatesExperience";

type EmployerAccess = {
  accountId: string | null;
  canViewCandidates: boolean;
  canUpdateCandidateStatuses: boolean;
};

export default function InterestedCandidatesPage() {
  const router = useRouter();
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; candidates: CandidateSubmission[]; access: EmployerAccess | null; message?: string }>({ status: "loading", candidates: [], access: null });

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/interested-candidates")}`);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/interested-candidates")}`);
        return;
      }
      const selectedAccountId = window.localStorage.getItem("rn-selected-employer-account-id");
      const headers = { Authorization: `Bearer ${token}`, ...(selectedAccountId ? { "X-Employer-Account-Id": selectedAccountId } : {}) };
      try {
        const accessResponse = await fetch("/api/employer/me", { headers });
        const accessPayload = await accessResponse.json().catch(() => null) as { employer?: EmployerAccess; error?: string } | null;
        if (!accessResponse.ok) throw new Error(accessPayload?.error || "Could not load employer account access.");
        const access = accessPayload?.employer ?? null;
        if (!access?.canViewCandidates) {
          if (mounted) setState({ status: "error", candidates: [], access, message: "You are not authorized to view interested candidates." });
          return;
        }
        const accountId = access.accountId ?? selectedAccountId;
        const candidateHeaders = { Authorization: `Bearer ${token}`, ...(accountId ? { "X-Employer-Account-Id": accountId } : {}) };
        const response = await fetch("/api/employer/candidate-submissions", { headers: candidateHeaders });
        const payload = await response.json().catch(() => null) as { candidates?: CandidateSubmission[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Could not load interested candidates.");
        if (mounted) setState({ status: "ready", candidates: payload?.candidates ?? [], access });
      } catch (cause) {
        if (mounted) setState({ status: "error", candidates: [], access: null, message: cause instanceof Error ? cause.message : "Could not load interested candidates." });
      }
    }
    void load();
    return () => { mounted = false; };
  }, [router]);

  return <main style={{ minHeight: "100vh", padding: "82px 0 64px", backgroundColor: homeTheme.bg, overflowX: "clip" }}>
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 18px", minWidth: 0 }}>
      <section style={{ ...homeCardStyle, marginBottom: 16 }}>
        <Link href="/employer-dashboard" style={homeSecondaryButton}>← Back to Dashboard</Link>
        <p style={{ margin: "20px 0 0", color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: .4, textTransform: "uppercase", fontFamily: "var(--font-body)" }}>Employer Dashboard</p>
        <h1 style={{ margin: "8px 0 0", color: homeTheme.green, fontSize: 40, lineHeight: 1.1, fontFamily: "var(--font-heading)" }}>Interested Candidates</h1>
      </section>
      <section style={homeCardStyle} aria-busy={state.status === "loading"}>
        {state.status === "loading" ? <p style={{ margin: 0, color: homeTheme.muted, fontFamily: "var(--font-body)", fontWeight: 800 }}>Loading interested candidates…</p> : null}
        {state.status === "error" ? <div role="alert" style={{ border: "1px solid rgba(173,67,67,.28)", borderRadius: 14, background: "rgba(173,67,67,.08)", color: "#8a2f2f", padding: 14, fontFamily: "var(--font-body)", fontWeight: 800 }}>{state.message}</div> : null}
        {state.status === "ready" && state.access ? <InterestedCandidatesExperience candidates={state.candidates} canUpdateStatuses={state.access.canUpdateCandidateStatuses} accountId={state.access.accountId} /> : null}
      </section>
    </div>
  </main>;
}

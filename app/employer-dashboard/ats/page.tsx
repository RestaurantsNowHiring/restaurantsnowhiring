"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
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

type PreviewJob = {
  title: string;
  location?: string;
  department?: string;
  employmentType?: string;
};

function getDisplayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPreviewJob(value: unknown): PreviewJob {
  const job = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    title: getDisplayValue(job.title) ?? "Untitled job",
    ...(getDisplayValue(job.location) ? { location: getDisplayValue(job.location) } : {}),
    ...(getDisplayValue(job.department) ? { department: getDisplayValue(job.department) } : {}),
    ...(getDisplayValue(job.employmentType)
      ? { employmentType: getDisplayValue(job.employmentType) }
      : {}),
  };
}

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
  const [careersPageUrl, setCareersPageUrl] = useState("");
  const [isFindingJobs, setIsFindingJobs] = useState(false);
  const [previewJobs, setPreviewJobs] = useState<PreviewJob[] | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);

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

  async function findJobs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUrl = careersPageUrl.trim();
    if (!trimmedUrl || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsFindingJobs(true);
    setPreviewJobs(null);
    setResultMessage(null);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }

      const response = await fetch("/api/employer/ats/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...employerAccountHeaders(accessToken),
        },
        body: JSON.stringify({ careersPageUrl: trimmedUrl }),
      });

      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }

      if (response.status === 400) {
        setResultMessage("Please enter a valid careers page URL and try again.");
        return;
      }

      if (response.status === 403) {
        setResultMessage("You don’t have permission to find jobs for this employer account.");
        return;
      }

      if (!response.ok) {
        setResultMessage("We couldn’t find your jobs right now. Please try again.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { status?: unknown; jobs?: unknown; message?: unknown }
        | null;

      if (payload?.status === "ready" && Array.isArray(payload.jobs)) {
        setPreviewJobs(payload.jobs.map(toPreviewJob));
        setResultMessage(
          payload.jobs.length === 0
            ? "We connected to your careers page, but there are no open jobs right now."
            : null,
        );
        return;
      }

      if (
        (payload?.status === "discovery-failed" ||
          payload?.status === "no-job-links" ||
          payload?.status === "unsupported" ||
          payload?.status === "retrieval-failed") &&
        typeof payload.message === "string"
      ) {
        setResultMessage(payload.message);
        return;
      }

      setResultMessage("We couldn’t find your jobs right now. Please try again.");
    } catch {
      setPreviewJobs(null);
      setResultMessage("We couldn’t find your jobs right now. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsFindingJobs(false);
    }
  }

  if (authStatus === "loading") {
    return <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading import jobs…</main>;
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
                Import Jobs
              </h1>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700, maxWidth: 780 }}>
                Import jobs directly from your public careers page. Paste your careers page below and we’ll find your open jobs automatically.
              </p>
            </div>
            <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
            Connect Your Careers Page
          </h2>
          <form className="rn-ats-import-form" onSubmit={findJobs}>
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Careers Page URL
              <input
                type="url"
                value={careersPageUrl}
                onChange={(event) => setCareersPageUrl(event.target.value)}
                placeholder="https://company.com/careers"
                style={{ ...homeInputStyle, marginTop: 6 }}
                aria-describedby="ats-import-note"
                disabled={isFindingJobs}
              />
            </label>
            <div>
              <button
                type="submit"
                className="rn-btn-primary rn-ats-import-button"
                style={{
                  ...homePrimaryButton,
                  ...(!careersPageUrl.trim() || isFindingJobs
                    ? { opacity: 0.55, cursor: "not-allowed" }
                    : {}),
                }}
                disabled={!careersPageUrl.trim() || isFindingJobs}
              >
                {isFindingJobs ? "Finding Jobs..." : "Find My Jobs"}
              </button>
            </div>
            <p
              id="ats-import-note"
              role={resultMessage ? "status" : undefined}
              style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}
            >
              {resultMessage ?? "We’ll search your public careers page for open jobs."}
            </p>
          </form>
        </section>

        {previewJobs && previewJobs.length > 0 ? (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
              Jobs Found
            </h2>
            <p role="status" style={{ margin: "0 0 16px", color: homeTheme.muted, fontWeight: 800 }}>
              We found {previewJobs.length} {previewJobs.length === 1 ? "job" : "jobs"}.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {previewJobs.map((job, index) => (
                <article
                  key={`${job.title}-${index}`}
                  style={{
                    padding: 16,
                    border: `1px solid ${homeTheme.border}`,
                    borderRadius: 12,
                    backgroundColor: homeTheme.bg,
                  }}
                >
                  <h3 style={{ margin: 0, color: homeTheme.text, fontSize: 19 }}>
                    {job.title}
                  </h3>
                  {job.location ? (
                    <p style={{ margin: "8px 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      Location: {job.location}
                    </p>
                  ) : null}
                  {job.department ? (
                    <p style={{ margin: "6px 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      Department: {job.department}
                    </p>
                  ) : null}
                  {job.employmentType ? (
                    <p style={{ margin: "6px 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      Employment Type: {job.employmentType}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

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

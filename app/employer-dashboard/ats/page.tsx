"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  EMPLOYMENT_OPTIONS,
  ROLE_OPTIONS,
  STATE_OPTIONS,
} from "../../../lib/jobFormOptions";
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
  selectionKey: string;
  title: string;
  location?: string;
  department?: string;
  employmentType?: string;
};

type ReviewField = "location" | "roleCategory" | "employmentType" | "description";
type ReviewIssue = {
  field: ReviewField;
  reason: "missing" | "unmapped";
  originalValue?: string;
  message: string;
};
type PreparedJob = {
  title: string;
  atsLocation?: string;
  city?: string;
  state?: string;
  roleCategory?: string;
  employmentType?: string;
  department?: string;
  descriptionHtml?: string;
};
type PreparedItem =
  | { status: "ready"; providerKey: string; externalId: string; job: PreparedJob }
  | { status: "needs-review"; providerKey: string; externalId: string; job: PreparedJob; issues: ReviewIssue[] }
  | { status: "unavailable"; providerKey: string; externalId: string; message: string };
type PreparedResult = {
  status: "prepared";
  items: PreparedItem[];
  summary: { ready: number; needsReview: number; unavailable: number };
};
type ReviewCorrections = Partial<Record<ReviewField | "city" | "state", string>>;

const MAX_IMPORT_SELECTION = 500;
const JOBS_PER_PAGE = 25;

function getDisplayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toPreviewJob(value: unknown): PreviewJob {
  const job = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    selectionKey: JSON.stringify([
      getDisplayValue(job.providerKey) ?? "",
      getDisplayValue(job.externalId) ?? "",
    ]),
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
  const [selectedJobKeys, setSelectedJobKeys] = useState<Set<string>>(() => new Set());
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedEmploymentType, setSelectedEmploymentType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [preparedResult, setPreparedResult] = useState<PreparedResult | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [reviewCorrections, setReviewCorrections] = useState<Record<string, ReviewCorrections>>({});
  const requestInFlightRef = useRef(false);

  const filterOptions = useMemo(() => {
    function uniqueSortedValues(field: keyof Pick<PreviewJob, "location" | "department" | "employmentType">) {
      return Array.from(
        new Set((previewJobs ?? []).map((job) => job[field]).filter((value): value is string => Boolean(value))),
      ).sort((first, second) => first.localeCompare(second, undefined, { sensitivity: "base" }));
    }

    return {
      locations: uniqueSortedValues("location"),
      departments: uniqueSortedValues("department"),
      employmentTypes: uniqueSortedValues("employmentType"),
    };
  }, [previewJobs]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = jobSearchQuery.trim().toLocaleLowerCase();

    return (previewJobs ?? []).filter((job) => {
      const matchesSearch =
        !normalizedQuery ||
        [job.title, job.location, job.department, job.employmentType].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedQuery),
        );

      return (
        matchesSearch &&
        (!selectedLocation || job.location === selectedLocation) &&
        (!selectedDepartment || job.department === selectedDepartment) &&
        (!selectedEmploymentType || job.employmentType === selectedEmploymentType)
      );
    });
  }, [
    jobSearchQuery,
    previewJobs,
    selectedDepartment,
    selectedEmploymentType,
    selectedLocation,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((currentPage - 1) * JOBS_PER_PAGE, currentPage * JOBS_PER_PAGE),
    [currentPage, filteredJobs],
  );
  const rangeStart = filteredJobs.length === 0 ? 0 : (currentPage - 1) * JOBS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * JOBS_PER_PAGE, filteredJobs.length);

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
    setSelectedJobKeys(new Set());
    setJobSearchQuery("");
    setSelectedLocation("");
    setSelectedDepartment("");
    setSelectedEmploymentType("");
    setCurrentPage(1);
    setResultMessage(null);
    setPreparedResult(null);
    setReviewCorrections({});

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

  function toggleJobSelection(selectionKey: string) {
    setSelectedJobKeys((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(selectionKey)) {
        nextSelection.delete(selectionKey);
      } else if (nextSelection.size < MAX_IMPORT_SELECTION) {
        nextSelection.add(selectionKey);
      }

      return nextSelection;
    });
  }

  function selectAllJobs() {
    if (!previewJobs) return;

    setSelectedJobKeys(
      new Set(
        previewJobs
          .slice(0, MAX_IMPORT_SELECTION)
          .map((job) => job.selectionKey),
      ),
    );
  }

  function clearJobSelection() {
    setSelectedJobKeys(new Set());
  }

  async function prepareSelectedJobs() {
    if (selectedJobKeys.size === 0 || requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsPreparing(true);
    setResultMessage(null);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }

      const selectedKeys = Array.from(selectedJobKeys, (selectionKey) => {
        const [providerKey, externalId] = JSON.parse(selectionKey) as [string, string];
        return { providerKey, externalId };
      });
      const response = await fetch("/api/employer/ats/prepare-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...employerAccountHeaders(accessToken),
        },
        body: JSON.stringify({ careersPageUrl: careersPageUrl.trim(), selectedJobKeys: selectedKeys }),
      });

      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      if (response.status === 400) {
        setResultMessage("Please select at least one available job and try again.");
        return;
      }
      if (response.status === 403) {
        setResultMessage("You don’t have permission to prepare jobs for this employer account.");
        return;
      }
      if (!response.ok) {
        setResultMessage("We couldn’t prepare your selected jobs right now. Please try again.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | PreparedResult
        | { status?: string; message?: unknown }
        | null;
      if (payload?.status === "prepared" && "items" in payload && Array.isArray(payload.items)) {
        setPreparedResult(payload);
        setReviewCorrections({});
        return;
      }
      const safeMessage = payload && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : "We couldn’t prepare your selected jobs right now. Please try again.";
      setResultMessage(safeMessage);
    } catch {
      setResultMessage("We couldn’t prepare your selected jobs right now. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsPreparing(false);
    }
  }

  function updateCorrection(itemKey: string, field: keyof ReviewCorrections, value: string) {
    setReviewCorrections((current) => ({
      ...current,
      [itemKey]: { ...current[itemKey], [field]: value },
    }));
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

        {!preparedResult ? <section style={{ ...homeCardStyle, marginBottom: 16 }}>
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
        </section> : null}

        {!preparedResult && previewJobs && previewJobs.length > 0 ? (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
              Jobs Found
            </h2>
            <p role="status" style={{ margin: "0 0 16px", color: homeTheme.muted, fontWeight: 800 }}>
              We found {previewJobs.length} {previewJobs.length === 1 ? "job" : "jobs"}.
            </p>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <p role="status" style={{ margin: 0, color: homeTheme.text, fontWeight: 900 }}>
                {selectedJobKeys.size} {selectedJobKeys.size === 1 ? "job" : "jobs"} selected
              </p>
              <button
                type="button"
                className="rn-btn-secondary"
                style={homeSecondaryButton}
                onClick={selectAllJobs}
                disabled={
                  selectedJobKeys.size >= Math.min(previewJobs.length, MAX_IMPORT_SELECTION)
                }
              >
                Select All
              </button>
              <button
                type="button"
                className="rn-btn-secondary"
                style={homeSecondaryButton}
                onClick={clearJobSelection}
                disabled={selectedJobKeys.size === 0}
              >
                Clear Selection
              </button>
            </div>
            {selectedJobKeys.size === MAX_IMPORT_SELECTION ? (
              <p role="status" style={{ margin: "0 0 16px", color: homeTheme.muted, fontWeight: 800 }}>
                You can import up to 500 jobs at a time.
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label style={{ flex: "2 1 240px", fontWeight: 900, color: homeTheme.text }}>
                Search Jobs
                <input
                  type="search"
                  value={jobSearchQuery}
                  onChange={(event) => {
                    setJobSearchQuery(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search jobs"
                  style={{ ...homeInputStyle, marginTop: 6 }}
                />
              </label>
              {filterOptions.locations.length > 0 ? (
                <label style={{ flex: "1 1 180px", fontWeight: 900, color: homeTheme.text }}>
                  Location
                  <select
                    value={selectedLocation}
                    onChange={(event) => {
                      setSelectedLocation(event.target.value);
                      setCurrentPage(1);
                    }}
                    style={{ ...homeInputStyle, marginTop: 6 }}
                  >
                    <option value="">All</option>
                    {filterOptions.locations.map((location) => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {filterOptions.departments.length > 0 ? (
                <label style={{ flex: "1 1 180px", fontWeight: 900, color: homeTheme.text }}>
                  Department
                  <select
                    value={selectedDepartment}
                    onChange={(event) => {
                      setSelectedDepartment(event.target.value);
                      setCurrentPage(1);
                    }}
                    style={{ ...homeInputStyle, marginTop: 6 }}
                  >
                    <option value="">All</option>
                    {filterOptions.departments.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {filterOptions.employmentTypes.length > 0 ? (
                <label style={{ flex: "1 1 180px", fontWeight: 900, color: homeTheme.text }}>
                  Employment Type
                  <select
                    value={selectedEmploymentType}
                    onChange={(event) => {
                      setSelectedEmploymentType(event.target.value);
                      setCurrentPage(1);
                    }}
                    style={{ ...homeInputStyle, marginTop: 6 }}
                  >
                    <option value="">All</option>
                    {filterOptions.employmentTypes.map((employmentType) => (
                      <option key={employmentType} value={employmentType}>{employmentType}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {filteredJobs.length > 0 ? (
              <p role="status" style={{ margin: "0 0 16px", color: homeTheme.muted, fontWeight: 800 }}>
                Showing {rangeStart}–{rangeEnd} of {filteredJobs.length} {filteredJobs.length === 1 ? "job" : "jobs"}
              </p>
            ) : (
              <p role="status" style={{ margin: "0 0 16px", color: homeTheme.muted, fontWeight: 800 }}>
                No jobs match your current search or filters.
              </p>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              {paginatedJobs.map((job) => (
                <article
                  key={job.selectionKey}
                  style={{
                    padding: 16,
                    border: `1px solid ${homeTheme.border}`,
                    borderRadius: 12,
                    backgroundColor: homeTheme.bg,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={selectedJobKeys.has(job.selectionKey)}
                      onChange={() => toggleJobSelection(job.selectionKey)}
                      disabled={
                        selectedJobKeys.size === MAX_IMPORT_SELECTION &&
                        !selectedJobKeys.has(job.selectionKey)
                      }
                      aria-label={`Select ${job.title}`}
                      style={{ width: 18, height: 18, margin: "2px 0 0", flexShrink: 0 }}
                    />
                    <h3 style={{ margin: 0, color: homeTheme.text, fontSize: 19 }}>
                      {job.title}
                    </h3>
                  </div>
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
            {filteredJobs.length > 0 ? (
              <nav
                aria-label="Job preview pagination"
                style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}
              >
                <button
                  type="button"
                  className="rn-btn-secondary"
                  style={homeSecondaryButton}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rn-btn-secondary"
                  style={homeSecondaryButton}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </nav>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                className="rn-btn-primary"
                style={{
                  ...homePrimaryButton,
                  ...(selectedJobKeys.size === 0 || isPreparing
                    ? { opacity: 0.55, cursor: "not-allowed" }
                    : {}),
                }}
                onClick={() => void prepareSelectedJobs()}
                disabled={selectedJobKeys.size === 0 || isPreparing}
              >
                {isPreparing ? "Preparing Jobs..." : "Continue"}
              </button>
            </div>
          </section>
        ) : null}

        {preparedResult ? (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  Review Selected Jobs
                </p>
                <h2 style={{ margin: "8px 0 0", fontFamily: "var(--font-heading)", color: homeTheme.text }}>
                  Review Selected Jobs
                </h2>
              </div>
              <button
                type="button"
                className="rn-btn-secondary"
                style={homeSecondaryButton}
                onClick={() => setPreparedResult(null)}
              >
                Back to Selection
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "20px 0" }}>
              {[
                ["Ready", preparedResult.summary.ready],
                ["Needs Review", preparedResult.summary.needsReview],
                ["Unavailable", preparedResult.summary.unavailable],
              ].map(([label, count]) => (
                <div key={label} style={{ padding: 16, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: homeTheme.bg }}>
                  <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>{label}:</p>
                  <p style={{ margin: "4px 0 0", color: homeTheme.text, fontSize: 28, fontWeight: 900 }}>{count}</p>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {preparedResult.items.map((item) => {
                const itemKey = JSON.stringify([item.providerKey, item.externalId]);
                const previewJob = previewJobs?.find((job) => job.selectionKey === itemKey);

                if (item.status === "unavailable") {
                  return (
                    <article key={itemKey} style={{ padding: 18, border: "1px solid #e5b8b8", borderRadius: 12, background: "#fff8f8" }}>
                      <h3 style={{ margin: 0, color: homeTheme.text }}>{previewJob?.title ?? "Selected job"}</h3>
                      <p style={{ margin: "8px 0 0", color: homeTheme.muted, fontWeight: 800 }}>Unavailable</p>
                      <p style={{ margin: "6px 0 0", color: homeTheme.muted }}>{item.message}</p>
                    </article>
                  );
                }

                const job = item.job;
                if (item.status === "ready") {
                  return (
                    <article key={itemKey} style={{ padding: 18, border: "1px solid #b9d7c5", borderRadius: 12, background: "#f6fcf8" }}>
                      <h3 style={{ margin: 0, color: homeTheme.text }}>✓ {job.title}</h3>
                      <p style={{ margin: "8px 0 0", color: homeTheme.muted }}>Location: {[job.city, job.state].filter(Boolean).join(", ")}</p>
                      <p style={{ margin: "6px 0 0", color: homeTheme.muted }}>Category: {job.roleCategory}</p>
                      <p style={{ margin: "6px 0 0", color: homeTheme.muted }}>Employment Type: {job.employmentType}</p>
                      <p style={{ margin: "10px 0 0", color: homeTheme.green, fontWeight: 900 }}>Ready to Import</p>
                    </article>
                  );
                }

                const corrections = reviewCorrections[itemKey] ?? {};
                return (
                  <article key={itemKey} style={{ padding: 18, border: "1px solid #e8cf92", borderRadius: 12, background: "#fffcf3" }}>
                    <h3 style={{ margin: 0, color: homeTheme.text }}>{job.title}</h3>
                    <div style={{ marginTop: 12, color: homeTheme.muted }}>
                      <p style={{ margin: 0, fontWeight: 900 }}>Current ATS values</p>
                      <p style={{ margin: "6px 0 0" }}>Location: {job.atsLocation ?? "Not provided"}</p>
                      <p style={{ margin: "4px 0 0" }}>Role Category: {job.roleCategory ?? "Not mapped"}</p>
                      <p style={{ margin: "4px 0 0" }}>Employment Type: {previewJob?.employmentType ?? job.employmentType ?? "Not provided"}</p>
                      <p style={{ margin: "4px 0 0" }}>Description: {job.descriptionHtml ? "Provided" : "Not provided"}</p>
                    </div>
                    <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                      {item.issues.map((issue) => (
                        <div key={issue.field}>
                          <p style={{ margin: "0 0 8px", color: homeTheme.text, fontWeight: 800 }}>{issue.message}</p>
                          {issue.originalValue ? <p style={{ margin: "-4px 0 8px", color: homeTheme.muted, fontSize: 14 }}>ATS value: {issue.originalValue}</p> : null}
                          {issue.field === "location" ? (
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                              <label style={{ color: homeTheme.text, fontWeight: 800 }}>City
                                <input value={corrections.city ?? ""} onChange={(event) => updateCorrection(itemKey, "city", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }} />
                              </label>
                              <label style={{ color: homeTheme.text, fontWeight: 800 }}>State
                                <select value={corrections.state ?? ""} onChange={(event) => updateCorrection(itemKey, "state", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }}>
                                  <option value="">Select…</option>
                                  {STATE_OPTIONS.map((state) => <option key={state} value={state}>{state}</option>)}
                                </select>
                              </label>
                            </div>
                          ) : issue.field === "roleCategory" ? (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Role Category
                              <select value={corrections.roleCategory ?? ""} onChange={(event) => updateCorrection(itemKey, "roleCategory", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }}>
                                <option value="">Select…</option>
                                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                              </select>
                            </label>
                          ) : issue.field === "employmentType" ? (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Employment Type
                              <select value={corrections.employmentType ?? ""} onChange={(event) => updateCorrection(itemKey, "employmentType", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }}>
                                <option value="">Select…</option>
                                {EMPLOYMENT_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                              </select>
                            </label>
                          ) : (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Description
                              <textarea value={corrections.description ?? ""} onChange={(event) => updateCorrection(itemKey, "description", event.target.value)} rows={5} style={{ ...homeInputStyle, marginTop: 5, resize: "vertical" }} />
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="rn-btn-primary" style={{ ...homePrimaryButton, opacity: 0.55, cursor: "not-allowed" }} disabled title="Import will be available in a future update.">
                Import Selected Jobs
              </button>
            </div>
            <p style={{ margin: "10px 0 0", textAlign: "right", color: homeTheme.muted, fontWeight: 700 }}>
              Your corrections are not saved yet.
            </p>
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

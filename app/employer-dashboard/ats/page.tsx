"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import {
  EMPLOYMENT_OPTIONS,
  ROLE_OPTIONS,
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
type ReviewCorrections = Partial<Record<ReviewField | "employerStoreId", string>>;
type RestaurantLocation = { id: string; location_name: string; city: string | null; state: string | null };
type ImportOutcomeName = "Imported" | "Updated" | "Skipped" | "Failed";
type ImportOutcomeItem = {
  providerKey?: unknown;
  externalId?: unknown;
  message?: unknown;
};
type ImportResultItem = { title: string; message: string };
type ImportResult = {
  summary: { imported: number; updated: number; skipped: number; failed: number };
  groups: Record<ImportOutcomeName, ImportResultItem[]>;
};
type AtsConnection = {
  id: string;
  sourceLabel: string;
  inputUrl: string;
  enabled: boolean;
  connectionStatus: string;
  connectedAt: string | null;
  lastSyncStartedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  consecutiveFailureCount: number;
  importedJobCount: number;
};
type SyncResultSummary = {
  status: string;
  message: string | null;
  counts: string[];
  warning: string | null;
};
type AtsSyncHistoryRow = {
  id: string;
  connectionId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  updated: number;
  closed: number;
  reopened: number;
  needsReview: number;
  failed: number;
  warningMessage: string | null;
};

const MAX_IMPORT_SELECTION = 500;
const JOBS_PER_PAGE = 25;
const JOB_SOURCE_LOAD_ERROR = "We couldn’t load or sync your job sources right now. Please try again.";

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDuration(startedAt: string, completedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatDashboardTimestamp(value: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not synced yet";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (startOfDate === startOfToday) return `Today at ${time}`;
  if (startOfDate === startOfToday - 24 * 60 * 60 * 1000) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${time}`;
}

function getStatusLabel(connection: AtsConnection) {
  if (!connection.enabled) return "Disabled";
  if (connection.connectionStatus === "active") return "Active";
  if (connection.connectionStatus === "error") return "Needs Attention";
  if (connection.connectionStatus === "disconnected") return "Disconnected";
  return "Needs Attention";
}

function summarizeSyncResult(payload: Record<string, unknown> | null): SyncResultSummary {
  const status = typeof payload?.status === "string" ? payload.status : "failed";
  const safeMessage = typeof payload?.message === "string" ? payload.message : null;
  if (status === "already-running") return { status, message: "A sync is already in progress.", counts: [], warning: null };
  if (["disabled", "disconnected", "retrieval-failed", "unsupported-provider", "database-failed"].includes(status)) return { status, message: safeMessage ?? JOB_SOURCE_LOAD_ERROR, counts: [], warning: null };

  const sync = payload?.sync && typeof payload.sync === "object" ? payload.sync as Record<string, unknown> : null;
  const summary = sync?.summary && typeof sync.summary === "object" ? sync.summary as Record<string, unknown> : {};
  const countSpecs: Array<[string, string, string?]> = [["updated", "updated"], ["closed", "closed"], ["reopened", "reopened"], ["available", "new job available", "new jobs available"], ["needsReview", "needs review", "needs review"], ["failed", "failed"]];
  const counts = countSpecs.map(([key, singular, plural]) => pluralize(typeof summary[key] === "number" ? summary[key] : 0, singular, plural));
  if (status === "completed" || status === "completed-with-warning") return { status, message: "Sync completed.", counts, warning: status === "completed-with-warning" ? safeMessage : null };
  return { status, message: safeMessage ?? JOB_SOURCE_LOAD_ERROR, counts: [], warning: null };
}

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

function statusBadgeStyle(tone: "success" | "warning" | "neutral"): React.CSSProperties {
  const toneStyles = {
    success: { borderColor: "rgba(53, 128, 110, 0.28)", backgroundColor: "rgba(53, 128, 110, 0.10)", color: homeTheme.green },
    warning: { borderColor: "#e8cf92", backgroundColor: "#fffcf3", color: homeTheme.text },
    neutral: { borderColor: homeTheme.border, backgroundColor: "#ffffff", color: homeTheme.muted },
  }[tone];

  return {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${toneStyles.borderColor}`,
    borderRadius: 999,
    padding: "5px 10px",
    backgroundColor: toneStyles.backgroundColor,
    color: toneStyles.color,
    fontSize: 13,
    fontWeight: 900,
    whiteSpace: "nowrap",
  };
}

function getConnectionStatusTone(connection: AtsConnection): "success" | "warning" | "neutral" {
  if (!connection.enabled || connection.connectionStatus === "disconnected") return "neutral";
  return connection.connectionStatus === "active" ? "success" : "warning";
}

function getHistoryStatusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status.includes("warning") || status.includes("failed") || status.includes("error")) return "warning";
  return "neutral";
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
  const [resultMessageIsError, setResultMessageIsError] = useState(false);
  const [preparedResult, setPreparedResult] = useState<PreparedResult | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [reviewCorrections, setReviewCorrections] = useState<Record<string, ReviewCorrections>>({});
  const [restaurantLocations, setRestaurantLocations] = useState<RestaurantLocation[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [connections, setConnections] = useState<AtsConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsMessage, setConnectionsMessage] = useState<string | null>(null);
  const [connectionActionMessages, setConnectionActionMessages] = useState<Record<string, string>>({});
  const [syncingConnectionIds, setSyncingConnectionIds] = useState<Set<string>>(() => new Set());
  const [syncResults, setSyncResults] = useState<Record<string, SyncResultSummary>>({});
  const [actingConnectionIds, setActingConnectionIds] = useState<Set<string>>(() => new Set());
  const [editingSourceById, setEditingSourceById] = useState<Record<string, string>>({});
  const [syncHistory, setSyncHistory] = useState<AtsSyncHistoryRow[]>([]);
  const [syncHistoryPage, setSyncHistoryPage] = useState(1);
  const [syncHistoryTotal, setSyncHistoryTotal] = useState(0);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncHistoryMessage, setSyncHistoryMessage] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const connectionsRequestRef = useRef<{ inFlight: boolean; sequence: number }>({ inFlight: false, sequence: 0 });
  const syncHistoryRequestRef = useRef<{ inFlightKey: string | null; sequence: number }>({ inFlightKey: null, sequence: 0 });
  const syncingConnectionIdsRef = useRef<Set<string>>(new Set());

  const importableItems = useMemo(
    () => preparedResult?.items.filter((item) => item.status !== "unavailable") ?? [],
    [preparedResult],
  );
  const hasUnresolvedReviewIssues = useMemo(
    () => importableItems.some((item) => {
      if (item.status !== "needs-review") return false;
      const itemKey = JSON.stringify([item.providerKey, item.externalId]);
      const corrections = reviewCorrections[itemKey] ?? {};
      return item.issues.some((issue) => issue.field === "location"
        ? !corrections.employerStoreId?.trim()
        : !corrections[issue.field]?.trim());
    }),
    [importableItems, reviewCorrections],
  );
  const canImport = Boolean(
    preparedResult && importableItems.length > 0 && !hasUnresolvedReviewIssues && !isImporting,
  );
  const canManageAtsConnectionSettings = employerAccess?.role === "account_owner";

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
  const syncHistoryTotalPages = Math.max(1, Math.ceil(syncHistoryTotal / 10));

  const loadSyncHistory = useCallback(async (token: string, connectionId: string | null, nextPage = 1) => {
    if (!connectionId) {
      syncHistoryRequestRef.current = {
        inFlightKey: null,
        sequence: syncHistoryRequestRef.current.sequence + 1,
      };
      setSyncHistory([]);
      setSyncHistoryTotal(0);
      setSyncHistoryPage(1);
      return;
    }

    const requestKey = `${connectionId}:${nextPage}`;
    if (syncHistoryRequestRef.current.inFlightKey === requestKey) return;

    const requestSequence = syncHistoryRequestRef.current.sequence + 1;
    syncHistoryRequestRef.current = { inFlightKey: requestKey, sequence: requestSequence };
    setSyncHistoryLoading(true);
    setSyncHistoryMessage(null);
    try {
      const params = new URLSearchParams({ connectionId, page: String(nextPage), pageSize: "10" });
      const response = await fetch(`/api/employer/ats/sync-history?${params.toString()}`, { headers: employerAccountHeaders(token) });
      if (syncHistoryRequestRef.current.sequence !== requestSequence) return;
      if (response.status === 401) { router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`); return; }
      if (response.status === 403) { setSyncHistoryMessage("You don’t have permission to view sync history for this employer account."); return; }
      if (!response.ok) { setSyncHistoryMessage("We couldn’t load sync history right now."); return; }
      const payload = (await response.json().catch(() => null)) as { history?: AtsSyncHistoryRow[]; total?: number } | null;
      if (syncHistoryRequestRef.current.sequence !== requestSequence) return;
      setSyncHistory(Array.isArray(payload?.history) ? payload.history : []);
      setSyncHistoryTotal(typeof payload?.total === "number" ? payload.total : 0);
      setSyncHistoryPage(nextPage);
    } catch {
      if (syncHistoryRequestRef.current.sequence === requestSequence) {
        setSyncHistoryMessage("We couldn’t load sync history right now.");
      }
    } finally {
      if (syncHistoryRequestRef.current.sequence === requestSequence) {
        syncHistoryRequestRef.current.inFlightKey = null;
        setSyncHistoryLoading(false);
      }
    }
  }, [router]);

  const loadConnections = useCallback(async (token: string) => {
    if (connectionsRequestRef.current.inFlight) return;

    const requestSequence = connectionsRequestRef.current.sequence + 1;
    connectionsRequestRef.current = { inFlight: true, sequence: requestSequence };
    setConnectionsLoading(true);
    setConnectionsMessage(null);
    try {
      const response = await fetch("/api/employer/ats/connections", { headers: employerAccountHeaders(token) });
      if (connectionsRequestRef.current.sequence !== requestSequence) return;
      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      if (response.status === 403) {
        setConnectionsMessage("You don’t have permission to manage job sources for this employer account.");
        setConnections([]);
        await loadSyncHistory(token, null);
        return;
      }
      if (!response.ok) {
        setConnectionsMessage(JOB_SOURCE_LOAD_ERROR);
        setConnections([]);
        await loadSyncHistory(token, null);
        return;
      }
      const payload = (await response.json().catch(() => null)) as { connections?: AtsConnection[] } | null;
      if (connectionsRequestRef.current.sequence !== requestSequence) return;
      const nextConnections = Array.isArray(payload?.connections) ? payload.connections : [];
      setConnections(nextConnections);
      setEditingSourceById((current) => {
        const next = { ...current };
        for (const connection of nextConnections) {
          if (next[connection.id] === undefined) next[connection.id] = connection.inputUrl;
        }
        return next;
      });
      await loadSyncHistory(token, nextConnections[0]?.id ?? null, 1);
    } catch {
      if (connectionsRequestRef.current.sequence === requestSequence) {
        setConnectionsMessage(JOB_SOURCE_LOAD_ERROR);
        setConnections([]);
        await loadSyncHistory(token, null);
      }
    } finally {
      if (connectionsRequestRef.current.sequence === requestSequence) {
        connectionsRequestRef.current.inFlight = false;
        setConnectionsLoading(false);
      }
    }
  }, [loadSyncHistory, router]);

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
    if (payload?.employer?.accountId) {
      const storesResponse = await fetch("/api/employer/stores?assignableOnly=true", { headers: employerAccountHeaders(token) });
      const storesPayload = (await storesResponse.json().catch(() => null)) as { stores?: RestaurantLocation[] } | null;
      setRestaurantLocations(Array.isArray(storesPayload?.stores)
        ? storesPayload.stores.filter((store) => Boolean(store.city && store.state)) : []);
    }
    await loadConnections(token);
    setAuthStatus("allowed");
  }, [loadConnections]);

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
    setResultMessageIsError(false);
    setPreparedResult(null);
    setReviewCorrections({});
    setImportResult(null);
    setImportMessage(null);

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
        setResultMessageIsError(true);
        setResultMessage("Please enter a valid careers page URL and try again.");
        return;
      }

      if (response.status === 403) {
        setResultMessageIsError(true);
        setResultMessage("You don’t have permission to find jobs for this employer account.");
        return;
      }

      if (!response.ok) {
        setResultMessageIsError(true);
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
        setResultMessageIsError(true);
        setResultMessage(payload.message);
        return;
      }

      setResultMessageIsError(true);
      setResultMessage("We couldn’t find your jobs right now. Please try again.");
    } catch {
      setPreviewJobs(null);
      setResultMessageIsError(true);
      setResultMessage("We couldn’t find your jobs right now. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsFindingJobs(false);
    }
  }

  async function syncConnection(connectionId: string) {
    if (syncingConnectionIdsRef.current.has(connectionId)) return;
    syncingConnectionIdsRef.current.add(connectionId);
    setSyncingConnectionIds((current) => new Set(current).add(connectionId));
    setSyncResults((current) => { const next = { ...current }; delete next[connectionId]; return next; });
    setConnectionActionMessages((current) => { const next = { ...current }; delete next[connectionId]; return next; });
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      const response = await fetch("/api/employer/ats/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...employerAccountHeaders(accessToken) },
        body: JSON.stringify({ connectionId }),
      });
      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      if (response.status === 403) {
        setSyncResults((current) => ({ ...current, [connectionId]: { status: "forbidden", message: "You don’t have permission to manage job sources for this employer account.", counts: [], warning: null } }));
        return;
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      setSyncResults((current) => ({ ...current, [connectionId]: summarizeSyncResult(response.ok ? payload : null) }));
      await loadConnections(accessToken);
    } catch {
      setSyncResults((current) => ({ ...current, [connectionId]: { status: "failed", message: JOB_SOURCE_LOAD_ERROR, counts: [], warning: null } }));
    } finally {
      syncingConnectionIdsRef.current.delete(connectionId);
      setSyncingConnectionIds((current) => { const next = new Set(current); next.delete(connectionId); return next; });
    }
  }

  async function runConnectionAction(connection: AtsConnection, action: "disable" | "enable" | "disconnect" | "update-source") {
    const labels = { disable: "disable automatic sync for", enable: "enable automatic sync for", disconnect: "disconnect", "update-source": "change the careers page URL for" } as const;
    if (action !== "enable" && !window.confirm(`Are you sure you want to ${labels[action]} this job source?`)) return;
    const nextUrl = editingSourceById[connection.id]?.trim();
    if (action === "update-source" && !nextUrl) {
      setConnectionActionMessages((current) => ({ ...current, [connection.id]: "Enter a replacement careers page URL before updating this connection." }));
      return;
    }
    setActingConnectionIds((current) => new Set(current).add(connection.id));
    setConnectionActionMessages((current) => { const next = { ...current }; delete next[connection.id]; return next; });
    setSyncResults((current) => { const next = { ...current }; delete next[connection.id]; return next; });
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      const response = await fetch(`/api/employer/ats/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...employerAccountHeaders(accessToken) },
        body: JSON.stringify(action === "update-source" ? { connectionId: connection.id, careersPageUrl: nextUrl } : { connectionId: connection.id }),
      });
      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      if (response.status === 403) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setConnectionActionMessages((current) => ({ ...current, [connection.id]: payload?.error ?? "You don’t have permission to manage job sources for this employer account." }));
        return;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setConnectionActionMessages((current) => ({ ...current, [connection.id]: payload?.error ?? "We couldn’t update this job source right now. Please try again." }));
        return;
      }
      if (action === "update-source" && nextUrl) setEditingSourceById((current) => ({ ...current, [connection.id]: nextUrl }));
      await loadConnections(accessToken);
    } catch {
      setConnectionActionMessages((current) => ({ ...current, [connection.id]: "We couldn’t update this job source right now. Please try again." }));
    } finally {
      setActingConnectionIds((current) => { const next = new Set(current); next.delete(connection.id); return next; });
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

  async function importSelectedJobs() {
    if (!canImport || requestInFlightRef.current || !preparedResult) return;

    requestInFlightRef.current = true;
    setIsImporting(true);
    setImportMessage(null);

    const attemptedKeys = importableItems.map((item) => ({
      providerKey: item.providerKey,
      externalId: item.externalId,
    }));
    const serializedCorrections = importableItems.flatMap((item) => {
      const itemKey = JSON.stringify([item.providerKey, item.externalId]);
      const values = reviewCorrections[itemKey];
      if (!values) return [];
      const correction: Record<string, string> = {
        providerKey: item.providerKey,
        externalId: item.externalId,
      };
      for (const field of ["employerStoreId", "roleCategory", "employmentType", "description"] as const) {
        const value = values[field]?.trim();
        if (value) correction[field] = value;
      }
      return Object.keys(correction).length > 2 ? [correction] : [];
    });
    const titlesByKey = new Map(importableItems.map((item) => {
      const itemKey = JSON.stringify([item.providerKey, item.externalId]);
      const title = item.job.title;
      return [itemKey, title || "Selected job"];
    }));

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      const response = await fetch("/api/employer/ats/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...employerAccountHeaders(accessToken),
        },
        body: JSON.stringify({
          careersPageUrl: careersPageUrl.trim(),
          selectedJobKeys: attemptedKeys,
          reviewCorrections: serializedCorrections,
        }),
      });
      if (response.status === 401) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/ats")}`);
        return;
      }
      if (response.status === 400) {
        setImportMessage("We couldn’t import these jobs because some information was invalid. Please review your selections and try again.");
        return;
      }
      if (response.status === 403) {
        setImportMessage("You don’t have permission to import jobs for this employer account.");
        return;
      }
      if (!response.ok) {
        setImportMessage("We couldn’t import your jobs right now. Please try again.");
        return;
      }
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (payload?.status !== "completed") {
        setImportMessage(typeof payload?.message === "string"
          ? payload.message
          : "We couldn’t import your jobs right now. Please try again.");
        return;
      }
      const summary = payload.summary as ImportResult["summary"] | undefined;
      if (!summary) {
        setImportMessage("We couldn’t import your jobs right now. Please try again.");
        return;
      }
      const groups = Object.fromEntries(
        (["Imported", "Updated", "Skipped", "Failed"] as ImportOutcomeName[]).map((groupName) => {
          const items = Array.isArray(payload[groupName]) ? payload[groupName] as ImportOutcomeItem[] : [];
          return [groupName, items.map((item, index) => {
            const key = typeof item.providerKey === "string" && typeof item.externalId === "string"
              ? JSON.stringify([item.providerKey, item.externalId])
              : "";
            return {
              title: titlesByKey.get(key) ?? `Selected job ${index + 1}`,
              message: typeof item.message === "string" ? item.message : "No additional details were provided.",
            };
          })];
        }),
      ) as Record<ImportOutcomeName, ImportResultItem[]>;
      setImportResult({ summary, groups });
      await loadConnections(accessToken);
      setPreparedResult(null);
      setSelectedJobKeys(new Set());
      setReviewCorrections({});
    } catch {
      setImportMessage("We couldn’t import your jobs right now. Please try again.");
    } finally {
      requestInFlightRef.current = false;
      setIsImporting(false);
    }
  }

  const isInitialConnectionsLoad = connectionsLoading && connections.length === 0;
  const isInitialHistoryLoad = syncHistoryLoading && syncHistory.length === 0;

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
                Automatically import jobs from your Applicant Tracking System (ATS). Connect your public careers page once and we’ll keep your jobs synchronized.
              </p>
            </div>
            {isImporting ? (
              <button type="button" style={homeSecondaryButton} className="rn-btn-secondary" disabled>
                Back to Dashboard
              </button>
            ) : (
              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">
                Back to Dashboard
              </Link>
            )}
          </div>
        </section>

        {!preparedResult ? <section aria-labelledby="ats-connect-heading" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 1fr)", gap: 16, alignItems: "stretch" }} className="rn-ats-connect-grid">
            <div style={homeCardStyle}>
              <h2 id="ats-connect-heading" style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
                Import Jobs from a Careers Page
              </h2>
              <p style={{ margin: "0 0 12px", color: homeTheme.muted, fontWeight: 800 }}>
                Paste a public Greenhouse or Workday careers-page URL to preview available jobs before importing them.
              </p>
              <p style={{ margin: "0 0 12px", color: homeTheme.muted, fontWeight: 700 }}>
                {connections.length === 0
                  ? "Find jobs first. A saved source will be created after a successful import."
                  : "Already have a saved source? Use Saved Job Sources below to sync it or change its URL."}
              </p>
              <div style={{ margin: "0 0 16px", display: "grid", gap: 6, color: homeTheme.muted, fontWeight: 700, overflowWrap: "anywhere" }}>
                <p style={{ margin: 0, color: homeTheme.text, fontWeight: 900 }}>Examples:</p>
                <p style={{ margin: 0 }}><strong style={{ color: homeTheme.text }}>Greenhouse:</strong> https://boards.greenhouse.io/company</p>
                <p style={{ margin: 0 }}><strong style={{ color: homeTheme.text }}>Workday:</strong> https://company.wd1.myworkdayjobs.com/...</p>
              </div>
              <form className="rn-ats-import-form" onSubmit={findJobs}>
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Careers Page to Search
              <input
                type="url"
                value={careersPageUrl}
                onChange={(event) => setCareersPageUrl(event.target.value)}
                placeholder="https://boards.greenhouse.io/company or https://company.wd1.myworkdayjobs.com/..."
                style={{ ...homeInputStyle, marginTop: 6 }}
                aria-describedby="ats-import-helper ats-public-access-note"
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
                {isFindingJobs ? "Finding Jobs..." : "Find Jobs"}
              </button>
            </div>
            <p id="ats-import-helper" style={{ margin: 0, color: homeTheme.text, fontWeight: 800 }}>
              This searches the careers page and does not change your saved job source.
            </p>
            <p id="ats-public-access-note" style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
              We only read jobs published on the public careers page.
            </p>
            {resultMessage ? <p role={resultMessageIsError ? "alert" : "status"} style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>{resultMessage}</p> : null}
              </form>
            </div>
            <aside aria-labelledby="supported-ats-heading" style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
              <h2 id="supported-ats-heading" style={{ marginTop: 0, marginBottom: 12, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Supported ATS Platforms</h2>
              <p style={{ margin: "0 0 10px", color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>Available Today</p>
              <ul aria-label="ATS platforms available today" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {['Greenhouse', 'Workday'].map((provider) => (
                  <li key={provider} style={{ display: "flex", alignItems: "center", gap: 8, color: homeTheme.text, fontWeight: 900 }}>
                    <span aria-hidden="true" style={{ color: homeTheme.green, fontWeight: 900 }}>✓</span>
                    <span>{provider}</span>
                    <span style={statusBadgeStyle("success")}>Supported</span>
                  </li>
                ))}
              </ul>
              <h3 style={{ margin: "18px 0 8px", color: homeTheme.text, fontSize: 18 }}>More Integrations Coming Soon</h3>
              <ul aria-label="ATS integrations coming soon" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, color: homeTheme.muted, fontWeight: 800 }}>
                {['Lever', 'iCIMS', 'Taleo', 'SmartRecruiters', 'JazzHR', 'Ashby'].map((provider) => (
                  <li key={provider}>{provider}</li>
                ))}
              </ul>
              <p style={{ margin: "16px 0 0", color: homeTheme.text, fontWeight: 900 }}>Don’t see your ATS?</p>
              <p style={{ margin: "4px 0 0", color: homeTheme.muted, fontWeight: 800 }}>We’re adding support based on employer demand.</p>
            </aside>
          </div>
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
                disabled={isImporting}
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
                  const corrections = reviewCorrections[itemKey] ?? {};
                  return (
                    <article key={itemKey} style={{ padding: 18, border: "1px solid #b9d7c5", borderRadius: 12, background: "#f6fcf8" }}>
                      <h3 style={{ margin: 0, color: homeTheme.text }}>✓ {job.title}</h3>
                      <p style={{ margin: "8px 0 0", color: homeTheme.muted }}>Location: {[job.city, job.state].filter(Boolean).join(", ")}</p>
                      <p style={{ margin: "6px 0 0", color: homeTheme.muted }}>Category: {job.roleCategory}</p>
                      <p style={{ margin: "6px 0 0", color: homeTheme.muted }}>Employment Type: {job.employmentType}</p>
                      {job.atsLocation ? <label style={{ display: "block", marginTop: 12, color: homeTheme.text, fontWeight: 800 }}>
                        Change Restaurant Location (optional)
                        <select value={corrections.employerStoreId ?? ""} onChange={(event) => updateCorrection(itemKey, "employerStoreId", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }} disabled={isImporting}>
                          <option value="">Keep current mapping</option>
                          {restaurantLocations.map((location) => <option key={location.id} value={location.id}>{location.location_name} — {location.city}, {location.state}</option>)}
                        </select>
                      </label> : null}
                      <p style={{ margin: "10px 0 0", color: homeTheme.green, fontWeight: 900 }}>Ready to Import</p>
                    </article>
                  );
                }

                const corrections = reviewCorrections[itemKey] ?? {};
                return (
                  <article key={itemKey} style={{ padding: 18, border: "1px solid #e8cf92", borderRadius: 12, background: "#fffcf3" }}>
                    <h3 style={{ margin: 0, color: homeTheme.text }}>{job.title}</h3>
                    <div style={{ marginTop: 12, color: homeTheme.muted }}>
                      <p style={{ margin: 0, fontWeight: 900 }}>Current job values</p>
                      <p style={{ margin: "6px 0 0" }}>Location: {job.atsLocation ?? "Not provided"}</p>
                      <p style={{ margin: "4px 0 0" }}>Role Category: {job.roleCategory ?? "Not mapped"}</p>
                      <p style={{ margin: "4px 0 0" }}>Employment Type: {previewJob?.employmentType ?? job.employmentType ?? "Not provided"}</p>
                      <p style={{ margin: "4px 0 0" }}>Description: {job.descriptionHtml ? "Provided" : "Not provided"}</p>
                    </div>
                    <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                      {item.issues.map((issue) => (
                        <div key={issue.field}>
                          <p style={{ margin: "0 0 8px", color: homeTheme.text, fontWeight: 800 }}>{issue.message}</p>
                          {issue.originalValue ? <p style={{ margin: "-4px 0 8px", color: homeTheme.muted, fontSize: 14 }}>Original value: {issue.originalValue}</p> : null}
                          {issue.field === "location" ? (
                            <label style={{ display: "block", color: homeTheme.text, fontWeight: 800 }}>Restaurant Location
                              <select value={corrections.employerStoreId ?? ""} onChange={(event) => updateCorrection(itemKey, "employerStoreId", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }} disabled={isImporting}>
                                <option value="">Select a restaurant location…</option>
                                {restaurantLocations.map((location) => (
                                  <option key={location.id} value={location.id}>{location.location_name} — {location.city}, {location.state}</option>
                                ))}
                              </select>
                            </label>
                          ) : issue.field === "roleCategory" ? (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Role Category
                              <select value={corrections.roleCategory ?? ""} onChange={(event) => updateCorrection(itemKey, "roleCategory", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }} disabled={isImporting}>
                                <option value="">Select…</option>
                                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                              </select>
                            </label>
                          ) : issue.field === "employmentType" ? (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Employment Type
                              <select value={corrections.employmentType ?? ""} onChange={(event) => updateCorrection(itemKey, "employmentType", event.target.value)} style={{ ...homeInputStyle, marginTop: 5 }} disabled={isImporting}>
                                <option value="">Select…</option>
                                {EMPLOYMENT_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                              </select>
                            </label>
                          ) : (
                            <label style={{ color: homeTheme.text, fontWeight: 800 }}>Description
                              <textarea value={corrections.description ?? ""} onChange={(event) => updateCorrection(itemKey, "description", event.target.value)} rows={5} style={{ ...homeInputStyle, marginTop: 5, resize: "vertical" }} disabled={isImporting} />
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
              <button
                type="button"
                className="rn-btn-primary"
                style={{
                  ...homePrimaryButton,
                  ...(!canImport ? { opacity: 0.55, cursor: "not-allowed" } : {}),
                }}
                disabled={!canImport}
                onClick={() => void importSelectedJobs()}
              >
                {isImporting ? "Importing Jobs..." : "Import Selected Jobs"}
              </button>
            </div>
            {hasUnresolvedReviewIssues ? (
              <p role="status" style={{ margin: "10px 0 0", textAlign: "right", color: homeTheme.muted, fontWeight: 700 }}>
                Complete all required job corrections before importing.
              </p>
            ) : importableItems.length === 0 ? (
              <p role="status" style={{ margin: "10px 0 0", textAlign: "right", color: homeTheme.muted, fontWeight: 700 }}>
                No available jobs are eligible to import.
              </p>
            ) : null}
            {importMessage ? <p role="alert" style={{ margin: "10px 0 0", textAlign: "right", color: homeTheme.muted, fontWeight: 800 }}>{importMessage}</p> : null}
          </section>
        ) : null}

        {importResult ? (
          <section aria-labelledby="import-result-heading" style={{ ...homeCardStyle, marginBottom: 16, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
            <h2 id="import-result-heading" style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
              Import complete
            </h2>
            <div role="status" style={{ display: "flex", flexWrap: "wrap", gap: 16, color: homeTheme.text, fontWeight: 900 }}>
              {([
                ["imported", importResult.summary.imported],
                ["updated", importResult.summary.updated],
                ["skipped", importResult.summary.skipped],
                ["failed", importResult.summary.failed],
              ] as const).map(([label, count]) => (
                <span key={label}>{count} {label}</span>
              ))}
            </div>
            {(["Imported", "Updated", "Skipped", "Failed"] as ImportOutcomeName[]).map((groupName) => (
              importResult.groups[groupName].length > 0 ? (
                <div key={groupName} style={{ marginTop: 22 }}>
                  <h3 style={{ margin: "0 0 10px", color: homeTheme.text }}>{groupName}</h3>
                  <ul style={{ margin: 0, paddingLeft: 22, color: homeTheme.muted }}>
                    {importResult.groups[groupName].map((item, index) => (
                      <li key={`${groupName}-${index}`} style={{ marginTop: index ? 8 : 0 }}>
                        <strong style={{ color: homeTheme.text }}>{item.title}:</strong> {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            ))}
            <Link href="/employer-dashboard" className="rn-btn-primary" style={{ ...homePrimaryButton, display: "inline-flex", marginTop: 24 }}>
              View My Jobs
            </Link>
          </section>
        ) : null}

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: "var(--font-heading)", color: homeTheme.text }}>
                Saved Job Sources
              </h2>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>
                These are the careers pages currently saved for automatic synchronization.
              </p>
            </div>
          </div>
          {isInitialConnectionsLoad ? <p role="status" style={{ color: homeTheme.muted, fontWeight: 800 }}>Loading saved job sources...</p> : null}
          {connectionsLoading && connections.length > 0 ? <p role="status" aria-live="polite" style={{ color: homeTheme.muted, fontWeight: 800 }}>Refreshing saved job sources...</p> : null}
          {connectionsMessage ? <div role="alert" style={{ marginTop: 14, padding: 14, border: "1px solid #e8cf92", borderRadius: 12, background: "#fffcf3", color: homeTheme.text, fontWeight: 800 }}>{connectionsMessage}</div> : null}
          {!isInitialConnectionsLoad && !connectionsMessage && connections.length === 0 ? (
            <p style={{ color: homeTheme.muted, fontWeight: 800 }}>No saved job sources yet. Import jobs from a careers page to create one.</p>
          ) : null}
          {connections.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16 }}>
              {connections.map((connection) => {
                const isSyncing = syncingConnectionIds.has(connection.id);
                const canSync = connection.enabled && connection.connectionStatus !== "disconnected";
                const syncResult = syncResults[connection.id];
                const actionMessage = connectionActionMessages[connection.id];
                return (
                  <article key={connection.id} style={{ padding: 18, border: `1px solid ${homeTheme.border}`, borderRadius: 14, background: homeTheme.bg }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }} aria-label={`Connection status: ${getStatusLabel(connection)}. Sync state: ${connection.enabled ? "Enabled" : "Disabled"}.`}>
                      <span style={statusBadgeStyle(getConnectionStatusTone(connection))}>{getStatusLabel(connection)}</span>
                      <span style={statusBadgeStyle(connection.enabled ? "success" : "neutral")}>{connection.enabled ? "Sync Enabled" : "Sync Disabled"}</span>
                    </div>
                    <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>{connection.sourceLabel}</p>
                    <h3 style={{ margin: "6px 0 0", color: homeTheme.text }}>Saved {connection.sourceLabel} Job Source</h3>
                    <p style={{ margin: "10px 0 0", color: homeTheme.muted, overflowWrap: "anywhere" }}><strong style={{ color: homeTheme.text }}>Current Saved Careers Page:</strong> {connection.inputUrl}</p>
                    {!connection.enabled ? <p style={{ margin: "10px 0 0", color: homeTheme.muted, fontWeight: 800 }}>Automatic and manual synchronization are currently paused for this source.</p> : null}
                    {connection.connectionStatus === "disconnected" ? <p style={{ margin: "10px 0 0", color: homeTheme.muted, fontWeight: 800 }}>This source is no longer synchronized. An account owner can reconnect it by updating the saved careers page.</p> : null}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
                      {[
                        ["Imported Jobs", String(connection.importedJobCount)],
                        ["Last Successful Sync", formatDashboardTimestamp(connection.lastSuccessfulSyncAt)],
                        ["Last Failed Sync", formatDashboardTimestamp(connection.lastFailedSyncAt)],
                        ["Consecutive Failures", String(connection.consecutiveFailureCount)],
                      ].map(([label, value]) => (
                        <div key={label} style={{ padding: 12, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: "#ffffff" }}>
                          <p style={{ margin: 0, color: homeTheme.muted, fontSize: 13, fontWeight: 800 }}>{label}</p>
                          <p style={{ margin: "4px 0 0", color: homeTheme.text, fontWeight: 900 }}>{value}</p>
                        </div>
                      ))}
                    </div>
                    <div aria-label="Synchronization actions" style={{ marginTop: 16 }}>
                      <h4 style={{ margin: "0 0 8px", color: homeTheme.text }}>Synchronization actions</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <button type="button" className="rn-btn-primary" style={{ ...homePrimaryButton, ...(!canSync || isSyncing ? { opacity: 0.55, cursor: "not-allowed" } : {}) }} disabled={!canSync || isSyncing} onClick={() => void syncConnection(connection.id)}>
                        {isSyncing ? "Syncing..." : "Sync Now"}
                      </button>
                      {connection.enabled ? (
                        <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} disabled={actingConnectionIds.has(connection.id)} onClick={() => void runConnectionAction(connection, "disable")}>Disable Sync</button>
                      ) : (
                        <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} disabled={actingConnectionIds.has(connection.id)} onClick={() => void runConnectionAction(connection, "enable")}>Enable Sync</button>
                      )}
                      </div>
                    </div>
                    {canManageAtsConnectionSettings ? (
                      <div aria-label="Connection settings" style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${homeTheme.border}` }}>
                        <h4 style={{ margin: "0 0 8px", color: homeTheme.text }}>Connection settings</h4>
                        <h5 style={{ margin: "0 0 6px", color: homeTheme.text, fontSize: 15 }}>Change Saved Careers Page</h5>
                        <p id={`saved-source-help-${connection.id}`} style={{ margin: "0 0 10px", color: homeTheme.muted, fontWeight: 700 }}>Updating this changes the careers page used for future automatic synchronization.</p>
                        <label htmlFor={`saved-source-url-${connection.id}`} style={{ color: homeTheme.text, fontWeight: 900 }}>
                          New Saved Careers Page URL
                          <input id={`saved-source-url-${connection.id}`} type="url" value={editingSourceById[connection.id] ?? connection.inputUrl} onChange={(event) => { setEditingSourceById((current) => ({ ...current, [connection.id]: event.target.value })); setConnectionActionMessages((current) => { const next = { ...current }; delete next[connection.id]; return next; }); }} aria-describedby={`saved-source-help-${connection.id}`} style={{ ...homeInputStyle, marginTop: 6 }} disabled={actingConnectionIds.has(connection.id)} />
                        </label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                          <button type="button" className="rn-btn-primary" style={homePrimaryButton} disabled={actingConnectionIds.has(connection.id) || !(editingSourceById[connection.id] ?? connection.inputUrl).trim()} onClick={() => void runConnectionAction(connection, "update-source")}>Update Saved Source</button>
                          <button type="button" className="rn-btn-secondary" style={{ ...homeSecondaryButton, borderColor: "#b45b4d", color: "#8b3f35" }} disabled={actingConnectionIds.has(connection.id) || connection.connectionStatus === "disconnected"} onClick={() => void runConnectionAction(connection, "disconnect")}>Disconnect</button>
                        </div>
                        {actionMessage ? <p role="alert" style={{ margin: "10px 0 0", color: homeTheme.text, fontWeight: 800 }}>{actionMessage}</p> : null}
                      </div>
                    ) : null}
                    {syncResult ? (
                      <div role="status" aria-live="polite" style={{ marginTop: 12, color: homeTheme.text, fontWeight: 800 }}>
                        <p style={{ margin: 0 }}>{syncResult.message}</p>
                        {syncResult.counts.length > 0 ? <p style={{ margin: "6px 0 0" }}>{syncResult.counts.join(", ")}</p> : null}
                        {syncResult.warning ? <p style={{ margin: "6px 0 0" }}>{syncResult.warning}</p> : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 8, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Sync History</h2>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Recent synchronization runs for this saved job source.</p>
              {connections[0] ? <p style={{ margin: "6px 0 0", color: homeTheme.muted, overflowWrap: "anywhere" }}><strong style={{ color: homeTheme.text }}>History source:</strong> {connections[0].sourceLabel} — {connections[0].inputUrl}</p> : null}
            </div>
          </div>
          {isInitialHistoryLoad ? <p role="status" style={{ color: homeTheme.muted, fontWeight: 800 }}>Loading sync history...</p> : null}
          {syncHistoryLoading && syncHistory.length > 0 ? <p role="status" aria-live="polite" style={{ color: homeTheme.muted, fontWeight: 800 }}>Refreshing sync history...</p> : null}
          {syncHistoryMessage ? <div role="alert" style={{ marginTop: 14, padding: 14, border: "1px solid #e8cf92", borderRadius: 12, background: "#fffcf3", color: homeTheme.text, fontWeight: 800 }}>{syncHistoryMessage}</div> : null}
          {!isInitialHistoryLoad && !syncHistoryMessage && syncHistory.length === 0 ? <p style={{ color: homeTheme.muted, fontWeight: 800 }}>No sync history yet.</p> : null}
          {syncHistory.length > 0 ? (
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", color: homeTheme.text }}>
                <thead><tr>{["Date", "Status", "Duration", "Jobs Updated", "Jobs Closed", "Jobs Reopened", "Needs Review", "Failed", "Warning"].map((heading) => <th key={heading} style={{ textAlign: "left", borderBottom: `1px solid ${homeTheme.border}`, padding: "10px 8px", whiteSpace: "nowrap" }}>{heading}</th>)}</tr></thead>
                <tbody>{syncHistory.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}`, whiteSpace: "nowrap" }}>{formatDashboardTimestamp(row.startedAt)}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}><span style={statusBadgeStyle(getHistoryStatusTone(row.status))}>{row.status.replaceAll("_", " ")}</span></td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{formatDuration(row.startedAt, row.completedAt)}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{row.updated}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{row.closed}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{row.reopened}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{row.needsReview}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}` }}>{row.failed}</td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${homeTheme.border}`, color: homeTheme.muted, fontSize: 14 }}>{row.warningMessage ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
              <nav aria-label="Sync history pagination" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
                <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={async () => { const { data } = await supabase.auth.getSession(); if (data.session?.access_token) await loadSyncHistory(data.session.access_token, connections[0]?.id ?? null, Math.max(1, syncHistoryPage - 1)); }} disabled={syncHistoryPage === 1 || syncHistoryLoading}>Previous</button>
                <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Page {syncHistoryPage} of {syncHistoryTotalPages}</p>
                <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={async () => { const { data } = await supabase.auth.getSession(); if (data.session?.access_token) await loadSyncHistory(data.session.access_token, connections[0]?.id ?? null, Math.min(syncHistoryTotalPages, syncHistoryPage + 1)); }} disabled={syncHistoryPage >= syncHistoryTotalPages || syncHistoryLoading}>Next</button>
              </nav>
            </div>
          ) : null}
        </section>

        <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Imported Jobs</h2>
          {importResult ? (
            <p style={{ marginBottom: 0, color: homeTheme.muted, fontWeight: 800 }}>Latest import: {importResult.summary.imported} imported, {importResult.summary.updated} updated, {importResult.summary.skipped} skipped, and {importResult.summary.failed} failed.</p>
          ) : (
            <div style={{ marginTop: 8, padding: 16, border: `1px solid ${homeTheme.border}`, borderRadius: 12, background: homeTheme.bg }}><p style={{ margin: 0, color: homeTheme.text, fontWeight: 900 }}>No jobs imported yet.</p><p style={{ margin: "6px 0 0", color: homeTheme.muted, fontWeight: 800 }}>Import jobs from Greenhouse or Workday above to begin automatic synchronization.</p></div>
          )}
        </section>

        <style jsx>{`
          @media (max-width: 900px) {
            .rn-ats-connect-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}

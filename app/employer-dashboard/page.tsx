"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { acceptPendingTeamInvitesForCurrentUser } from "../../lib/teamInviteAcceptance";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";
import {
  canEmployerPauseResume,
  dashboardStatusForJob,
  getEmployerPauseResumeUpdate,
} from "../../lib/jobStatus";
import { canUserAccessJob } from "../../lib/employerJobAccess";

type EmployerOwner = { userId: string; email: string; accountId?: string | null; ownerUserId?: string; ownerEmail?: string };
type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type EmployerAccountMembership = { accountId: string; accountName: string; locationName: string | null; role: EmployerRole; status?: string; invitationPending?: boolean };
type EmployerAccessScope = "single_location" | "multi_location" | "full_account_access";
type EmployerAccess = { role: EmployerRole; userType: EmployerAccessScope; assignedStoreIds: string[]; accountId: string | null; accountName: string | null; restaurantBrandName: string | null; locationName: string | null; memberships: EmployerAccountMembership[]; ownerUserId: string; ownerEmail: string; canManageProfile: boolean; canManageBilling: boolean; canManageJobs: boolean; canViewCandidates: boolean; canUpdateCandidateStatuses: boolean; canManageTeam: boolean; canManageNotificationRouting: boolean; };
type OwnershipMatch = "employer_account_id" | "employer_user_id" | "employer_email";

type DashboardJob = {
  id: string;
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
  status?: string | null;
  employer_user_id: string | null;
  employer_email: string | null;
  ownership_match: OwnershipMatch | null;
  employer_account_id?: string | null;
  employer_store_id?: string | null;
  candidate_notification_email?: string | null;
  candidate_notification_emails?: string[] | string | null;
  created_at: string;
  views: number;
  dashboard_status: "Active" | "Pending" | "Draft" | "Paused" | "Rejected";
};


type CandidateSubmission = {
  id: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  message: string | null;
  resume_filename: string | null;
  status: "new" | "reviewed" | "contacted" | "archived" | string;
  created_at: string;
  job_title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  role_category: string | null;
};

type BillingInfo = {
  billing_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type BillingSummary = {
  billing: BillingInfo | null;
  activeBillableJobCount: number;
  canPostOrActivateJobs: boolean;
  billingGateReason: string;
};

type JobsQueryVariant = {
  fields: string;
  includesStatus: boolean;
  includesViews: boolean;
};

type JobsQueryResult = {
  liveJobs: Array<Record<string, unknown>> | null;
  selectedVariant: JobsQueryVariant | null;
  error: { code?: string; message?: string } | null;
};

type SupabaseActionError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const isDevelopment = process.env.NODE_ENV !== "production";

const PAUSE_RESUME_RETURN_FIELDS = "id,active,status,employer_user_id,employer_email,employer_account_id";
const DELETE_EMAIL_RETURN_FIELDS = "id,employer_email";
const DELETE_USER_ID_RETURN_FIELDS = "id,employer_user_id,employer_email,employer_account_id";
const DELETE_CONFIRMATION_MESSAGE =
  "This will permanently delete your job ad. If you want to repost this position later, you will need to complete the Post a Job form again.";
const CANDIDATE_STATUS_OPTIONS = ["new", "reviewed", "contacted", "archived"] as const;
type CandidateStatusOption = (typeof CANDIDATE_STATUS_OPTIONS)[number];
type CandidateFilter = "all" | CandidateStatusOption;
type CandidateJobLevelFilter = "all" | "hourly_store" | "salaried_manager" | "general_manager" | "area_director" | "regional_director" | "other";
type JobStatusFilter = "all" | "Active" | "Paused" | "Pending" | "Rejected";
type JobSortOption = "newest" | "oldest" | "most_viewed";
type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

const JOB_STATUS_FILTER_OPTIONS: Array<{ value: JobStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Paused", label: "Paused" },
  { value: "Pending", label: "Pending Review" },
  { value: "Rejected", label: "Rejected" },
];

const JOB_LISTINGS_PER_PAGE = 25;
const JOB_PAGINATION_SIBLING_COUNT = 2;

const JOB_SORT_OPTIONS: Array<{ value: JobSortOption; label: string }> = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "most_viewed", label: "Most Viewed" },
];

const CANDIDATE_FILTER_OPTIONS: Array<{ value: CandidateFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "contacted", label: "Contacted" },
  { value: "archived", label: "Archived" },
];

const CANDIDATE_JOB_LEVEL_OPTIONS: Array<{ value: CandidateJobLevelFilter; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "hourly_store", label: "Hourly / Store role" },
  { value: "salaried_manager", label: "Salaried Manager" },
  { value: "general_manager", label: "General Manager" },
  { value: "area_director", label: "Area Director" },
  { value: "regional_director", label: "Regional Director" },
  { value: "other", label: "Other" },
];

function formatBillingDate(isoDate?: string | null) {
  if (!isoDate) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function getTrialStatus(billing: BillingInfo | null) {
  if (!billing?.trial_ends_at) return "Not started";
  const trialEndsAt = new Date(billing.trial_ends_at).getTime();
  if (Number.isFinite(trialEndsAt) && trialEndsAt > Date.now()) {
    return `Trial active until ${formatBillingDate(billing.trial_ends_at)}`;
  }
  return `Trial ended ${formatBillingDate(billing.trial_ends_at)}`;
}

function getSubscriptionStatusLabel(status?: string | null) {
  if (!status) return "Not started";
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isBillingActive(status?: string | null) {
  return status === "active" || status === "trialing";
}

function formatSupabaseActionError(error: SupabaseActionError) {
  const parts = [
    error.message,
    error.code ? `code: ${error.code}` : null,
    error.details ? `details: ${error.details}` : null,
    error.hint ? `hint: ${error.hint}` : null,
  ].filter(Boolean);

  return parts.join(" | ");
}

function pauseResumeFailureMessage(fallback: string, error?: SupabaseActionError | null) {
  if (!isDevelopment) return fallback;
  if (!error) return fallback;

  const formattedError = formatSupabaseActionError(error);
  return formattedError ? `${fallback} Supabase error: ${formattedError}` : fallback;
}

function developmentDeleteFailureMessage(fallback: string, detail: string, error?: SupabaseActionError | null) {
  if (!isDevelopment) return fallback;

  const formattedError = error ? formatSupabaseActionError(error) : "";
  return formattedError ? `${fallback} ${detail} Supabase error: ${formattedError}` : `${fallback} ${detail}`;
}

function isMissingEmployerUserIdColumnError(error: SupabaseActionError | null | undefined) {
  if (!error) return false;

  const message = (error.message ?? "").toLowerCase();
  const details = (error.details ?? "").toLowerCase();
  const hint = (error.hint ?? "").toLowerCase();
  const errorText = `${message} ${details} ${hint}`;

  if (!errorText.includes("employer_user_id")) return false;

  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    errorText.includes("could not find the 'employer_user_id' column") ||
    errorText.includes('column "employer_user_id" does not exist') ||
    errorText.includes("jobs.employer_user_id does not exist")
  );
}




function formatEmployerRole(role?: EmployerRole | null) {
  if (role === "account_owner") return "Account Owner";
  if (role === "hiring_manager") return "Hiring Manager";
  if (role === "viewer") return "Viewer";
  return "Account Owner";
}

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function formatCandidateStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCandidateFilterValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getCandidateLocationLabel(candidate: Pick<CandidateSubmission, "restaurant_name" | "city" | "state">) {
  const cityState = [candidate.city, candidate.state].map((part) => part?.trim()).filter(Boolean).join(", ");
  return [candidate.restaurant_name?.trim(), cityState].filter(Boolean).join(" — ") || "Unlisted location";
}

function getCandidateJobLevel(candidate: Pick<CandidateSubmission, "job_title" | "role_category">): CandidateJobLevelFilter {
  const roleText = `${candidate.job_title ?? ""} ${candidate.role_category ?? ""}`.toLowerCase();

  if (/\bregional\s+director\b/.test(roleText)) return "regional_director";
  if (/\barea\s+director\b/.test(roleText)) return "area_director";
  if (/\bgeneral\s+manager\b/.test(roleText)) return "general_manager";

  if (/\b(salaried|manager|management|assistant\s+manager|shift\s+lead|shift\s+leader|supervisor)\b/.test(roleText)) {
    return "salaried_manager";
  }

  if (/\b(hourly|store|crew|team\s+member|cashier|server|host|hostess|cook|line\s+cook|prep|grill|dishwasher|bartender|barista|service|representative)\b/.test(roleText)) {
    return "hourly_store";
  }

  return "other";
}

function getCandidateJobLevelLabel(value: CandidateJobLevelFilter) {
  return CANDIDATE_JOB_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? "Other";
}

function getCandidateStatusTheme(status: string) {
  const themes: Record<CandidateStatusOption, { bg: string; text: string; border: string; shadow: string }> = {
    new: {
      bg: "rgba(53,128,110,0.12)",
      text: "#1d5b4d",
      border: "rgba(53,128,110,0.28)",
      shadow: "rgba(53,128,110,0.12)",
    },
    reviewed: {
      bg: "rgba(30,137,153,0.12)",
      text: "#11606d",
      border: "rgba(30,137,153,0.28)",
      shadow: "rgba(30,137,153,0.12)",
    },
    contacted: {
      bg: "rgba(227,160,8,0.15)",
      text: "#7a5600",
      border: "rgba(227,160,8,0.32)",
      shadow: "rgba(227,160,8,0.14)",
    },
    archived: {
      bg: "rgba(101,115,126,0.13)",
      text: "#46525c",
      border: "rgba(101,115,126,0.26)",
      shadow: "rgba(101,115,126,0.12)",
    },
  };

  return themes[status as CandidateStatusOption] ?? themes.archived;
}

function candidateStatusControlStyle(status: string): React.CSSProperties {
  const theme = getCandidateStatusTheme(status);

  return {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    boxShadow: `0 8px 18px ${theme.shadow}`,
    color: theme.text,
  };
}

function getJobOwnershipMatch(job: Record<string, unknown>, owner: EmployerOwner): OwnershipMatch | null {
  const employerAccountId = typeof job.employer_account_id === "string" ? job.employer_account_id.trim() : "";
  const employerUserId = typeof job.employer_user_id === "string" ? job.employer_user_id.trim() : "";
  const employerEmail = typeof job.employer_email === "string" ? job.employer_email.trim() : "";

  if (owner.accountId && employerAccountId === owner.accountId) return "employer_account_id";
  if (employerUserId && (employerUserId === owner.userId || employerUserId === owner.ownerUserId)) return "employer_user_id";
  if (employerEmail && (employerEmail === owner.email || employerEmail === owner.ownerEmail)) return "employer_email";

  return null;
}

function hasMissingEmployerOwnership(job: Pick<DashboardJob, "employer_account_id" | "employer_user_id" | "employer_email">) {
  return !job.employer_account_id && !job.employer_user_id && !job.employer_email;
}

function statusPillStyle(status: DashboardJob["dashboard_status"]): React.CSSProperties {
  const statusMap: Record<DashboardJob["dashboard_status"], { bg: string; text: string; border: string }> = {
    Active: { bg: "rgba(53,128,110,0.10)", text: "#1d5b4d", border: "rgba(53,128,110,0.24)" },
    Pending: { bg: "rgba(227,160,8,0.12)", text: "#7a5600", border: "rgba(227,160,8,0.28)" },
    Draft: { bg: "rgba(101,115,126,0.12)", text: "#3f4c56", border: "rgba(101,115,126,0.24)" },
    Paused: { bg: "rgba(173,67,67,0.10)", text: "#8a2f2f", border: "rgba(173,67,67,0.24)" },
    Rejected: { bg: "rgba(173,67,67,0.10)", text: "#8a2f2f", border: "rgba(173,67,67,0.24)" },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: `1px solid ${statusMap[status].border}`,
    backgroundColor: statusMap[status].bg,
    color: statusMap[status].text,
    fontWeight: 800,
    fontSize: 12,
    fontFamily: "var(--font-body)",
    padding: "5px 10px",
  };
}

function getJobPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [1];

  const allPages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const maxPagesWithoutEllipses = 7;
  if (totalPages <= maxPagesWithoutEllipses) return allPages;

  let leftSibling = Math.max(2, currentPage - JOB_PAGINATION_SIBLING_COUNT);
  let rightSibling = Math.min(totalPages - 1, currentPage + JOB_PAGINATION_SIBLING_COUNT);

  if (currentPage <= 1 + JOB_PAGINATION_SIBLING_COUNT) {
    rightSibling = Math.min(totalPages - 1, 1 + JOB_PAGINATION_SIBLING_COUNT * 2);
  }

  if (currentPage >= totalPages - JOB_PAGINATION_SIBLING_COUNT) {
    leftSibling = Math.max(2, totalPages - JOB_PAGINATION_SIBLING_COUNT * 2);
  }

  const items: PaginationItem[] = [1];

  if (leftSibling > 2) {
    items.push("ellipsis-start");
  } else {
    for (let page = 2; page < leftSibling; page += 1) {
      items.push(page);
    }
  }

  for (let page = leftSibling; page <= rightSibling; page += 1) {
    items.push(page);
  }

  if (rightSibling < totalPages - 1) {
    items.push("ellipsis-end");
  } else {
    for (let page = rightSibling + 1; page < totalPages; page += 1) {
      items.push(page);
    }
  }

  items.push(totalPages);
  return items;
}

export default function EmployerDashboardPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [candidates, setCandidates] = useState<CandidateSubmission[]>([]);
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>("all");
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [candidateJobRoleFilter, setCandidateJobRoleFilter] = useState("all");
  const [candidateLocationFilter, setCandidateLocationFilter] = useState("all");
  const [candidateJobLevelFilter, setCandidateJobLevelFilter] = useState<CandidateJobLevelFilter>("all");
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>("all");
  const [jobSortOption, setJobSortOption] = useState<JobSortOption>("newest");
  const [jobCurrentPage, setJobCurrentPage] = useState(1);
  const [areCandidatesExpanded, setAreCandidatesExpanded] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [candidateBusyId, setCandidateBusyId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<"pause" | "unpause" | "delete" | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
  const [deleteJob, setDeleteJob] = useState<DashboardJob | null>(null);
  const [owner, setOwner] = useState<EmployerOwner | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [employerAccess, setEmployerAccess] = useState<EmployerAccess | null>(null);
  const [selectedEmployerAccountId, setSelectedEmployerAccountId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("rn-selected-employer-account-id");
  });
  const [billingBusyAction, setBillingBusyAction] = useState<"checkout" | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [switchingError, setSwitchingError] = useState<string | null>(null);
  const [dashboardLoadingLabel, setDashboardLoadingLabel] = useState("Loading employer dashboard…");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const selectAllJobsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deleteJob) return;
    deleteDialogRef.current?.focus();
  }, [deleteJob]);

  function handleDeleteDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && !busyJobId) {
      setDeleteJob(null);
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = deleteDialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadEmployerJobs(): Promise<JobsQueryResult> {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return { liveJobs: [], selectedVariant: null, error: { message: "Please sign in again before loading job listings." } };

      const response = await fetch("/api/employer/jobs", {
        headers: employerAccountHeaders(accessToken),
      });

      const payload = (await response.json().catch(() => null)) as {
        jobs?: Array<Record<string, unknown>>;
        includesViews?: boolean;
        error?: string;
      } | null;

      if (!response.ok) {
        return { liveJobs: null, selectedVariant: null, error: { message: payload?.error || "Could not load your employer listings." } };
      }

      return {
        liveJobs: payload?.jobs ?? [],
        selectedVariant: { fields: "api", includesStatus: true, includesViews: Boolean(payload?.includesViews) },
        error: null,
      };
    }

    function employerAccountHeaders(accessToken: string) {
      return {
        Authorization: `Bearer ${accessToken}`,
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      };
    }

    async function loadBillingSummary() {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return null;

      const response = await fetch("/api/billing/status", {
        headers: employerAccountHeaders(accessToken),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not load billing details.");
      }

      return (await response.json()) as BillingSummary;
    }

    async function loadCandidateSubmissions() {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return [] as CandidateSubmission[];

      const response = await fetch("/api/employer/candidate-submissions", {
        headers: employerAccountHeaders(accessToken),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not load interested candidates.");
      }

      const payload = (await response.json()) as { candidates?: CandidateSubmission[] };
      return payload.candidates ?? [];
    }

    async function loadDashboard() {
      const { data, error: authError } = await supabase.auth.getUser();
      const authUser = data?.user;

      if (authError || !authUser) {
        router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard")}`);
        return;
      }

      const email = authUser.email?.trim();
      const userId = authUser.id;

      if (!email || !userId) {
        if (mounted) {
          setJobs([]);
          setCandidates([]);
          setAreCandidatesExpanded(false);
          setOwner(null);
          setAuthStatus("allowed");
          setActionError("Your employer session is missing account ownership details. Please sign out and sign back in.");
        }
        return;
      }

      await acceptPendingTeamInvitesForCurrentUser();

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      let access: EmployerAccess | null = null;
      if (accessToken) {
        const accessResponse = await fetch("/api/employer/me", { headers: employerAccountHeaders(accessToken) });
        const accessPayload = (await accessResponse.json().catch(() => null)) as { employer?: EmployerAccess; error?: string } | null;
        if (!accessResponse.ok) {
          throw new Error(accessPayload?.error || "Could not load employer account access.");
        }
        access = accessPayload?.employer ?? null;
        if (mounted && access?.accountId && selectedEmployerAccountId !== access.accountId) {
          setSelectedEmployerAccountId(access.accountId);
          window.localStorage.setItem("rn-selected-employer-account-id", access.accountId);
        }
      }

      const currentOwner = {
        userId,
        email,
        accountId: access?.accountId ?? null,
        ownerUserId: access?.ownerUserId ?? userId,
        ownerEmail: access?.ownerEmail ?? email,
      };
      setActionError(null);
      setActionSuccess(null);

      let nextBillingSummary: BillingSummary | null = null;
      setBillingError(null);
      if (access?.canManageBilling) {
        try {
          nextBillingSummary = await loadBillingSummary();
        } catch (error) {
          if (mounted) setBillingError(error instanceof Error ? error.message : "Could not load billing details.");
        }
      }

      let nextCandidates: CandidateSubmission[] = [];
      setCandidatesError(null);
      try {
        nextCandidates = await loadCandidateSubmissions();
      } catch (error) {
        if (mounted) setCandidatesError(error instanceof Error ? error.message : "Could not load interested candidates.");
      }

      const jobsResult = await loadEmployerJobs();

      if (jobsResult.error || !jobsResult.liveJobs || !jobsResult.selectedVariant) {
        if (mounted) {
          setJobs([]);
          setCandidates(nextCandidates);
          setAreCandidatesExpanded(nextCandidates.some((candidate) => candidate.status === "new"));
          setOwner(currentOwner);
          setBillingSummary(nextBillingSummary);
          setAuthStatus("allowed");
          setActionError(jobsResult.error?.message || "Could not load your employer listings from Supabase.");
        }
        return;
      }

      const visibleJobRows = jobsResult.liveJobs.filter((job) => canUserAccessJob({ email, userType: access?.userType, assignedStoreIds: access?.assignedStoreIds }, access?.role ?? "account_owner", job));

      const hydratedJobs: DashboardJob[] = visibleJobRows.map((job) => {
        const status = jobsResult.selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null;
        const active = Boolean(job.active);
        const employerUserId = typeof job.employer_user_id === "string" && job.employer_user_id.trim() ? job.employer_user_id.trim() : null;
        const employerEmail = typeof job.employer_email === "string" && job.employer_email.trim() ? job.employer_email.trim() : null;
        const employerAccountId = typeof job.employer_account_id === "string" && job.employer_account_id.trim() ? job.employer_account_id.trim() : null;

        return {
          id: String(job.id ?? ""),
          title: String(job.title ?? ""),
          restaurant_name: typeof job.restaurant_name === "string" && job.restaurant_name.trim() ? job.restaurant_name.trim() : null,
          city: typeof job.city === "string" ? job.city : null,
          state: typeof job.state === "string" ? job.state : null,
          active,
          status,
          employer_user_id: employerUserId,
          employer_email: employerEmail,
          employer_account_id: employerAccountId,
          employer_store_id: typeof job.employer_store_id === "string" && job.employer_store_id.trim() ? job.employer_store_id.trim() : null,
          candidate_notification_email: typeof job.candidate_notification_email === "string" ? job.candidate_notification_email : null,
          candidate_notification_emails: Array.isArray(job.candidate_notification_emails)
            ? (job.candidate_notification_emails as string[])
            : typeof job.candidate_notification_emails === "string"
              ? job.candidate_notification_emails
              : null,
          ownership_match: getJobOwnershipMatch(job, currentOwner),
          created_at: String(job.created_at ?? ""),
          views:
            jobsResult.selectedVariant?.includesViews && typeof job.views === "number" && Number.isFinite(job.views)
              ? job.views
              : 0,
          dashboard_status: dashboardStatusForJob(status, active),
        };
      });

      if (mounted) {
        setJobs(hydratedJobs);
        setCandidates(nextCandidates);
        setAreCandidatesExpanded(nextCandidates.some((candidate) => candidate.status === "new"));
        setOwner(currentOwner);
        setBillingSummary(nextBillingSummary);
        setEmployerAccess(access);
        setSwitchingError(null);
        setDashboardLoadingLabel("Loading employer dashboard…");
        setAuthStatus("allowed");
      }
    }

    loadDashboard().catch((error) => {
      if (!mounted) return;
      setJobs([]);
      setCandidates([]);
      setBillingSummary(null);
      setAuthStatus("allowed");
      setSwitchingError(error instanceof Error ? error.message : "Could not switch employer accounts.");
      setActionError(error instanceof Error ? error.message : "Could not switch employer accounts.");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadDashboard().catch((error) => {
        if (!mounted) return;
        setSwitchingError(error instanceof Error ? error.message : "Could not load employer account access.");
        setActionError(error instanceof Error ? error.message : "Could not load employer account access.");
        setAuthStatus("allowed");
      });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router, selectedEmployerAccountId]);

  async function refreshBillingSummary() {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;

    const response = await fetch("/api/billing/status", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      },
    });

    if (response.ok) {
      setBillingSummary((await response.json()) as BillingSummary);
    }
  }

  async function syncBillingQuantity() {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;

    await fetch("/api/billing/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      },
    }).catch(() => null);
  }

  async function handleBillingAction(action: "checkout" | "portal") {
    if (billingBusyAction) return;

    setBillingBusyAction(action);
    setBillingError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setBillingError("Please sign in again before managing billing.");
      setBillingBusyAction(null);
      return;
    }

    const endpoint = action === "checkout" ? "/api/stripe/checkout" : "/api/stripe/portal";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      },
    });
    const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!response.ok || !payload?.url) {
      setBillingError(payload?.error || "Could not open Stripe billing. Please try again.");
      setBillingBusyAction(null);
      return;
    }

    window.location.href = payload.url;
  }

  async function handlePauseToggle(job: DashboardJob) {
    if (busyJobId) return;
    if (!canEmployerPauseResume(job.status)) return;

    const { nextActive, nextStatus } = getEmployerPauseResumeUpdate(job.status, job.active);

    if (nextActive && !billingSummary?.canPostOrActivateJobs) {
      setActionError("Start or reactivate billing before resuming this job ad.");
      return;
    }

    setBusyJobId(job.id);
    setActionError(null);
    setActionSuccess(null);

    const { data, error: authError } = await supabase.auth.getUser();
    const authUser = data?.user;
    const sessionOwner = authUser?.id && authUser.email?.trim()
      ? {
          userId: authUser.id,
          email: authUser.email.trim(),
          accountId: owner?.accountId ?? null,
          ownerUserId: owner?.ownerUserId ?? authUser.id,
          ownerEmail: owner?.ownerEmail ?? authUser.email.trim(),
        }
      : null;
    const currentOwner = sessionOwner ?? owner;

    if (authError || !currentOwner) {
      setActionError("We could not update this job because the employer session is unavailable. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    if (hasMissingEmployerOwnership(job)) {
      setActionError(
        "This job is missing employer ownership details (employer_user_id and employer_email), so it cannot be paused or resumed until it is reassigned to your employer account."
      );
      setBusyJobId(null);
      return;
    }

    const matchedOwnership = getJobOwnershipMatch(job, currentOwner);

    if (!matchedOwnership) {
      setActionError(
        "This job is linked to a different employer account than your current session. Please refresh or sign in with the employer account that owns this listing."
      );
      setBusyJobId(null);
      return;
    }

    const updatePayload = { active: nextActive, status: nextStatus };
    const updateAttempts: OwnershipMatch[] = [
      matchedOwnership,
      ...(matchedOwnership === "employer_account_id"
        ? ["employer_user_id" as const, "employer_email" as const]
        : matchedOwnership === "employer_user_id"
          ? ["employer_email" as const, "employer_account_id" as const]
          : ["employer_user_id" as const, "employer_account_id" as const]),
    ];
    let updateError: SupabaseActionError | null = null;
    let updatedJob: Pick<DashboardJob, "active" | "status" | "employer_user_id" | "employer_email"> | null = null;
    let matchedBy: OwnershipMatch | null = null;

    for (const ownershipField of updateAttempts) {
      const ownerValue = ownershipField === "employer_account_id"
        ? currentOwner.accountId
        : ownershipField === "employer_user_id"
          ? currentOwner.userId
          : currentOwner.email;
      if (!ownerValue) continue;
      const result = await supabase
        .from("jobs")
        .update(updatePayload)
        .eq("id", job.id)
        .eq(ownershipField, ownerValue)
        .select(PAUSE_RESUME_RETURN_FIELDS)
        .maybeSingle();

      if (result.error) {
        updateError = result.error;
        continue;
      }

      if (result.data) {
        updatedJob = {
          active: Boolean(result.data.active),
          status: typeof result.data.status === "string" ? result.data.status : null,
          employer_user_id:
            typeof result.data.employer_user_id === "string" && result.data.employer_user_id.trim()
              ? result.data.employer_user_id.trim()
              : null,
          employer_email:
            typeof result.data.employer_email === "string" && result.data.employer_email.trim()
              ? result.data.employer_email.trim()
              : null,
        };
        matchedBy = ownershipField;
        break;
      }
    }

    if (updateError && !updatedJob) {
      setActionError(
        pauseResumeFailureMessage("We could not save this job status. Please refresh and try again.", updateError)
      );
      setBusyJobId(null);
      return;
    }

    if (!updatedJob) {
      setActionError(
        pauseResumeFailureMessage(
          "This job still appears linked to your employer account, but Supabase did not update the row. Please refresh and try again.",
          {
            message:
              "No row was returned by the authenticated update. This usually means the jobs UPDATE RLS policy blocked the row or the ownership filter did not match at write time.",
          }
        )
      );
      setBusyJobId(null);
      return;
    }

    setOwner(currentOwner);
    setJobs((prev) =>
      prev.map((item) =>
        item.id === job.id
          ? {
              ...item,
              active: updatedJob.active,
              status: updatedJob.status,
              employer_user_id: updatedJob.employer_user_id,
              employer_email: updatedJob.employer_email,
              ownership_match: matchedBy ?? item.ownership_match,
              dashboard_status: dashboardStatusForJob(updatedJob.status, updatedJob.active),
            }
          : item
      )
    );
    setBusyJobId(null);
    void syncBillingQuantity().then(refreshBillingSummary);
  }

  function handleDeleteClick(job: DashboardJob) {
    if (busyJobId) return;
    setActionError(null);
    setActionSuccess(null);
    setDeleteJob(job);
  }

  async function handleConfirmDelete() {
    if (!deleteJob || busyJobId) return;

    const job = deleteJob;
    setBusyJobId(job.id);
    setActionError(null);
    setActionSuccess(null);

    const { data, error: authError } = await supabase.auth.getUser();
    const authUser = data?.user;
    const sessionOwner = authUser?.id && authUser.email?.trim()
      ? {
          userId: authUser.id,
          email: authUser.email.trim(),
          accountId: owner?.accountId ?? null,
          ownerUserId: owner?.ownerUserId ?? authUser.id,
          ownerEmail: owner?.ownerEmail ?? authUser.email.trim(),
        }
      : null;
    const currentOwner = sessionOwner ?? owner;

    if (authError || !currentOwner) {
      setDeleteJob(null);
      setActionError("We could not delete this job because the employer session is unavailable. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    const accountMatchesCurrentEmployer = Boolean(currentOwner.accountId && job.employer_account_id === currentOwner.accountId);
    const emailMatchesCurrentEmployer = job.employer_email === currentOwner.email || job.employer_email === currentOwner.ownerEmail;
    const userIdMatchesCurrentEmployer = job.employer_user_id === currentOwner.userId || job.employer_user_id === currentOwner.ownerUserId;

    if (!accountMatchesCurrentEmployer && !emailMatchesCurrentEmployer && !userIdMatchesCurrentEmployer) {
      setDeleteJob(null);
      setActionError(
        "This job is linked to a different employer account than your current session. Please refresh or sign in with the employer account that owns this listing."
      );
      setBusyJobId(null);
      return;
    }

    const emailOwnershipCheck = accountMatchesCurrentEmployer
      ? { data: null, error: null }
      : await supabase
      .from("jobs")
      .select(DELETE_EMAIL_RETURN_FIELDS)
      .eq("id", job.id)
      .eq("employer_email", currentOwner.email)
      .maybeSingle();

    if (emailOwnershipCheck.error) {
      setDeleteJob(null);
      setActionError(
        developmentDeleteFailureMessage(
          "We could not verify this job before deleting it. Please refresh and try again.",
          "Delete verification failed while checking the exact selected job id against employer_email for the signed-in employer.",
          emailOwnershipCheck.error
        )
      );
      setBusyJobId(null);
      return;
    }

    let deleteResult: { data: { id: string } | null; error: SupabaseActionError | null } = { data: null, error: null };
    let userIdFallbackError: SupabaseActionError | null = null;
    let usedUserIdFallback = false;

    if (accountMatchesCurrentEmployer && currentOwner.accountId) {
      deleteResult = await supabase
        .from("jobs")
        .delete()
        .eq("id", job.id)
        .eq("employer_account_id", currentOwner.accountId)
        .select("id")
        .maybeSingle();
    } else if (emailOwnershipCheck.data) {
      deleteResult = await supabase
        .from("jobs")
        .delete()
        .eq("id", job.id)
        .eq("employer_email", currentOwner.email)
        .select("id")
        .maybeSingle();
    }

    if (!deleteResult.data && userIdMatchesCurrentEmployer) {
      const userIdOwnershipCheck = await supabase
        .from("jobs")
        .select(DELETE_USER_ID_RETURN_FIELDS)
        .eq("id", job.id)
        .eq("employer_user_id", currentOwner.userId)
        .maybeSingle();

      if (userIdOwnershipCheck.error) {
        if (!isMissingEmployerUserIdColumnError(userIdOwnershipCheck.error)) {
          userIdFallbackError = userIdOwnershipCheck.error;
        }
      } else if (userIdOwnershipCheck.data) {
        const userIdDeleteResult = await supabase
          .from("jobs")
          .delete()
          .eq("id", job.id)
          .eq("employer_user_id", currentOwner.userId)
          .select("id")
          .maybeSingle();

        if (userIdDeleteResult.error && isMissingEmployerUserIdColumnError(userIdDeleteResult.error)) {
          userIdFallbackError = null;
        } else {
          deleteResult = userIdDeleteResult;
          usedUserIdFallback = Boolean(userIdDeleteResult.data);
        }
      }
    }

    if (deleteResult.error) {
      setDeleteJob(null);
      setActionError(
        developmentDeleteFailureMessage(
          "We could not delete this job ad. Please refresh and try again.",
          usedUserIdFallback
            ? "Delete failed after employer_user_id ownership matched; inspect the Supabase error for a DELETE policy or permissions problem."
            : "Delete failed after employer_email ownership matched; inspect the Supabase error for a DELETE policy or permissions problem.",
          deleteResult.error
        )
      );
      setBusyJobId(null);
      return;
    }

    if (!deleteResult.data) {
      setDeleteJob(null);
      setActionError(
        developmentDeleteFailureMessage(
          "We could not delete this job ad. Please refresh and try again.",
          userIdFallbackError
            ? "The exact selected job id did not delete by employer_email, and the safe employer_user_id fallback failed."
            : "The exact selected job id did not match employer_email for the signed-in employer, and no safe employer_user_id fallback deleted the row.",
          userIdFallbackError
        )
      );
      setBusyJobId(null);
      return;
    }

    setOwner(currentOwner);
    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    setDeleteJob(null);
    setActionSuccess("Job ad deleted successfully.");
    setBusyJobId(null);
    void syncBillingQuantity().then(refreshBillingSummary);
  }

  async function handleCandidateStatusChange(candidateId: string, nextStatus: string) {
    if (candidateBusyId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setCandidatesError("Please sign in again before updating a candidate.");
      return;
    }

    setCandidateBusyId(candidateId);
    setCandidatesError(null);

    const response = await fetch("/api/employer/candidate-submissions", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      },
      body: JSON.stringify({ id: candidateId, status: nextStatus }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setCandidatesError(payload?.error || "Could not update candidate status.");
      setCandidateBusyId(null);
      return;
    }

    setCandidates((prev) => prev.map((candidate) => (candidate.id === candidateId ? { ...candidate, status: nextStatus } : candidate)));
    setCandidateBusyId(null);
  }

  async function handleResumeOpen(candidateId: string) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setCandidatesError("Please sign in again before opening a resume.");
      return;
    }

    setCandidateBusyId(candidateId);
    setCandidatesError(null);

    const response = await fetch(`/api/employer/candidate-submissions/${encodeURIComponent(candidateId)}/resume`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
      },
    });
    const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!response.ok || !payload?.url) {
      setCandidatesError(payload?.error || "Could not create a secure resume link.");
      setCandidateBusyId(null);
      return;
    }

    window.open(payload.url, "_blank", "noopener,noreferrer");
    setCandidateBusyId(null);
  }

  const candidateJobRoleOptions = useMemo(() => {
    return Array.from(new Set(candidates.map((candidate) => candidate.job_title.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [candidates]);

  const candidateLocationOptions = useMemo(() => {
    return Array.from(new Set(candidates.map((candidate) => getCandidateLocationLabel(candidate)))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [candidates]);

  const activeCandidateJobRoleFilter = candidateJobRoleFilter === "all" || candidateJobRoleOptions.includes(candidateJobRoleFilter) ? candidateJobRoleFilter : "all";
  const activeCandidateLocationFilter = candidateLocationFilter === "all" || candidateLocationOptions.includes(candidateLocationFilter) ? candidateLocationFilter : "all";

  const candidateBaseFilteredCandidates = useMemo(() => {
    const normalizedSearch = candidateSearchQuery.trim().toLowerCase();

    return candidates.filter((candidate) => {
      const locationLabel = getCandidateLocationLabel(candidate);
      const jobLevel = getCandidateJobLevel(candidate);
      const searchableText = [
        candidate.candidate_name,
        candidate.candidate_email,
        candidate.candidate_phone,
        candidate.job_title,
        candidate.role_category,
        candidate.restaurant_name,
        candidate.city,
        candidate.state,
        locationLabel,
      ]
        .map(normalizeCandidateFilterValue)
        .join(" ");

      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
      const matchesRole = activeCandidateJobRoleFilter === "all" || candidate.job_title.trim() === activeCandidateJobRoleFilter;
      const matchesLocation = activeCandidateLocationFilter === "all" || locationLabel === activeCandidateLocationFilter;
      const matchesLevel = candidateJobLevelFilter === "all" || jobLevel === candidateJobLevelFilter;

      return matchesSearch && matchesRole && matchesLocation && matchesLevel;
    });
  }, [activeCandidateJobRoleFilter, activeCandidateLocationFilter, candidateJobLevelFilter, candidateSearchQuery, candidates]);

  const candidateStatusCounts = useMemo(() => {
    return CANDIDATE_STATUS_OPTIONS.reduce(
      (counts, status) => ({
        ...counts,
        [status]: candidateBaseFilteredCandidates.filter((candidate) => candidate.status === status).length,
      }),
      { all: candidateBaseFilteredCandidates.length } as Record<CandidateFilter, number>
    );
  }, [candidateBaseFilteredCandidates]);

  const filteredCandidates = useMemo(() => {
    if (candidateFilter === "all") return candidateBaseFilteredCandidates;
    return candidateBaseFilteredCandidates.filter((candidate) => candidate.status === candidateFilter);
  }, [candidateBaseFilteredCandidates, candidateFilter]);


  const filteredJobs = useMemo(() => {
    const normalizedSearch = jobSearchQuery.trim().toLowerCase();

    return jobs
      .filter((job) => {
        const matchesStatus = jobStatusFilter === "all" || job.dashboard_status === jobStatusFilter;
        if (!matchesStatus) return false;
        if (!normalizedSearch) return true;

        return [job.title, job.city, job.state, job.restaurant_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        if (jobSortOption === "most_viewed") {
          const viewDifference = b.views - a.views;
          if (viewDifference !== 0) return viewDifference;
        }

        const aCreated = new Date(a.created_at).getTime();
        const bCreated = new Date(b.created_at).getTime();

        if (jobSortOption === "oldest") return aCreated - bCreated;
        return bCreated - aCreated;
      });
  }, [jobSearchQuery, jobSortOption, jobStatusFilter, jobs]);

  const jobTotalPages = Math.max(1, Math.ceil(filteredJobs.length / JOB_LISTINGS_PER_PAGE));
  const safeJobCurrentPage = Math.min(jobCurrentPage, jobTotalPages);
  const paginatedJobs = filteredJobs.slice(
    (safeJobCurrentPage - 1) * JOB_LISTINGS_PER_PAGE,
    safeJobCurrentPage * JOB_LISTINGS_PER_PAGE
  );
  const jobPaginationItems = getJobPaginationItems(safeJobCurrentPage, jobTotalPages);
  const jobShowingStart = filteredJobs.length === 0 ? 0 : (safeJobCurrentPage - 1) * JOB_LISTINGS_PER_PAGE + 1;
  const jobShowingEnd = Math.min(safeJobCurrentPage * JOB_LISTINGS_PER_PAGE, filteredJobs.length);
  const filteredJobIds = useMemo(() => new Set(filteredJobs.map((job) => job.id)), [filteredJobs]);
  const selectedJobs = useMemo(() => jobs.filter((job) => selectedJobIds.has(job.id)), [jobs, selectedJobIds]);
  const selectedFilteredJobCount = useMemo(
    () => Array.from(selectedJobIds).filter((jobId) => filteredJobIds.has(jobId)).length,
    [filteredJobIds, selectedJobIds]
  );
  const selectedActiveJobs = selectedJobs.filter((job) => job.dashboard_status === "Active" && canEmployerPauseResume(job.status));
  const selectedPausedJobs = selectedJobs.filter((job) => job.dashboard_status === "Paused" && canEmployerPauseResume(job.status));
  const allFilteredJobsSelected = filteredJobs.length > 0 && filteredJobs.every((job) => selectedJobIds.has(job.id));
  const someFilteredJobsSelected = selectedFilteredJobCount > 0 && !allFilteredJobsSelected;

  function isJobSelectionInteractiveTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("a, button, input, label, select, textarea"));
  }

  function handleJobRowClick(jobId: string, checked: boolean, target: EventTarget | null) {
    if (isJobSelectionInteractiveTarget(target)) return;
    handleToggleJobSelection(jobId, checked);
  }

  function handleJobRowKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, jobId: string, checked: boolean) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    handleToggleJobSelection(jobId, checked);
  }

  useEffect(() => {
    if (selectAllJobsRef.current) {
      selectAllJobsRef.current.indeterminate = someFilteredJobsSelected;
    }
  }, [someFilteredJobsSelected]);

  function handleToggleJobSelection(jobId: string, checked: boolean) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  function handleToggleSelectAllFiltered(checked: boolean) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (checked) filteredJobs.forEach((job) => next.add(job.id));
      else filteredJobs.forEach((job) => next.delete(job.id));
      return next;
    });
  }

  function clearJobSelection() {
    setSelectedJobIds(new Set());
  }

  async function handleBulkAction(action: "pause" | "unpause" | "delete") {
    if (!canManageJobs || bulkAction || selectedJobs.length === 0) return;

    const eligibleJobs = action === "pause"
      ? selectedActiveJobs
      : action === "unpause"
        ? selectedPausedJobs
        : selectedJobs;
    const skippedCount = selectedJobs.length - eligibleJobs.length;

    if (eligibleJobs.length === 0) {
      setActionError(`No selected jobs are eligible to ${action === "unpause" ? "activate" : action}.`);
      return;
    }

    const prompt = action === "pause"
      ? `Pause ${eligibleJobs.length} selected jobs?`
      : action === "unpause"
        ? `Activate ${eligibleJobs.length} selected jobs?`
        : `Delete ${eligibleJobs.length} selected jobs? This action cannot be undone.`;

    if (!window.confirm(prompt)) return;

    const { data, error: authError } = await supabase.auth.getUser();
    const authUser = data?.user;
    const currentOwner = authUser?.id && authUser.email?.trim()
      ? {
          userId: authUser.id,
          email: authUser.email.trim(),
          accountId: owner?.accountId ?? null,
          ownerUserId: owner?.ownerUserId ?? authUser.id,
          ownerEmail: owner?.ownerEmail ?? authUser.email.trim(),
        }
      : owner;

    if (authError || !currentOwner) {
      setActionError("We could not update selected jobs because the employer session is unavailable. Please refresh and try again.");
      return;
    }

    setBulkAction(action);
    setActionError(null);
    setActionSuccess(null);

    const updatePayload = action === "pause" ? { active: false, status: "paused" } : { active: true, status: "active" };
    const affectedIds = new Set<string>();
    let affectedCount = 0;
    let lastError: SupabaseActionError | null = null;

    for (const ownershipField of ["employer_account_id", "employer_user_id", "employer_email"] as OwnershipMatch[]) {
      const ownerValue = ownershipField === "employer_account_id" ? currentOwner.accountId : ownershipField === "employer_user_id" ? currentOwner.userId : currentOwner.email;
      if (!ownerValue) continue;

      const ids = eligibleJobs
        .filter((job) => getJobOwnershipMatch(job, currentOwner) === ownershipField)
        .map((job) => job.id);
      if (ids.length === 0) continue;

      const result = action === "delete"
        ? await supabase.from("jobs").delete().in("id", ids).eq(ownershipField, ownerValue).select("id")
        : await supabase.from("jobs").update(updatePayload).in("id", ids).eq(ownershipField, ownerValue).select("id");

      if (result.error) {
        lastError = result.error;
      } else {
        (result.data ?? []).forEach((row) => affectedIds.add(String(row.id)));
        affectedCount += result.data?.length ?? 0;
      }
    }

    if (affectedCount === 0) {
      setActionError(pauseResumeFailureMessage("We could not update the selected jobs. Please refresh and try again.", lastError));
      setBulkAction(null);
      return;
    }

    setJobs((prev) => action === "delete"
      ? prev.filter((job) => !affectedIds.has(job.id))
      : prev.map((job) => affectedIds.has(job.id)
          ? { ...job, active: updatePayload.active, status: updatePayload.status, dashboard_status: dashboardStatusForJob(updatePayload.status, updatePayload.active) }
          : job));
    clearJobSelection();
    setActionSuccess(`${affectedCount} selected ${affectedCount === 1 ? "job was" : "jobs were"} ${action === "delete" ? "deleted" : action === "pause" ? "paused" : "activated"}.${skippedCount > 0 ? ` ${skippedCount} selected ${skippedCount === 1 ? "job was" : "jobs were"} skipped because ${skippedCount === 1 ? "it is" : "they are"} not eligible.` : ""}`);
    setBulkAction(null);
    void syncBillingQuantity().then(refreshBillingSummary);
  }

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => job.dashboard_status === "Active").length;
    const pending = jobs.filter((job) => job.dashboard_status === "Pending").length;
    const newCandidates = candidates.filter((candidate) => candidate.status === "new").length;
    const totalViews = jobs.reduce((sum, job) => sum + job.views, 0);

    return [
      { label: "Active Jobs", value: active },
      { label: "Pending Review", value: pending },
      { label: "New Candidates", value: newCandidates },
      { label: "Total Views", value: totalViews },
    ];
  }, [jobs, candidates]);

  function handleEmployerAccountChange(nextAccountId: string) {
    const nextMembership = employerAccess?.memberships.find((membership) => membership.accountId === nextAccountId);
    if (nextMembership?.invitationPending) {
      setActionError("That employer account invitation is still pending. Accept the invitation from your email before switching.");
      return;
    }

    setSelectedEmployerAccountId(nextAccountId);
    window.localStorage.setItem("rn-selected-employer-account-id", nextAccountId);
    setDashboardLoadingLabel("Switching employer accounts…");
    setSwitchingError(null);
    setActionError(null);
    setActionSuccess(null);
    setBillingError(null);
    setCandidatesError(null);
    setAuthStatus("loading");
    setJobs([]);
    setCandidates([]);
    setBillingSummary(null);
  }

  const canManageJobs = employerAccess?.canManageJobs ?? true;
  const canManageBilling = employerAccess?.canManageBilling ?? true;
  const canManageProfile = employerAccess?.canManageProfile ?? true;
  const canManageTeam = employerAccess?.canManageTeam ?? true;
  const canUpdateCandidateStatuses = employerAccess?.canUpdateCandidateStatuses ?? true;
  const accessibleMemberships = (employerAccess?.memberships ?? []).filter((membership) => !membership.invitationPending);

  if (authStatus === "loading") {
    return (
      <main
        style={{
          minHeight: "100vh",
          paddingTop: 100,
          backgroundColor: homeTheme.bg,
          color: homeTheme.text,
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 18px" }}>
          {dashboardLoadingLabel}
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        paddingTop: 82,
        paddingBottom: 64,
        backgroundColor: homeTheme.bg,
      }}
    >
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "0 18px" }}>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p
            style={{
              margin: 0,
              color: homeTheme.green,
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
            }}
          >
            Employer Workspace
          </p>
          <h1
            style={{
              marginTop: 8,
              marginBottom: 8,
              fontSize: 40,
              lineHeight: 1.1,
              fontFamily: "var(--font-heading)",
              color: homeTheme.green,
            }}
          >
            Employer Dashboard
          </h1>
          <div className="rn-dashboard-hero-row">
            <div>
              <p
                style={{
                  marginBottom: 0,
                  color: homeTheme.muted,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                Manage your job listings, monitor status, and keep your restaurant hiring pipeline moving.
              </p>
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gap: 8,
                  color: homeTheme.text,
                  fontFamily: "var(--font-body)",
                  fontWeight: 850,
                }}
              >
                <div>
                  Current Employer Account: {employerAccess?.locationName ?? employerAccess?.accountName ?? "Employer Account"}
                </div>
                <div>
                  Role: {formatEmployerRole(employerAccess?.role)}
                </div>
                {accessibleMemberships.length > 1 ? (
                  <label style={{ display: "grid", gap: 6, maxWidth: 360, color: homeTheme.muted, fontSize: 13 }}>
                    Account selector
                    <select
                      className="rn-combobox__input"
                      value={employerAccess?.accountId ?? ""}
                      onChange={(event) => handleEmployerAccountChange(event.target.value)}
                      style={{
                        height: 42,
                        borderRadius: 12,
                        border: `1px solid ${homeTheme.border}`,
                        padding: "0 12px",
                        fontFamily: "var(--font-body)",
                        fontWeight: 800,
                        color: homeTheme.text,
                        backgroundColor: "rgba(255,255,255,0.76)",
                      }}
                    >
                      {accessibleMemberships.map((membership) => (
                        <option key={membership.accountId} value={membership.accountId} disabled={membership.invitationPending}>
                          {membership.locationName ?? membership.accountName} — {formatEmployerRole(membership.role)}{membership.invitationPending ? " (invitation pending)" : ""}
                        </option>
                      ))}
                    </select>
                    Switching accounts immediately reloads jobs, candidates, billing, and permissions for the selected employer account.
                  </label>
                ) : null}
              </div>
            </div>
            <div className="rn-dashboard-actions">
              <Link href="/employer-dashboard/stores" style={homeSecondaryButton} className="rn-btn-secondary">
                Store Directory
              </Link>
              <Link href="/employer-dashboard/job-templates" style={homeSecondaryButton} className="rn-btn-secondary">
                Job Templates
              </Link>
              {canManageTeam ? (
                <Link href="/employer-dashboard/team" style={homeSecondaryButton} className="rn-btn-secondary">
                  Team Access
                </Link>
              ) : null}
              {canManageProfile ? (
                <Link href="/employer-dashboard/profile" style={homeSecondaryButton} className="rn-btn-secondary">
                  My Profile
                </Link>
              ) : (
                <span style={{ color: homeTheme.muted, fontWeight: 800 }}>Contact your account admin to make profile changes.</span>
              )}
            </div>
          </div>
        </section>

        {switchingError ? (
          <div
            role="alert"
            style={{
              ...homeCardStyle,
              marginBottom: 16,
              border: "1px solid rgba(173,67,67,0.28)",
              backgroundColor: "rgba(173,67,67,0.08)",
              color: "#8a2f2f",
              fontFamily: "var(--font-body)",
              fontWeight: 800,
            }}
          >
            {switchingError}
          </div>
        ) : null}

        <section className="rn-dashboard-metrics" style={{ marginBottom: 16 }}>
          {metrics.map((metric) => (
            <article
              key={metric.label}
              style={{
                ...homeCardStyle,
                padding: 18,
                boxShadow: "0 12px 26px rgba(0,0,0,.08)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  color: homeTheme.muted,
                  fontWeight: 800,
                  fontFamily: "var(--font-body)",
                }}
              >
                {metric.label}
              </p>
              <p
                style={{
                  margin: "8px 0 0 0",
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.green,
                  fontSize: 34,
                  lineHeight: 1,
                }}
              >
                {metric.value}
              </p>
            </article>
          ))}
        </section>

        {canManageBilling ? (
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-dashboard-header-row">
            <div>
              <h2
                style={{
                  margin: 0,
                  color: homeTheme.text,
                  fontSize: 26,
                  fontFamily: "var(--font-heading)",
                  lineHeight: 1.2,
                }}
              >
                Billing
              </h2>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  color: homeTheme.muted,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                30-day free trial, then $9 per active approved public job ad every 30 days.
              </p>
            </div>
            <div className="rn-dashboard-actions">
              <button
                type="button"
                style={homePrimaryButton}
                className="rn-btn-primary"
                onClick={() => handleBillingAction("checkout")}
                disabled={billingBusyAction !== null || isBillingActive(billingSummary?.billing?.billing_status)}
              >
                {billingBusyAction === "checkout"
                  ? "Opening..."
                  : isBillingActive(billingSummary?.billing?.billing_status)
                    ? "Trial Started"
                    : "Start Free Trial"}
              </button>
              <button
                type="button"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
                onClick={() => handleBillingAction("portal")}
                disabled={billingBusyAction !== null || !billingSummary?.billing?.stripe_customer_id}
              >
                {billingBusyAction === "portal" ? "Opening..." : "Manage Billing"}
              </button>
            </div>
          </div>

          {billingError ? (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(173,67,67,0.28)",
                backgroundColor: "rgba(173,67,67,0.08)",
                color: "#8a2f2f",
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                padding: "12px 14px",
              }}
            >
              {billingError}
            </div>
          ) : null}

          <div className="rn-billing-grid">
            {[
              { label: "Trial Status", value: getTrialStatus(billingSummary?.billing ?? null) },
              { label: "Subscription", value: getSubscriptionStatusLabel(billingSummary?.billing?.billing_status) },
              { label: "Active Billable Jobs", value: billingSummary?.activeBillableJobCount ?? "—" },
              {
                label: "Next Billing Date",
                value: formatBillingDate(billingSummary?.billing?.subscription_current_period_end),
              },
            ].map((item) => (
              <article key={item.label} className="rn-billing-stat">
                <p>{item.label}</p>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>
        ) : (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Billing</h2>
            <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Contact your account admin to manage billing.</p>
          </section>
        )}

        <section id="interested-candidates" style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-dashboard-header-row rn-candidate-section-header">
            <div>
              <div className="rn-candidate-title-row">
                <h2
                  style={{
                    margin: 0,
                    color: homeTheme.text,
                    fontSize: 26,
                    fontFamily: "var(--font-heading)",
                    lineHeight: 1.2,
                  }}
                >
                  Interested Candidates
                </h2>
                <span className="rn-candidate-count-pill">{candidates.length} total</span>
                <span className="rn-candidate-count-pill rn-candidate-count-pill-new">{candidateStatusCounts.new} new</span>
              </div>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  color: homeTheme.muted,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                Candidate submissions from your public job ad pages, newest first.
              </p>
            </div>
            <button
              type="button"
              className="rn-candidate-toggle"
              onClick={() => setAreCandidatesExpanded((isExpanded) => !isExpanded)}
              aria-controls="interested-candidates-content"
              aria-expanded={areCandidatesExpanded}
            >
              <span>{areCandidatesExpanded ? "Collapse" : "Expand"}</span>
              <span className="rn-candidate-toggle-icon" aria-hidden="true">
                {areCandidatesExpanded ? "−" : "+"}
              </span>
            </button>
          </div>

          {candidatesError ? (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(173,67,67,0.28)",
                backgroundColor: "rgba(173,67,67,0.08)",
                color: "#8a2f2f",
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                padding: "12px 14px",
              }}
            >
              {candidatesError}
            </div>
          ) : null}

          {!areCandidatesExpanded ? (
            <p className="rn-candidate-collapsed-summary">
              {candidates.length} total candidates • {candidateStatusCounts.new} new
            </p>
          ) : (
            <div id="interested-candidates-content">
          {candidates.length > 0 ? (
            <>
              <div className="rn-candidate-filter-controls" aria-label="Filter interested candidates">
                <label className="rn-candidate-filter-control rn-candidate-filter-control-search">
                  <span>Search</span>
                  <input
                    type="search"
                    value={candidateSearchQuery}
                    onChange={(event) => setCandidateSearchQuery(event.target.value)}
                    placeholder="Search name, email, phone, job, or location"
                    aria-label="Search interested candidates"
                  />
                </label>
                <label className="rn-candidate-filter-control">
                  <span>Job Role</span>
                  <select
                    className="rn-combobox__input"
                    value={activeCandidateJobRoleFilter}
                    onChange={(event) => setCandidateJobRoleFilter(event.target.value)}
                    aria-label="Filter interested candidates by job role"
                  >
                    <option value="all">All job roles</option>
                    {candidateJobRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rn-candidate-filter-control">
                  <span>Location</span>
                  <select
                    className="rn-combobox__input"
                    value={activeCandidateLocationFilter}
                    onChange={(event) => setCandidateLocationFilter(event.target.value)}
                    aria-label="Filter interested candidates by location"
                  >
                    <option value="all">All locations</option>
                    {candidateLocationOptions.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rn-candidate-filter-control">
                  <span>Job Level</span>
                  <select
                    className="rn-combobox__input"
                    value={candidateJobLevelFilter}
                    onChange={(event) => setCandidateJobLevelFilter(event.target.value as CandidateJobLevelFilter)}
                    aria-label="Filter interested candidates by job level"
                  >
                    {CANDIDATE_JOB_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rn-candidate-filter-summary" role="status">
                Showing {filteredCandidates.length} of {candidates.length} access-allowed candidates
                {candidateJobLevelFilter !== "all" ? ` • ${getCandidateJobLevelLabel(candidateJobLevelFilter)}` : ""}
              </div>

              <div className="rn-candidate-filters" aria-label="Filter interested candidates by status">
                {CANDIDATE_FILTER_OPTIONS.map((filter) => {
                  const isActive = candidateFilter === filter.value;

                  return (
                    <button
                      type="button"
                      className={`rn-candidate-filter${isActive ? " rn-candidate-filter-active" : ""}`}
                      key={filter.value}
                      onClick={() => setCandidateFilter(filter.value)}
                      aria-pressed={isActive}
                    >
                      <span>{filter.label}</span>
                      <strong>{candidateStatusCounts[filter.value]}</strong>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {candidates.length === 0 ? (
            <div className="rn-candidate-empty">
              No interested candidates yet. When job seekers send their information, they will appear here.
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="rn-candidate-empty">
              No candidates match the selected search, job role, location, job level, and status filters.
            </div>
          ) : (
            <div className="rn-candidate-list">
              {filteredCandidates.map((candidate) => (
                <article className="rn-candidate-card" id={`candidate-${candidate.id}`} key={candidate.id}>
                  <div className="rn-candidate-card-header">
                    <div>
                      <h3>{candidate.candidate_name}</h3>
                      <p>
                        {candidate.job_title} • {[candidate.restaurant_name, [candidate.city, candidate.state].filter(Boolean).join(", ")]
                          .filter(Boolean)
                          .join(" — ") || "Restaurant job"}
                      </p>
                      <p>Submitted {formatDate(candidate.created_at)}</p>
                    </div>
                    <label className="rn-candidate-status-label">
                      <span>Status</span>
                      <span className="rn-candidate-status-control" style={candidateStatusControlStyle(candidate.status)}>
                        <span className="rn-candidate-status-dot" aria-hidden="true" />
                        <select
                          value={candidate.status}
                          onChange={(event) => handleCandidateStatusChange(candidate.id, event.target.value)}
                          disabled={!canUpdateCandidateStatuses || candidateBusyId === candidate.id}
                          aria-label={`Update ${candidate.candidate_name}'s status`}
                        >
                        {CANDIDATE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {formatCandidateStatus(status)}
                          </option>
                        ))}
                        </select>
                      </span>
                    </label>
                  </div>
                  <div className="rn-candidate-contact-grid">
                    <div>
                      <span>Email</span>
                      <a href={`mailto:${candidate.candidate_email}`}>{candidate.candidate_email}</a>
                    </div>
                    <div>
                      <span>Phone</span>
                      <a href={`tel:${candidate.candidate_phone}`}>{candidate.candidate_phone}</a>
                    </div>
                    <div>
                      <span>Resume</span>
                      {candidate.resume_filename ? (
                        <button
                          type="button"
                          className="rn-resume-link"
                          onClick={() => handleResumeOpen(candidate.id)}
                          disabled={candidateBusyId === candidate.id}
                        >
                          {candidateBusyId === candidate.id ? "Opening..." : candidate.resume_filename}
                        </button>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                  {candidate.message ? <p className="rn-candidate-message">{candidate.message}</p> : null}
                </article>
              ))}
            </div>
          )}
            </div>
          )}
        </section>

        <section style={homeCardStyle}>
          <div className="rn-dashboard-header-row">
            <div>
              <h2
                style={{
                  margin: 0,
                  color: homeTheme.text,
                  fontSize: 26,
                  fontFamily: "var(--font-heading)",
                  lineHeight: 1.2,
                }}
              >
                Job Listings
              </h2>
              <p
                style={{
                  marginTop: 6,
                  marginBottom: 0,
                  color: homeTheme.muted,
                  fontWeight: 600,
                  fontFamily: "var(--font-body)",
                }}
              >
                Showing your current posted jobs.
              </p>
              <p className="rn-dashboard-rejected-note">
                If your job ad was rejected, please contact{" "}
                <a href="mailto:team@restaurantsnowhiring.com">team@restaurantsnowhiring.com</a> or use the{" "}
                <Link href="/contact">Contact page</Link> for additional information.
              </p>
            </div>
            {canManageJobs ? (
              <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
                Post New Job
              </Link>
            ) : null}
          </div>

          {actionError ? (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(173,67,67,0.28)",
                backgroundColor: "rgba(173,67,67,0.08)",
                color: "#8a2f2f",
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                padding: "12px 14px",
              }}
            >
              {actionError}
            </div>
          ) : null}

          {actionSuccess ? (
            <div
              role="status"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(53,128,110,0.24)",
                backgroundColor: "rgba(53,128,110,0.10)",
                color: homeTheme.green,
                fontFamily: "var(--font-body)",
                fontWeight: 800,
                padding: "12px 14px",
              }}
            >
              {actionSuccess}
            </div>
          ) : null}

          {jobs.length === 0 ? (
            <div
              style={{
                marginTop: 16,
                borderRadius: 16,
                border: `1px dashed ${homeTheme.border}`,
                padding: 24,
                textAlign: "center",
                backgroundColor: "rgba(255,255,255,.6)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                No jobs yet
              </h3>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 600 }}>
                {canManageJobs ? "You have not posted any jobs yet. Start your first listing to begin receiving applicants." : "This employer account does not have any jobs yet."}
              </p>
              {canManageJobs ? (
                <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
                  Create Your First Job
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rn-job-listing-controls" aria-label="Filter and sort job listings">
                <label className="rn-job-listing-control rn-job-listing-search">
                  <span>Search jobs</span>
                  <input
                    type="search"
                    value={jobSearchQuery}
                    onChange={(event) => {
                      setJobSearchQuery(event.target.value);
                      setSelectedJobIds(new Set());
                      setJobCurrentPage(1);
                    }}
                    placeholder="Search by title, city, state, or restaurant"
                    aria-label="Search job listings by title, city, state, or restaurant"
                  />
                </label>
                <label className="rn-job-listing-control">
                  <span>Status</span>
                  <select
                    className="rn-combobox__input"
                    value={jobStatusFilter}
                    onChange={(event) => {
                      setJobStatusFilter(event.target.value as JobStatusFilter);
                      setSelectedJobIds(new Set());
                      setJobCurrentPage(1);
                    }}
                    aria-label="Filter job listings by status"
                  >
                    {JOB_STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rn-job-listing-control">
                  <span>Sort</span>
                  <select
                    className="rn-combobox__input"
                    value={jobSortOption}
                    onChange={(event) => {
                      setJobSortOption(event.target.value as JobSortOption);
                      setSelectedJobIds(new Set());
                      setJobCurrentPage(1);
                    }}
                    aria-label="Sort job listings"
                  >
                    {JOB_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {filteredJobs.length === 0 ? (
                <div className="rn-job-listing-empty" role="status">
                  No matching job listings found.
                </div>
              ) : (
                <>
                  <nav className="rn-job-listing-pagination" aria-label="Job listings pagination">
                    <span>Showing {jobShowingStart}-{jobShowingEnd} of {filteredJobs.length}</span>
                    <div className="rn-job-listing-pagination__controls">
                      <button
                        type="button"
                        className="rn-btn-secondary rn-job-listing-pagination__button"
                        style={homeSecondaryButton}
                        onClick={() => setJobCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safeJobCurrentPage === 1}
                      >
                        Previous
                      </button>
                      {jobPaginationItems.map((item) => (
                        typeof item === "number" ? (
                          <button
                            key={item}
                            type="button"
                            className={item === safeJobCurrentPage ? "rn-job-listing-pagination__page rn-job-listing-pagination__page--current" : "rn-job-listing-pagination__page"}
                            onClick={() => setJobCurrentPage(item)}
                            aria-current={item === safeJobCurrentPage ? "page" : undefined}
                            aria-label={`Go to job listings page ${item}`}
                          >
                            {item}
                          </button>
                        ) : (
                          <span key={item} className="rn-job-listing-pagination__ellipsis" aria-hidden="true">…</span>
                        )
                      ))}
                      <button
                        type="button"
                        className="rn-btn-secondary rn-job-listing-pagination__button"
                        style={homeSecondaryButton}
                        onClick={() => setJobCurrentPage((page) => Math.min(jobTotalPages, page + 1))}
                        disabled={safeJobCurrentPage === jobTotalPages}
                      >
                        Next
                      </button>
                    </div>
                  </nav>
                  <div className="rn-job-bulk-toolbar" role="region" aria-label="Bulk job selection and actions">
                    <label className="rn-job-select-all-control">
                      <input
                        ref={selectAllJobsRef}
                        className="rn-job-select-all-input"
                        type="checkbox"
                        checked={allFilteredJobsSelected}
                        onChange={(event) => handleToggleSelectAllFiltered(event.target.checked)}
                        aria-label={`Select all ${filteredJobs.length} filtered job listings`}
                      />
                      <span className="rn-job-select-all-mark" aria-hidden="true" />
                      <span>Select all</span>
                    </label>
                    <strong>{selectedJobs.length > 0 ? `${selectedJobs.length} selected` : "Select jobs"}</strong>
                    {selectedJobs.length > 0 ? (
                      <>
                      <button
                        type="button"
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                        onClick={() => handleBulkAction("pause")}
                        disabled={bulkAction !== null || selectedActiveJobs.length === 0}
                      >
                        {bulkAction === "pause" ? "Pausing..." : "Pause Selected"}
                      </button>
                      <button
                        type="button"
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                        onClick={() => handleBulkAction("unpause")}
                        disabled={bulkAction !== null || selectedPausedJobs.length === 0}
                      >
                        {bulkAction === "unpause" ? "Activating..." : "Unpause Selected"}
                      </button>
                      <button
                        type="button"
                        style={homeSecondaryButton}
                        className="rn-btn-secondary rn-btn-delete"
                        onClick={() => handleBulkAction("delete")}
                        disabled={bulkAction !== null}
                      >
                        {bulkAction === "delete" ? "Deleting..." : "Delete Selected"}
                      </button>
                      <button type="button" style={homeSecondaryButton} className="rn-btn-secondary" onClick={clearJobSelection} disabled={bulkAction !== null}>
                        Clear Selection
                      </button>
                      </>
                    ) : null}
                  </div>
                  <div className="rn-dashboard-table-wrap">
                <table className="rn-dashboard-table">
                  <colgroup>
                    <col className="rn-dashboard-table__col-title" />
                    <col className="rn-dashboard-table__col-status" />
                    <col className="rn-dashboard-table__col-location" />
                    <col className="rn-dashboard-table__col-date" />
                    <col className="rn-dashboard-table__col-views" />
                    <col className="rn-dashboard-table__col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Date Posted</th>
                      <th>Views</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedJobs.map((job) => {
                      const isSelected = selectedJobIds.has(job.id);
                      return (
                        <tr
                          key={job.id}
                          className={isSelected ? "rn-dashboard-table__row--selected" : undefined}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`${isSelected ? "Deselect" : "Select"} ${job.title}`}
                          tabIndex={0}
                          onClick={(event) => handleJobRowClick(job.id, !isSelected, event.target)}
                          onKeyDown={(event) => handleJobRowKeyDown(event, job.id, !isSelected)}
                        >
                          <td>
                            <span className="rn-dashboard-title-with-select">
                              <span className="rn-dashboard-row-check" aria-hidden="true">✓</span>
                              <span>{job.title}</span>
                            </span>
                          </td>
                        <td>
                          <span style={statusPillStyle(job.dashboard_status)}>{job.dashboard_status}</span>
                        </td>
                        <td>{[job.city, job.state].filter(Boolean).join(", ") || "—"}</td>
                        <td>{formatDate(job.created_at)}</td>
                        <td>{job.views}</td>
                        <td>
                          <div className="rn-dashboard-actions">
                            <Link
                              href={`/jobs/${job.id}`}
                              prefetch={false}
                              style={homeSecondaryButton}
                              className="rn-btn-secondary"
                            >
                              View
                            </Link>
                            {canManageJobs ? (
                              <Link
                                href={`/employer-dashboard/jobs/${job.id}/edit`}
                                style={homeSecondaryButton}
                                className="rn-btn-secondary"
                              >
                                Edit
                              </Link>
                            ) : null}
                            {canManageJobs && canEmployerPauseResume(job.status) ? (
                              <button
                                type="button"
                                style={homeSecondaryButton}
                                className="rn-btn-secondary"
                                onClick={() => (canManageJobs ? handlePauseToggle(job) : setActionError("Contact your account admin to make changes."))}
                                disabled={busyJobId === job.id}
                              >
                                {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                              </button>
                            ) : null}
                            {canManageJobs ? (
                              <button
                                type="button"
                                style={homeSecondaryButton}
                                className="rn-btn-secondary rn-btn-delete"
                                onClick={() => handleDeleteClick(job)}
                                disabled={busyJobId === job.id}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rn-dashboard-mobile-list">
                {paginatedJobs.map((job) => {
                  const isSelected = selectedJobIds.has(job.id);
                  return (
                    <article
                      key={`mobile-${job.id}`}
                      className={`rn-dashboard-mobile-card ${isSelected ? "rn-dashboard-mobile-card--selected" : ""}`}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`${isSelected ? "Deselect" : "Select"} ${job.title}`}
                      tabIndex={0}
                      onClick={(event) => handleJobRowClick(job.id, !isSelected, event.target)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        handleToggleJobSelection(job.id, !isSelected);
                      }}
                    >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <h3 className="rn-dashboard-mobile-title" style={{ margin: 0, fontSize: 18, color: homeTheme.text, fontFamily: "var(--font-heading)" }}>
                        <span className="rn-dashboard-row-check" aria-hidden="true">✓</span>
                        <span>{job.title}</span>
                      </h3>
                      <span style={statusPillStyle(job.dashboard_status)}>{job.dashboard_status}</span>
                    </div>
                    <p style={{ margin: "8px 0 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      {[job.city, job.state].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: homeTheme.muted, fontWeight: 700 }}>
                      Posted {formatDate(job.created_at)} • {job.views} views
                    </p>
                    <div className="rn-dashboard-actions" style={{ marginTop: 12 }}>
                      <Link
                        href={`/jobs/${job.id}`}
                        prefetch={false}
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                      >
                        View
                      </Link>
                      {canManageJobs ? (
                        <Link
                          href={`/employer-dashboard/jobs/${job.id}/edit`}
                          style={homeSecondaryButton}
                          className="rn-btn-secondary"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {canManageJobs && canEmployerPauseResume(job.status) ? (
                        <button
                          type="button"
                          style={homeSecondaryButton}
                          className="rn-btn-secondary"
                          onClick={() => (canManageJobs ? handlePauseToggle(job) : setActionError("Contact your account admin to make changes."))}
                          disabled={busyJobId === job.id}
                        >
                          {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                        </button>
                      ) : null}
                      {canManageJobs ? (
                        <button
                          type="button"
                          style={homeSecondaryButton}
                          className="rn-btn-secondary rn-btn-delete"
                          onClick={() => handleDeleteClick(job)}
                          disabled={busyJobId === job.id}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    </article>
                  );
                })}
              </div>

                </>
              )}
            </>
          )}
        </section>
      </div>

      {deleteJob ? (
        <div className="rn-delete-modal-backdrop" role="presentation">
          <div
            aria-labelledby="delete-job-title"
            aria-describedby="delete-job-description"
            aria-modal="true"
            className="rn-delete-modal"
            onKeyDown={handleDeleteDialogKeyDown}
            ref={deleteDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <p className="rn-delete-modal-eyebrow">Confirm delete</p>
            <h2 id="delete-job-title">Delete this job ad?</h2>
            <p className="rn-delete-modal-job">{deleteJob.title}</p>
            <p id="delete-job-description">{DELETE_CONFIRMATION_MESSAGE}</p>
            <div className="rn-delete-modal-actions">
              <button
                type="button"
                style={homeSecondaryButton}
                className="rn-btn-secondary"
                onClick={() => setDeleteJob(null)}
                disabled={busyJobId === deleteJob.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rn-confirm-delete-button"
                onClick={handleConfirmDelete}
                disabled={busyJobId === deleteJob.id}
              >
                {busyJobId === deleteJob.id ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .rn-dashboard-hero-row {
          align-items: flex-start;
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          justify-content: space-between;
        }

        .rn-dashboard-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .rn-dashboard-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .rn-dashboard-rejected-note {
          margin: 8px 0 0 0;
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
        }

        .rn-dashboard-rejected-note a {
          color: ${homeTheme.green};
          font-weight: 900;
          text-decoration: underline;
          text-underline-offset: 3px;
        }


        .rn-job-listing-controls {
          align-items: end;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(260px, 1fr) minmax(180px, 220px) minmax(180px, 220px);
          margin: 18px 0 16px;
        }

        .rn-job-listing-control {
          color: ${homeTheme.muted};
          display: grid;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          gap: 7px;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .rn-job-listing-control input,
        .rn-job-listing-control select {
          appearance: none;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 800;
          min-height: 46px;
          outline: 0;
          padding: 0 14px;
          text-transform: none;
          width: 100%;
        }

        .rn-job-listing-control select {
          background-image: linear-gradient(45deg, transparent 50%, ${homeTheme.green} 50%), linear-gradient(135deg, ${homeTheme.green} 50%, transparent 50%);
          background-position: calc(100% - 18px) 19px, calc(100% - 13px) 19px;
          background-repeat: no-repeat;
          background-size: 5px 5px, 5px 5px;
          cursor: pointer;
          padding-right: 36px;
        }

        .rn-job-listing-control input:focus,
        .rn-job-listing-control select:focus {
          border-color: rgba(31, 79, 68, 0.34);
          box-shadow: 0 0 0 3px rgba(31, 79, 68, 0.12);
        }

        .rn-job-listing-control input::placeholder {
          color: rgba(85, 99, 93, 0.72);
        }

        .rn-job-listing-empty {
          background: rgba(255, 255, 255, 0.65);
          border: 1px dashed ${homeTheme.border};
          border-radius: 16px;
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-weight: 800;
          margin-top: 16px;
          padding: 24px;
          text-align: center;
        }


        .rn-job-listing-pagination {
          align-items: center;
          backdrop-filter: blur(14px);
          background: rgba(255, 250, 242, 0.88);
          border: 1px solid rgba(31, 79, 68, 0.14);
          border-radius: 18px;
          box-shadow: 0 14px 34px rgba(31, 79, 68, 0.12);
          color: rgba(0, 0, 0, 0.68);
          display: flex;
          flex-wrap: wrap;
          font-family: var(--font-body);
          font-weight: 900;
          gap: 12px;
          justify-content: space-between;
          margin: 14px 0;
          padding: 10px 12px;
          position: sticky;
          top: calc(100vh - 98px);
          top: calc(100dvh - 98px);
          z-index: 10;
        }

        .rn-job-listing-pagination__controls {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }

        .rn-job-listing-pagination__page,
        .rn-job-listing-pagination__ellipsis {
          align-items: center;
          display: inline-flex;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 900;
          justify-content: center;
          min-height: 40px;
          min-width: 40px;
        }

        .rn-job-listing-pagination__page {
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid ${homeTheme.border};
          border-radius: 999px;
          color: ${homeTheme.green};
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }

        .rn-job-listing-pagination__page:hover,
        .rn-job-listing-pagination__page:focus-visible {
          border-color: rgba(31, 79, 68, 0.34);
          box-shadow: 0 8px 20px rgba(31, 79, 68, 0.12);
          outline: 0;
          transform: translateY(-1px);
        }

        .rn-job-listing-pagination__page--current,
        .rn-job-listing-pagination__page--current:hover,
        .rn-job-listing-pagination__page--current:focus-visible {
          background: ${homeTheme.green};
          border-color: ${homeTheme.green};
          box-shadow: 0 10px 22px rgba(31, 79, 68, 0.18);
          color: #ffffff;
          transform: none;
        }

        .rn-job-listing-pagination__ellipsis {
          color: ${homeTheme.muted};
          min-width: 24px;
        }

        .rn-billing-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .rn-billing-stat {
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          padding: 14px;
          background: rgba(255,255,255,.72);
        }

        .rn-billing-stat p {
          margin: 0 0 8px 0;
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .35px;
          text-transform: uppercase;
        }

        .rn-billing-stat strong {
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-size: 16px;
          font-weight: 900;
        }

        .rn-dashboard-table-wrap {
          background: #fff;
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          max-height: 440px;
          overflow-x: hidden;
          overflow-y: auto;
          scrollbar-color: rgba(31, 79, 68, 0.28) transparent;
          scrollbar-gutter: stable;
          scrollbar-width: thin;
        }

        .rn-dashboard-table-wrap::-webkit-scrollbar {
          width: 8px;
        }

        .rn-dashboard-table-wrap::-webkit-scrollbar-thumb {
          background: rgba(31, 79, 68, 0.24);
          border: 2px solid #fff;
          border-radius: 999px;
        }

        .rn-dashboard-table-wrap::-webkit-scrollbar-track {
          background: transparent;
        }

        .rn-dashboard-table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
        }

        .rn-job-bulk-toolbar {
          align-items: center;
          background: rgba(255, 250, 242, 0.92);
          border: 1px solid rgba(31, 79, 68, 0.16);
          border-radius: 16px;
          color: ${homeTheme.text};
          display: flex;
          flex-wrap: wrap;
          font-family: var(--font-body);
          gap: 10px;
          margin: -4px 0 14px;
          padding: 10px 12px;
        }

        .rn-job-bulk-toolbar strong {
          color: ${homeTheme.green};
          font-weight: 900;
          margin-right: auto;
        }

        .rn-dashboard-table__col-title {
          width: 30%;
        }

        .rn-dashboard-table__col-status {
          width: 14%;
        }

        .rn-dashboard-table__col-location {
          width: 17%;
        }

        .rn-dashboard-table__col-date {
          width: 14%;
        }

        .rn-dashboard-table__col-views {
          width: 8%;
        }

        .rn-dashboard-table__col-actions {
          width: 17%;
        }

        .rn-job-select-all-control {
          align-items: center;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(53, 128, 110, 0.18);
          border-radius: 999px;
          color: ${homeTheme.text};
          cursor: pointer;
          display: inline-flex;
          font-size: 13px;
          font-weight: 900;
          gap: 8px;
          line-height: 1;
          padding: 8px 12px;
          position: relative;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
          user-select: none;
        }

        .rn-job-select-all-control:hover {
          background: rgba(53, 128, 110, 0.08);
          border-color: rgba(53, 128, 110, 0.32);
          transform: translateY(-1px);
        }

        .rn-job-select-all-input {
          height: 1px;
          opacity: 0;
          pointer-events: none;
          position: absolute;
          width: 1px;
        }

        .rn-job-select-all-mark {
          align-items: center;
          border: 1.5px solid rgba(53, 128, 110, 0.42);
          border-radius: 5px;
          display: inline-flex;
          height: 16px;
          justify-content: center;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          width: 16px;
        }

        .rn-job-select-all-mark::after {
          color: #ffffff;
          content: "✓";
          font-size: 11px;
          font-weight: 900;
          line-height: 1;
          opacity: 0;
          transform: scale(0.7);
          transition: opacity 140ms ease, transform 160ms ease;
        }

        .rn-job-select-all-input:checked + .rn-job-select-all-mark,
        .rn-job-select-all-input:indeterminate + .rn-job-select-all-mark {
          background: ${homeTheme.green};
          border-color: ${homeTheme.green};
        }

        .rn-job-select-all-input:checked + .rn-job-select-all-mark::after {
          opacity: 1;
          transform: scale(1);
        }

        .rn-job-select-all-input:indeterminate + .rn-job-select-all-mark::after {
          content: "–";
          opacity: 1;
          transform: scale(1);
        }

        .rn-job-select-all-input:focus-visible + .rn-job-select-all-mark {
          box-shadow: 0 0 0 3px #ffffff, 0 0 0 6px rgba(53, 128, 110, 0.28);
        }

        .rn-dashboard-table tbody tr {
          cursor: pointer;
          outline: 0 solid transparent;
          transition: background-color 150ms ease, box-shadow 150ms ease, outline-color 150ms ease;
        }

        .rn-dashboard-table tbody tr:hover td {
          background: rgba(53, 128, 110, 0.035);
        }

        .rn-dashboard-table tbody tr:focus-visible td {
          box-shadow: inset 0 0 0 2px rgba(53, 128, 110, 0.32);
        }

        .rn-dashboard-title-with-select,
        .rn-dashboard-mobile-title {
          align-items: center;
          display: inline-flex;
        }

        .rn-dashboard-row-check {
          align-items: center;
          background: ${homeTheme.green};
          border-radius: 999px;
          color: #ffffff;
          display: inline-flex;
          flex: 0 0 auto;
          font-size: 10px;
          font-weight: 900;
          height: 16px;
          justify-content: center;
          margin-right: 0;
          opacity: 0;
          overflow: hidden;
          transform: scale(0.75);
          transition: opacity 140ms ease, transform 160ms ease, width 160ms ease, margin-right 160ms ease;
          width: 0;
        }

        .rn-dashboard-table__row--selected td {
          background: rgba(53, 128, 110, 0.07);
        }

        .rn-dashboard-table__row--selected td:first-child {
          box-shadow: inset 3px 0 0 ${homeTheme.green};
        }

        .rn-dashboard-table__row--selected .rn-dashboard-row-check,
        .rn-dashboard-mobile-card--selected .rn-dashboard-row-check {
          margin-right: 8px;
          opacity: 1;
          transform: scale(1);
          width: 16px;
        }

        .rn-dashboard-table td:nth-child(1) {
          line-height: 1.35;
        }

        .rn-dashboard-table td:nth-child(2),
        .rn-dashboard-table td:nth-child(3),
        .rn-dashboard-table td:nth-child(4),
        .rn-dashboard-table td:nth-child(5) {
          white-space: nowrap;
        }

        .rn-dashboard-table td:nth-child(3) {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .rn-dashboard-table td:last-child {
          padding-right: 12px;
        }

        .rn-dashboard-table th {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.45px;
          color: ${homeTheme.muted};
        }

        .rn-dashboard-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .rn-dashboard-table .rn-dashboard-actions {
          display: grid;
          gap: 6px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          width: 100%;
        }

        .rn-dashboard-table .rn-dashboard-actions > * {
          box-shadow: none !important;
          font-size: 12px !important;
          justify-content: center !important;
          min-height: 34px;
          min-width: 0;
          padding: 7px 8px !important;
          text-align: center;
          width: 100%;
        }


        .rn-btn-delete {
          border-color: rgba(173, 67, 67, 0.28) !important;
          color: #8a2f2f !important;
          background: rgba(173, 67, 67, 0.06) !important;
        }

        .rn-btn-delete:hover {
          background: rgba(173, 67, 67, 0.10) !important;
          border-color: rgba(173, 67, 67, 0.40) !important;
        }

        .rn-delete-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(25, 35, 32, 0.44);
        }

        .rn-delete-modal {
          width: min(100%, 480px);
          border: 1px solid ${homeTheme.border};
          border-radius: 20px;
          background: #fffaf2;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.22);
          padding: 24px;
          color: ${homeTheme.text};
          font-family: var(--font-body);
        }

        .rn-delete-modal-eyebrow {
          margin: 0 0 8px 0;
          color: #8a2f2f;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.45px;
          text-transform: uppercase;
        }

        .rn-delete-modal h2 {
          margin: 0 0 8px 0;
          color: ${homeTheme.green};
          font-family: var(--font-heading);
          font-size: 30px;
          line-height: 1.1;
        }

        .rn-delete-modal p {
          color: ${homeTheme.muted};
          font-weight: 700;
          line-height: 1.5;
        }

        .rn-delete-modal-job {
          margin: 0 0 12px 0;
          color: ${homeTheme.text} !important;
          font-weight: 900 !important;
        }

        .rn-delete-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .rn-confirm-delete-button {
          border: 1px solid rgba(173, 67, 67, 0.36);
          border-radius: 999px;
          background: #8a2f2f;
          color: #fffaf2;
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 900;
          padding: 10px 16px;
          text-decoration: none;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .rn-confirm-delete-button:hover {
          background: #742828;
          box-shadow: 0 8px 18px rgba(173, 67, 67, 0.22);
          transform: translateY(-1px);
        }

        .rn-confirm-delete-button:disabled,
        .rn-btn-delete:disabled {
          cursor: not-allowed;
          opacity: 0.68;
          transform: none;
        }

        .rn-candidate-section-header {
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 16px;
        }

        .rn-candidate-title-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .rn-candidate-count-pill {
          align-items: center;
          background: rgba(31, 79, 68, 0.08);
          border: 1px solid rgba(31, 79, 68, 0.16);
          border-radius: 999px;
          color: ${homeTheme.green};
          display: inline-flex;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
          padding: 7px 10px;
        }

        .rn-candidate-count-pill-new {
          background: rgba(53, 128, 110, 0.12);
          border-color: rgba(53, 128, 110, 0.24);
          color: #1d5b4d;
        }

        .rn-candidate-toggle {
          align-items: center;
          background: rgba(255, 250, 242, 0.92);
          border: 1px solid ${homeTheme.border};
          border-radius: 999px;
          color: ${homeTheme.text};
          cursor: pointer;
          display: inline-flex;
          flex: 0 0 auto;
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 900;
          gap: 10px;
          justify-content: center;
          padding: 10px 12px 10px 16px;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }

        .rn-candidate-toggle:hover {
          border-color: rgba(31, 79, 68, 0.28);
          box-shadow: 0 8px 18px rgba(31, 79, 68, 0.12);
          transform: translateY(-1px);
        }

        .rn-candidate-toggle:focus-visible {
          outline: 3px solid rgba(31, 79, 68, 0.18);
          outline-offset: 2px;
        }

        .rn-candidate-toggle-icon {
          align-items: center;
          background: ${homeTheme.green};
          border-radius: 999px;
          color: #fffaf2;
          display: inline-flex;
          font-size: 17px;
          height: 24px;
          justify-content: center;
          line-height: 1;
          width: 24px;
        }

        .rn-candidate-collapsed-summary {
          background: rgba(255, 250, 242, 0.76);
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-weight: 900;
          margin: 0;
          padding: 14px 16px;
        }

        .rn-candidate-empty {
          border: 1px dashed ${homeTheme.border};
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.65);
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-weight: 700;
          padding: 18px;
        }

        .rn-candidate-filter-controls {
          align-items: end;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(260px, 1.4fr) repeat(3, minmax(170px, 1fr));
          margin: 18px 0 10px;
        }

        .rn-candidate-filter-control {
          color: ${homeTheme.muted};
          display: grid;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          gap: 7px;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .rn-candidate-filter-control input,
        .rn-candidate-filter-control select {
          appearance: none;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 800;
          min-height: 46px;
          outline: 0;
          padding: 0 14px;
          text-transform: none;
          width: 100%;
        }

        .rn-candidate-filter-control select {
          background-image: linear-gradient(45deg, transparent 50%, ${homeTheme.green} 50%), linear-gradient(135deg, ${homeTheme.green} 50%, transparent 50%);
          background-position: calc(100% - 18px) 19px, calc(100% - 13px) 19px;
          background-repeat: no-repeat;
          background-size: 5px 5px, 5px 5px;
          cursor: pointer;
          padding-right: 36px;
        }

        .rn-candidate-filter-control input:focus,
        .rn-candidate-filter-control select:focus {
          border-color: rgba(31, 79, 68, 0.34);
          box-shadow: 0 0 0 3px rgba(31, 79, 68, 0.12);
        }

        .rn-candidate-filter-control input::placeholder {
          color: rgba(85, 99, 93, 0.72);
        }

        .rn-candidate-filter-summary {
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 900;
          margin: 0 0 12px;
        }

        .rn-candidate-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 18px 0 16px;
        }

        .rn-candidate-filter {
          align-items: center;
          background: rgba(255, 250, 242, 0.82);
          border: 1px solid ${homeTheme.border};
          border-radius: 999px;
          color: ${homeTheme.text};
          cursor: pointer;
          display: inline-flex;
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 900;
          gap: 8px;
          justify-content: center;
          min-height: 42px;
          padding: 9px 13px;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms ease;
        }

        .rn-candidate-filter:hover {
          border-color: rgba(53, 128, 110, 0.24);
          box-shadow: 0 10px 22px rgba(31, 79, 68, 0.1);
          transform: translateY(-1px);
        }

        .rn-candidate-filter strong {
          align-items: center;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 999px;
          display: inline-flex;
          font-size: 12px;
          justify-content: center;
          min-width: 28px;
          padding: 3px 8px;
        }

        .rn-candidate-filter-active {
          background: ${homeTheme.green};
          border-color: ${homeTheme.green};
          box-shadow: 0 12px 26px rgba(31, 79, 68, 0.18);
          color: #fffaf2;
        }

        .rn-candidate-filter-active strong {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.26);
          color: #fffaf2;
        }

        .rn-candidate-list {
          display: grid;
          gap: 12px;
        }

        .rn-candidate-card {
          border: 1px solid ${homeTheme.border};
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.9);
          padding: 16px;
        }

        .rn-candidate-card-header {
          align-items: flex-start;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .rn-candidate-card h3 {
          margin: 0 0 5px 0;
          color: ${homeTheme.green};
          font-family: var(--font-heading);
          font-size: 24px;
          line-height: 1.1;
        }

        .rn-candidate-card p {
          margin: 4px 0 0 0;
          color: ${homeTheme.muted};
          font-family: var(--font-body);
          font-weight: 700;
        }

        .rn-candidate-status-label {
          color: ${homeTheme.muted};
          display: grid;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 900;
          gap: 7px;
          min-width: 176px;
          text-transform: uppercase;
        }

        .rn-candidate-status-control {
          align-items: center;
          border: 1px solid;
          border-radius: 999px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          overflow: hidden;
          padding-left: 12px;
          position: relative;
        }

        .rn-candidate-status-control::after {
          border-bottom: 2px solid currentColor;
          border-right: 2px solid currentColor;
          content: "";
          height: 7px;
          pointer-events: none;
          position: absolute;
          right: 13px;
          top: 50%;
          transform: translateY(-62%) rotate(45deg);
          width: 7px;
        }

        .rn-candidate-status-dot {
          background: currentColor;
          border-radius: 999px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.55);
          height: 8px;
          width: 8px;
        }

        .rn-candidate-status-label select {
          appearance: none;
          background: transparent;
          border: 0;
          color: currentColor;
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 900;
          min-height: 40px;
          outline: 0;
          padding: 8px 34px 8px 9px;
          text-transform: none;
          width: 100%;
        }

        .rn-candidate-status-label select:disabled {
          cursor: not-allowed;
          opacity: 0.68;
        }

        .rn-candidate-status-control:focus-within {
          outline: 3px solid rgba(31, 79, 68, 0.18);
          outline-offset: 2px;
        }

        .rn-candidate-contact-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .rn-candidate-contact-grid > div {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 12px;
          background: rgba(255, 250, 242, 0.72);
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-weight: 800;
          overflow-wrap: anywhere;
          padding: 12px;
        }

        .rn-candidate-contact-grid span {
          display: block;
          margin-bottom: 5px;
          color: ${homeTheme.muted};
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .rn-candidate-contact-grid a,
        .rn-resume-link {
          color: ${homeTheme.green};
          font-weight: 900;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .rn-resume-link {
          border: 0;
          background: transparent;
          cursor: pointer;
          font-family: var(--font-body);
          padding: 0;
          text-align: left;
        }

        .rn-resume-link:disabled {
          cursor: not-allowed;
          opacity: 0.68;
        }

        .rn-candidate-message {
          border-left: 4px solid ${homeTheme.green};
          margin-top: 14px !important;
          padding-left: 12px;
          white-space: pre-wrap;
        }

        .rn-dashboard-mobile-list {
          display: none;
          margin-top: 14px;
          gap: 12px;
        }

        .rn-dashboard-mobile-card {
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.92);
          cursor: pointer;
          transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
        }

        .rn-dashboard-mobile-card:hover {
          background: rgba(53, 128, 110, 0.035);
        }

        .rn-dashboard-mobile-card:focus-visible {
          box-shadow: 0 0 0 3px rgba(53, 128, 110, 0.22);
          outline: none;
        }

        .rn-dashboard-mobile-card--selected {
          background: rgba(53, 128, 110, 0.07);
          border-color: rgba(53, 128, 110, 0.28);
          box-shadow: inset 3px 0 0 ${homeTheme.green};
        }

        @media (max-width: 980px) {
          .rn-dashboard-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .rn-job-listing-controls,
          .rn-candidate-filter-controls {
            grid-template-columns: 1fr;
          }

          .rn-job-listing-pagination {
            align-items: flex-start;
            top: calc(100vh - 178px);
            top: calc(100dvh - 178px);
          }

          .rn-job-listing-pagination__controls {
            justify-content: flex-start;
          }

          .rn-dashboard-table-wrap {
            display: none;
          }

          .rn-dashboard-mobile-list {
            display: grid;
          }

          .rn-candidate-card-header {
            display: grid;
          }

          .rn-dashboard-header-row,
          .rn-dashboard-hero-row {
            display: grid;
          }

          .rn-dashboard-header-row > *,
          .rn-dashboard-hero-row > * {
            min-width: 0;
          }

          .rn-candidate-toggle {
            width: 100%;
          }

          .rn-dashboard-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .rn-dashboard-actions > * {
            justify-content: center !important;
            min-width: 0;
            text-align: center;
          }

          .rn-dashboard-mobile-card > div:first-child {
            display: grid !important;
          }

          .rn-candidate-filters {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rn-candidate-filter-control-search {
            grid-column: auto;
          }

          .rn-candidate-filter {
            width: 100%;
          }

          .rn-candidate-status-label {
            min-width: 0;
            width: 100%;
          }

          .rn-dashboard-metrics,
          .rn-billing-grid,
          .rn-candidate-contact-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 460px) {
          .rn-candidate-filters,
          .rn-dashboard-actions {
            grid-template-columns: 1fr;
          }

          .rn-job-listing-pagination {
            top: calc(100vh - 218px);
            top: calc(100dvh - 218px);
          }

          .rn-candidate-card,
          .rn-dashboard-mobile-card {
            padding: 14px;
          }

          .rn-delete-modal {
            padding: 18px;
          }

          .rn-delete-modal-actions {
            display: grid;
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

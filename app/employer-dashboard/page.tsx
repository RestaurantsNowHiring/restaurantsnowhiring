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
  isMissingViewsColumnError,
} from "../../lib/jobStatus";
import { canUserAccessJob } from "../../lib/employerJobAccess";

type EmployerOwner = { userId: string; email: string; accountId?: string | null; ownerUserId?: string; ownerEmail?: string };
type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type EmployerAccountMembership = { accountId: string; accountName: string; locationName: string | null; role: EmployerRole; status?: string; invitationPending?: boolean };
type EmployerAccess = { role: EmployerRole; accountId: string | null; accountName: string | null; restaurantBrandName: string | null; locationName: string | null; memberships: EmployerAccountMembership[]; ownerUserId: string; ownerEmail: string; canManageProfile: boolean; canManageBilling: boolean; canManageJobs: boolean; canViewCandidates: boolean; canUpdateCandidateStatuses: boolean; canManageTeam: boolean; canManageNotificationRouting: boolean; };
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
type JobStatusFilter = "all" | "Active" | "Paused" | "Pending" | "Rejected";
type JobSortOption = "newest" | "oldest" | "most_viewed";

const JOB_STATUS_FILTER_OPTIONS: Array<{ value: JobStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Paused", label: "Paused" },
  { value: "Pending", label: "Pending Review" },
  { value: "Rejected", label: "Rejected" },
];

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


const JOB_QUERY_VARIANTS: JobsQueryVariant[] = [
  {
    fields: "id,title,restaurant_name,city,state,active,status,created_at,views,employer_user_id,employer_email,employer_account_id,candidate_notification_email,candidate_notification_emails",
    includesStatus: true,
    includesViews: true,
  },
  {
    fields: "id,title,restaurant_name,city,state,active,status,created_at,employer_user_id,employer_email,employer_account_id,candidate_notification_email,candidate_notification_emails",
    includesStatus: true,
    includesViews: false,
  },
];



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

export default function EmployerDashboardPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [candidates, setCandidates] = useState<CandidateSubmission[]>([]);
  const [candidateFilter, setCandidateFilter] = useState<CandidateFilter>("all");
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState<JobStatusFilter>("all");
  const [jobSortOption, setJobSortOption] = useState<JobSortOption>("newest");
  const [areCandidatesExpanded, setAreCandidatesExpanded] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [candidateBusyId, setCandidateBusyId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
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

    async function loadEmployerJobs(currentOwner: EmployerOwner): Promise<JobsQueryResult> {
      let liveJobs: Array<Record<string, unknown>> | null = null;
      let error: { code?: string; message?: string } | null = null;
      let selectedVariant: JobsQueryVariant | null = null;

      for (const variant of JOB_QUERY_VARIANTS) {
        const queries = currentOwner.accountId
          ? [
              supabase
                .from("jobs")
                .select(variant.fields)
                .eq("employer_account_id", currentOwner.accountId)
                .order("created_at", { ascending: false }),
            ]
          : [
              supabase
                .from("jobs")
                .select(variant.fields)
                .eq("employer_user_id", currentOwner.ownerUserId ?? currentOwner.userId)
                .order("created_at", { ascending: false }),
              supabase
                .from("jobs")
                .select(variant.fields)
                .eq("employer_email", currentOwner.ownerEmail ?? currentOwner.email)
                .order("created_at", { ascending: false }),
            ];

        const results = await Promise.all(queries);
        const variantError = results.find((result) => result.error)?.error ?? null;

        if (!variantError) {
          const jobsById = new Map<string, Record<string, unknown>>();

          results.flatMap((result) => result.data ?? []).forEach((job) => {
            const jobRecord = job as unknown as Record<string, unknown>;
            const id = String(jobRecord.id ?? "");
            if (id) {
              jobsById.set(id, jobRecord);
            }
          });

          liveJobs = Array.from(jobsById.values()).sort((a, b) => {
            const aCreated = new Date(String(a.created_at ?? "")).getTime();
            const bCreated = new Date(String(b.created_at ?? "")).getTime();
            return bCreated - aCreated;
          });
          selectedVariant = variant;
          error = null;
          break;
        }

        const missingViews = isMissingViewsColumnError(variantError);
        if (missingViews) {
          error = variantError;
          continue;
        }

        error = variantError;
        break;
      }

      return { liveJobs, selectedVariant, error };
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

      const jobsResult = await loadEmployerJobs(currentOwner);

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

      const visibleJobRows = jobsResult.liveJobs.filter((job) => canUserAccessJob({ email }, access?.role ?? "account_owner", job));

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

  const candidateStatusCounts = useMemo(() => {
    return CANDIDATE_STATUS_OPTIONS.reduce(
      (counts, status) => ({
        ...counts,
        [status]: candidates.filter((candidate) => candidate.status === status).length,
      }),
      { all: candidates.length } as Record<CandidateFilter, number>
    );
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    if (candidateFilter === "all") return candidates;
    return candidates.filter((candidate) => candidate.status === candidateFilter);
  }, [candidateFilter, candidates]);


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
          ) : null}

          {candidates.length === 0 ? (
            <div className="rn-candidate-empty">
              No interested candidates yet. When job seekers send their information, they will appear here.
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="rn-candidate-empty">
              No {formatCandidateStatus(candidateFilter)} candidates right now. Try another status filter.
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
                    onChange={(event) => setJobSearchQuery(event.target.value)}
                    placeholder="Search by title, city, state, or restaurant"
                    aria-label="Search job listings by title, city, state, or restaurant"
                  />
                </label>
                <label className="rn-job-listing-control">
                  <span>Status</span>
                  <select
                    value={jobStatusFilter}
                    onChange={(event) => setJobStatusFilter(event.target.value as JobStatusFilter)}
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
                    value={jobSortOption}
                    onChange={(event) => setJobSortOption(event.target.value as JobSortOption)}
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
              <div className="rn-dashboard-table-wrap">
                <table className="rn-dashboard-table">
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
                    {filteredJobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.title}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rn-dashboard-mobile-list">
                {filteredJobs.map((job) => (
                  <article key={`mobile-${job.id}`} className="rn-dashboard-mobile-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 18, color: homeTheme.text, fontFamily: "var(--font-heading)" }}>
                        {job.title}
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
                ))}
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
          border: 1px solid ${homeTheme.border};
          border-radius: 14px;
          overflow-x: auto;
          overflow-y: hidden;
          background: #fff;
        }

        .rn-dashboard-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 860px;
        }

        .rn-dashboard-table th,
        .rn-dashboard-table td {
          padding: 12px 14px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
          text-align: left;
          vertical-align: middle;
          color: ${homeTheme.text};
          font-family: var(--font-body);
          font-weight: 700;
          font-size: 14px;
          white-space: nowrap;
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
        }

        @media (max-width: 980px) {
          .rn-dashboard-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .rn-job-listing-controls {
            grid-template-columns: 1fr;
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

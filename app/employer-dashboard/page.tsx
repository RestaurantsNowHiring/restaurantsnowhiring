"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
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

type EmployerOwner = { userId: string; email: string };
type OwnershipMatch = "employer_user_id" | "employer_email";

type DashboardJob = {
  id: string;
  title: string;
  city: string | null;
  state: string | null;
  active: boolean;
  status?: string | null;
  employer_user_id: string | null;
  employer_email: string | null;
  ownership_match: OwnershipMatch | null;
  created_at: string;
  views: number;
  dashboard_status: "Active" | "Pending" | "Draft" | "Paused" | "Rejected";
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

const PAUSE_RESUME_RETURN_FIELDS = "id,active,status,employer_user_id,employer_email";
const DELETE_EMAIL_RETURN_FIELDS = "id,employer_email";
const DELETE_USER_ID_RETURN_FIELDS = "id,employer_user_id,employer_email";
const DELETE_CONFIRMATION_MESSAGE =
  "This will permanently delete your job ad. If you want to repost this position later, you will need to complete the Post a Job form again.";

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
    fields: "id,title,city,state,active,status,created_at,views,employer_user_id,employer_email",
    includesStatus: true,
    includesViews: true,
  },
  {
    fields: "id,title,city,state,active,status,created_at,employer_user_id,employer_email",
    includesStatus: true,
    includesViews: false,
  },
];



function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function getJobOwnershipMatch(job: Record<string, unknown>, owner: EmployerOwner): OwnershipMatch | null {
  const employerUserId = typeof job.employer_user_id === "string" ? job.employer_user_id.trim() : "";
  const employerEmail = typeof job.employer_email === "string" ? job.employer_email.trim() : "";

  if (employerUserId && employerUserId === owner.userId) return "employer_user_id";
  if (employerEmail && employerEmail === owner.email) return "employer_email";

  return null;
}

function hasMissingEmployerOwnership(job: Pick<DashboardJob, "employer_user_id" | "employer_email">) {
  return !job.employer_user_id && !job.employer_email;
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
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [deleteJob, setDeleteJob] = useState<DashboardJob | null>(null);
  const [owner, setOwner] = useState<EmployerOwner | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingBusyAction, setBillingBusyAction] = useState<"checkout" | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
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
        const [userIdResult, emailResult] = await Promise.all([
          supabase
            .from("jobs")
            .select(variant.fields)
            .eq("employer_user_id", currentOwner.userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("jobs")
            .select(variant.fields)
            .eq("employer_email", currentOwner.email)
            .order("created_at", { ascending: false }),
        ]);

        const variantError = userIdResult.error ?? emailResult.error;

        if (!variantError) {
          const jobsById = new Map<string, Record<string, unknown>>();

          [...(emailResult.data ?? []), ...(userIdResult.data ?? [])].forEach((job) => {
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

    async function loadBillingSummary() {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return null;

      const response = await fetch("/api/billing/status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not load billing details.");
      }

      return (await response.json()) as BillingSummary;
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
          setOwner(null);
          setAuthStatus("allowed");
          setActionError("Your employer session is missing account ownership details. Please sign out and sign back in.");
        }
        return;
      }

      const currentOwner = { userId, email };
      setActionError(null);
      setActionSuccess(null);

      let nextBillingSummary: BillingSummary | null = null;
      try {
        nextBillingSummary = await loadBillingSummary();
      } catch (error) {
        if (mounted) setBillingError(error instanceof Error ? error.message : "Could not load billing details.");
      }

      const jobsResult = await loadEmployerJobs(currentOwner);

      if (jobsResult.error || !jobsResult.liveJobs || !jobsResult.selectedVariant) {
        if (mounted) {
          setJobs([]);
          setOwner(currentOwner);
          setBillingSummary(nextBillingSummary);
          setAuthStatus("allowed");
          setActionError(jobsResult.error?.message || "Could not load your employer listings from Supabase.");
        }
        return;
      }

      const hydratedJobs: DashboardJob[] = jobsResult.liveJobs.map((job) => {
        const status = jobsResult.selectedVariant?.includesStatus ? (typeof job.status === "string" ? job.status : null) : null;
        const active = Boolean(job.active);
        const employerUserId = typeof job.employer_user_id === "string" && job.employer_user_id.trim() ? job.employer_user_id.trim() : null;
        const employerEmail = typeof job.employer_email === "string" && job.employer_email.trim() ? job.employer_email.trim() : null;

        return {
          id: String(job.id ?? ""),
          title: String(job.title ?? ""),
          city: typeof job.city === "string" ? job.city : null,
          state: typeof job.state === "string" ? job.state : null,
          active,
          status,
          employer_user_id: employerUserId,
          employer_email: employerEmail,
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
        setOwner(currentOwner);
        setBillingSummary(nextBillingSummary);
        setAuthStatus("allowed");
      }
    }

    loadDashboard();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadDashboard();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function refreshBillingSummary() {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return;

    const response = await fetch("/api/billing/status", {
      headers: { Authorization: `Bearer ${accessToken}` },
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
      headers: { Authorization: `Bearer ${accessToken}` },
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
      headers: { Authorization: `Bearer ${accessToken}` },
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
    const sessionOwner = authUser?.id && authUser.email?.trim() ? { userId: authUser.id, email: authUser.email.trim() } : null;
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
      ...(matchedOwnership === "employer_user_id" ? ["employer_email" as const] : ["employer_user_id" as const]),
    ];
    let updateError: SupabaseActionError | null = null;
    let updatedJob: Pick<DashboardJob, "active" | "status" | "employer_user_id" | "employer_email"> | null = null;
    let matchedBy: OwnershipMatch | null = null;

    for (const ownershipField of updateAttempts) {
      const ownerValue = ownershipField === "employer_user_id" ? currentOwner.userId : currentOwner.email;
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
    const sessionOwner = authUser?.id && authUser.email?.trim() ? { userId: authUser.id, email: authUser.email.trim() } : null;
    const currentOwner = sessionOwner ?? owner;

    if (authError || !currentOwner) {
      setDeleteJob(null);
      setActionError("We could not delete this job because the employer session is unavailable. Please refresh and try again.");
      setBusyJobId(null);
      return;
    }

    const emailMatchesCurrentEmployer = job.employer_email === currentOwner.email;
    const userIdMatchesCurrentEmployer = job.employer_user_id === currentOwner.userId;

    if (!emailMatchesCurrentEmployer && !userIdMatchesCurrentEmployer) {
      setDeleteJob(null);
      setActionError(
        "This job is linked to a different employer account than your current session. Please refresh or sign in with the employer account that owns this listing."
      );
      setBusyJobId(null);
      return;
    }

    const emailOwnershipCheck = await supabase
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

    if (emailOwnershipCheck.data) {
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

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => job.dashboard_status === "Active").length;
    const pending = jobs.filter((job) => job.dashboard_status === "Pending").length;
    const drafts = jobs.filter((job) => job.dashboard_status === "Draft").length;
    const totalViews = jobs.reduce((sum, job) => sum + job.views, 0);

    return [
      { label: "Active Jobs", value: active },
      { label: "Pending Review", value: pending },
      { label: "Drafts", value: drafts },
      { label: "Total Views", value: totalViews },
    ];
  }, [jobs]);

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
          Loading employer dashboard…
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
        </section>

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
            <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
              Post New Job
            </Link>
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
                You have not posted any jobs yet. Start your first listing to begin receiving applicants.
              </p>
              <Link href="/post-job" style={homePrimaryButton} className="rn-btn-primary">
                Create Your First Job
              </Link>
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
                    {jobs.map((job) => (
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
                            <Link
                              href={`/employer-dashboard/jobs/${job.id}/edit`}
                              style={homeSecondaryButton}
                              className="rn-btn-secondary"
                            >
                              Edit
                            </Link>
                            {canEmployerPauseResume(job.status) ? (
                              <button
                                type="button"
                                style={homeSecondaryButton}
                                className="rn-btn-secondary"
                                onClick={() => handlePauseToggle(job)}
                                disabled={busyJobId === job.id}
                              >
                                {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              style={homeSecondaryButton}
                              className="rn-btn-secondary rn-btn-delete"
                              onClick={() => handleDeleteClick(job)}
                              disabled={busyJobId === job.id}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rn-dashboard-mobile-list">
                {jobs.map((job) => (
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
                      <Link
                        href={`/employer-dashboard/jobs/${job.id}/edit`}
                        style={homeSecondaryButton}
                        className="rn-btn-secondary"
                      >
                        Edit
                      </Link>
                      {canEmployerPauseResume(job.status) ? (
                        <button
                          type="button"
                          style={homeSecondaryButton}
                          className="rn-btn-secondary"
                          onClick={() => handlePauseToggle(job)}
                          disabled={busyJobId === job.id}
                        >
                          {busyJobId === job.id ? "Saving..." : job.dashboard_status === "Paused" ? "Resume" : "Pause"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        style={homeSecondaryButton}
                        className="rn-btn-secondary rn-btn-delete"
                        onClick={() => handleDeleteClick(job)}
                        disabled={busyJobId === job.id}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
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
          .rn-dashboard-table-wrap {
            display: none;
          }

          .rn-dashboard-mobile-list {
            display: grid;
          }

          .rn-dashboard-metrics,
          .rn-billing-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

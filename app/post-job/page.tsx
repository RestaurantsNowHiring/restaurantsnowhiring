"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCandidateNotificationEmails, parseCandidateNotificationEmails } from "../../lib/candidateNotificationEmails";
import { supabase } from "../../lib/supabase";
import { acceptPendingTeamInvitesForCurrentUser } from "../../lib/teamInviteAcceptance";
import {
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../styles/homepageDesignSystem";

type Step = 1 | 2 | 3 | 4;
type PayMode = "range" | "minimum" | "maximum" | "rate";
type EmployerAccess = { accountId: string | null; canManageJobs: boolean; canManageNotificationRouting: boolean; defaultCandidateNotificationRouting: string; supportEmail: string | null; };
type EmployerStore = {
  id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  store_email: string | null;
  ta_email: string | null;
  gm_op_email: string | null;
  minimum_wage: string | null;
  pay_range: string | null;
  default_application_url: string | null;
  active: boolean;
};
type JobTemplate = {
  id: string;
  template_name: string;
  job_title: string;
  role_category: string | null;
  employment_type: string | null;
  schedule: string | null;
  pay_defaults: string | null;
  job_description: string | null;
  benefits: string | null;
  active: boolean;
};

export default function PostJobPage() {
  const router = useRouter();

  const [authStatus, setAuthStatus] = useState<"loading" | "allowed" | "unconfirmed">("loading");
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [canPostJobs, setCanPostJobs] = useState(false);
  const [employerAccess, setEmployerAccess] = useState<EmployerAccess | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stores, setStores] = useState<EmployerStore[]>([]);
  const [jobTemplates, setJobTemplates] = useState<JobTemplate[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const successDialogRef = useRef<HTMLDivElement>(null);

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [contactName, setContactName] = useState("");
  const [workEmail, setWorkEmail] = useState("");

  // Step 2
  const [restaurantType, setRestaurantType] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [roleCategories, setRoleCategories] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");

  // Step 3
  const [employmentType, setEmploymentType] = useState("");
  const [scheduleTags, setScheduleTags] = useState<string[]>([]);
  const [payMode, setPayMode] = useState<PayMode>("range");
  const [payMin, setPayMin] = useState("");
  const [payMax, setPayMax] = useState("");
  const [payRate, setPayRate] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [howToApply, setHowToApply] = useState("");
  const [candidateNotificationEmail, setCandidateNotificationEmail] = useState("");
  const [description, setDescription] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);

  const GREEN = homeTheme.green;
  const BG = homeTheme.bg;
  const BORDER = homeTheme.border;
  const TEXT = homeTheme.text;
  const MUTED = homeTheme.muted;
  const SOFT_GREEN = "#dfe7e3";
  const CARD = "#ffffff";
  const ERROR = "#b00020";
  const canManageCandidateNotificationRouting = employerAccess?.canManageNotificationRouting !== false;

  const EMPLOYEE_OPTIONS = ["1-10", "11-25", "26-50", "51-100", "100+"];
  const RESTAURANT_TYPES = [
    "Quick Service (Fast Food)",
    "Fast Casual",
    "Casual Dining",
    "Bar / Tavern",
    "Cafe / Bakery",
    "Fine Dining",
    "Food Truck",
    "Other",
  ];

  const ROLE_OPTIONS = [
    "Line",
    "Prep",
    "Dish",
    "Server",
    "Cashier",
    "Host",
    "Bartender",
    "Manager",
    "Other",
  ];

  const EMPLOYMENT_OPTIONS = ["Full time", "Part time", "Seasonal", "Temporary"];
  const SCHEDULE_OPTIONS = [
    "Day shift",
    "Night shift",
    "Morning shift",
    "Evening shift",
    "Overnight shift",
    "Weekends required",
    "Weekdays only (M-F)",
    "Flexible schedule",
    "Rotating schedule",
    "On-call",
    "Overtime",
    "No weekends",
    "Choose your own hours",
    "Other",
  ];

  const BENEFIT_OPTIONS = [
    "Health insurance",
    "Dental insurance",
    "Vision insurance",
    "401(k)",
    "Paid time off",
    "Flexible schedule",
    "Employee discount",
    "Free meals",
    "Tuition assistance",
    "Paid training",
    "Referral bonus",
    "Bonus pay",
    "Overtime available",
    "Career growth",
    "Other",
  ];

  const STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
  ];

  useEffect(() => {
    if (!showSuccessModal) return;
    successDialogRef.current?.focus();
  }, [showSuccessModal]);

  async function loadStoreAndTemplateOptions(accessToken: string) {
    const [storesResponse, templatesResponse] = await Promise.all([
      fetch("/api/employer/stores", { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch("/api/employer/job-templates", { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);

    if (storesResponse.ok) {
      const payload = (await storesResponse.json().catch(() => null)) as { stores?: EmployerStore[] } | null;
      setStores((payload?.stores ?? []).filter((store) => store.active));
    }

    if (templatesResponse.ok) {
      const payload = (await templatesResponse.json().catch(() => null)) as { templates?: JobTemplate[] } | null;
      setJobTemplates((payload?.templates ?? []).filter((template) => template.active));
    }
  }

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      setShowSuccessModal(false);
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = successDialogRef.current?.querySelectorAll<HTMLElement>(
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

    async function checkAuth() {
      const { data } = await supabase.auth.getSession();
      const isLoggedIn = !!data?.session;

      if (!isLoggedIn) {
        router.replace(`/employer-login?next=${encodeURIComponent("/post-job")}`);
        return;
      }

      if (mounted) {
        setAuthUserEmail(data.session?.user.email?.trim() ?? null);
        if (data.session?.user.email) {
          const sessionEmail = data.session.user.email.trim();
          setWorkEmail((currentEmail) => currentEmail.trim() || sessionEmail);
          setCandidateNotificationEmail((currentEmail) => currentEmail.trim() || sessionEmail);
        }

        if (!data.session?.user.email_confirmed_at) {
          setMessage("Please confirm your email before posting a job.");
          setAuthStatus("unconfirmed");
          return;
        }

        await acceptPendingTeamInvitesForCurrentUser();

        const accessToken = data.session?.access_token;
        if (accessToken) {
          const accessResponse = await fetch("/api/employer/me", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const accessPayload = (await accessResponse.json().catch(() => null)) as { employer?: EmployerAccess; error?: string } | null;
          const nextAccess = accessPayload?.employer ?? null;
          setEmployerAccess(nextAccess);
          await loadStoreAndTemplateOptions(accessToken);
          if (nextAccess && !nextAccess.canManageJobs) {
            setCanPostJobs(false);
            setMessage("Your Viewer role can view jobs and candidates, but cannot post job ads. Contact your account admin to make changes.");
            setAuthStatus("allowed");
            return;
          }

          const billingResponse = await fetch("/api/billing/status", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const billingPayload = (await billingResponse.json().catch(() => null)) as
            | { canPostOrActivateJobs?: boolean; billingGateReason?: string; error?: string }
            | null;

          if (!billingResponse.ok || !billingPayload?.canPostOrActivateJobs) {
            setCanPostJobs(false);
            setMessage(
              billingPayload?.billingGateReason === "subscription_inactive"
                ? "Your free trial has ended and your subscription is not active. Please manage billing from your employer dashboard before posting another job."
                : "Start your 30-day free trial from your employer dashboard before posting a job. You will not be charged today."
            );
            setAuthStatus("allowed");
            return;
          }
        }

        setCanPostJobs(true);
        setAuthStatus("allowed");
      }
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  function applyStoreSelection(storeId: string) {
    setSelectedStoreId(storeId);
    const store = stores.find((option) => option.id === storeId);
    if (!store) return;

    setCompanyName(store.location_name || companyName);
    setAddress(store.address ?? "");
    setCity(store.city ?? "");
    setStateVal(store.state ?? "");
    if (store.default_application_url) {
      setHowToApply(store.default_application_url);
      setCompanyWebsite((current) => current || store.default_application_url || "");
    }
    if (store.pay_range) {
      setPayMode("range");
      const [min, max] = store.pay_range.split(/\s*[–-]\s*/);
      setPayMin(min?.trim() ?? store.pay_range);
      setPayMax(max?.trim() ?? "");
    } else if (store.minimum_wage) {
      setPayMode("minimum");
      setPayRate(store.minimum_wage);
    }

    const routingEmails = [store.store_email, store.ta_email, store.gm_op_email].filter(Boolean).join(", ");
    if (routingEmails && canManageCandidateNotificationRouting) setCandidateNotificationEmail(routingEmails);
    if (store.store_email) setWorkEmail(store.store_email);
  }

  function splitTemplateValues(value: string | null) {
    return (value ?? "")
      .split(/,|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function applyTemplateSelection(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = jobTemplates.find((option) => option.id === templateId);
    if (!template) return;

    setJobTitle(template.job_title ?? "");
    setRoleCategories(template.role_category ? [template.role_category] : []);
    if (template.employment_type) setEmploymentType(template.employment_type);
    setScheduleTags(splitTemplateValues(template.schedule));
    if (template.pay_defaults) {
      setPayMode("range");
      const [min, max] = template.pay_defaults.split(/\s*[–-]\s*/);
      setPayMin(min?.trim() ?? template.pay_defaults);
      setPayMax(max?.trim() ?? "");
    }
    setDescription(template.job_description ?? "");
    setBenefits(splitTemplateValues(template.benefits));
  }

  function toggleValue(value: string, list: string[], setter: (v: string[]) => void) {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else {
      setter([...list, value]);
    }
  }

  function resetMessage() {
    setMessage(null);
  }

  function validateStep(currentStep: Step) {
    resetMessage();

    if (currentStep === 1) {
      if (!companyName.trim() || !employeeCount || !contactName.trim() || !workEmail.trim()) {
        setMessage("Please fill out all required company info fields.");
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (
        !restaurantType ||
        !jobTitle.trim() ||
        roleCategories.length === 0 ||
        !city.trim() ||
        !stateVal.trim()
      ) {
        setMessage("Please complete all required job info fields.");
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      if (!employmentType || !howToApply.trim() || !description.trim()) {
        setMessage("Please complete the required details fields.");
        return false;
      }

      if (payMode === "range" && (!payMin.trim() || !payMax.trim())) {
        setMessage("Please enter both values for the pay range.");
        return false;
      }

      if (payMode !== "range" && !payRate.trim()) {
        setMessage("Please enter a pay value.");
        return false;
      }

      if (canManageCandidateNotificationRouting) {
        const parsedNotificationEmails = parseCandidateNotificationEmails(candidateNotificationEmail);
        if (!parsedNotificationEmails.ok) {
          setMessage(parsedNotificationEmails.message);
          return false;
        }
      }

      return true;
    }

    return true;
  }

  function nextStep() {
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(4, prev + 1) as Step);
  }

  function previousStep() {
    resetMessage();
    setStep((prev) => Math.max(1, prev - 1) as Step);
  }

  const computedPay = useMemo(() => {
    if (payMode === "range") {
      if (!payMin && !payMax) return "";
      return `${payMin || "—"} – ${payMax || "—"}`;
    }
    return payRate;
  }, [payMode, payMin, payMax, payRate]);

  function resetForm() {
    setStep(1);
    setMessage(null);

    setCompanyName("");
    setEmployeeCount("");
    setContactName("");
    setWorkEmail(authUserEmail ?? "");

    setRestaurantType("");
    setJobTitle("");
    setRoleCategories([]);
    setCity("");
    setStateVal("");

    setEmploymentType("");
    setScheduleTags([]);
    setPayMode("range");
    setPayMin("");
    setPayMax("");
    setPayRate("");
    setCompanyWebsite("");
    setAddress("");
    setHowToApply("");
    setCandidateNotificationEmail(authUserEmail ?? "");
    setDescription("");
    setBenefits([]);
    setSelectedStoreId("");
    setSelectedTemplateId("");
  }

  async function handleFinalSubmit() {
    resetMessage();

    if (!validateStep(3)) {
      setStep(3);
      return;
    }

    if (!canPostJobs || employerAccess?.canManageJobs === false) {
      setMessage(employerAccess?.canManageJobs === false ? "Contact your account admin to make changes." : "Start or reactivate billing from your employer dashboard before posting a job.");
      return;
    }

    const parsedNotificationEmails = canManageCandidateNotificationRouting
      ? parseCandidateNotificationEmails(candidateNotificationEmail)
      : ({ ok: true, emails: [], value: "" } as const);
    if (!parsedNotificationEmails.ok) {
      setMessage(parsedNotificationEmails.message);
      setStep(3);
      return;
    }
    const notificationEmails = parsedNotificationEmails.emails;
    const notificationEmail = parsedNotificationEmails.value;

    setIsSubmitting(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const currentUser = userData?.user;
    const employerUserId = currentUser?.id;
    const employerEmail = currentUser?.email?.trim();

    if (userError || !employerUserId || !employerEmail) {
      setIsSubmitting(false);
      setMessage("Please sign in again before posting this job so we can link it to your employer account.");
      return;
    }

    if (!currentUser.email_confirmed_at) {
      setIsSubmitting(false);
      setAuthStatus("unconfirmed");
      setMessage("Please confirm your email before posting a job.");
      return;
    }

    const roleCategoryForDb = roleCategories[0] || "Other";

    const combinedDescription = [
      description.trim(),
      scheduleTags.length ? `Schedule: ${scheduleTags.join(", ")}` : "",
      benefits.length ? `Benefits: ${benefits.join(", ")}` : "",
      restaurantType ? `Restaurant type: ${restaurantType}` : "",
      contactName.trim() ? `Contact: ${contactName.trim()}` : "",
      employeeCount ? `Company size: ${employeeCount}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const jobPayload = {
      restaurant_name: companyName.trim(),
      title: jobTitle.trim(),
      role_category: roleCategoryForDb,
      city: city.trim(),
      state: stateVal.trim().toUpperCase(),
      apply_email: workEmail.trim(),
      company_website: companyWebsite.trim() || null,
      employment_type: employmentType || null,
      pay_range: computedPay || null,
      address: address.trim() || null,
      how_to_apply: howToApply.trim() || null,
      description: combinedDescription,
      active: false,
      employer_email: employerEmail,
      employer_user_id: employerUserId,
      employer_account_id: employerAccess?.accountId ?? null,
      posted_by_user_id: employerUserId,
      posted_by_email: employerEmail,
      candidate_notification_email: notificationEmail || null,
      candidate_notification_emails: notificationEmails.length > 0 ? notificationEmails : null,
      candidate_notification_routing: notificationEmails.length > 0 ? "custom_job_email" : employerAccess?.defaultCandidateNotificationRouting ?? "job_poster",
      employer_store_id: selectedStoreId || null,
      employer_job_template_id: selectedTemplateId || null,
    };

    let insertResult = await supabase.from("jobs").insert([jobPayload]);

    if (
      insertResult.error &&
      (insertResult.error.message.includes("employer_store_id") || insertResult.error.message.includes("employer_job_template_id"))
    ) {
      const { employer_store_id: _storeId, employer_job_template_id: _templateId, ...legacyJobPayload } = jobPayload;
      void _storeId;
      void _templateId;
      insertResult = await supabase.from("jobs").insert([legacyJobPayload]);
    }

    setIsSubmitting(false);

    if (insertResult.error) {
      setMessage(`Error: ${insertResult.error.message}`);
      return;
    }

    setMessage(null);
    setShowSuccessModal(true);
  }

  const pageWrap: React.CSSProperties = {
    minHeight: "100vh",
    backgroundColor: BG,
    paddingTop: 58,
    paddingBottom: 44,
  };

  const container: React.CSSProperties = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 18px",
  };

  const mainCard: React.CSSProperties = {
    backgroundColor: "#f6f5f3",
    border: `1px solid ${BORDER}`,
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  };

  const stepCard = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "rgba(53,128,110,.24)" : BORDER}`,
    backgroundColor: active ? SOFT_GREEN : "rgba(255,255,255,.52)",
    borderRadius: 18,
    padding: "14px 18px",
    minHeight: 86,
  });

  const sectionTitleWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 22,
    marginBottom: 22,
  };

  const sectionTitleLine: React.CSSProperties = {
    height: 1,
    width: 180,
    background: "rgba(0,0,0,.18)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 900,
    color: TEXT,
    fontFamily: "var(--font-body)",
  };

  const helperStyle: React.CSSProperties = {
    marginTop: 8,
    color: MUTED,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.45,
    fontFamily: "var(--font-body)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 54,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    backgroundColor: CARD,
    padding: "0 16px",
    outline: "none",
    color: TEXT,
    fontSize: 15,
    fontWeight: 800,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.05)",
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 130,
    borderRadius: 14,
    border: `1px solid ${BORDER}`,
    backgroundColor: CARD,
    padding: "14px 16px",
    outline: "none",
    color: TEXT,
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.05)",
    resize: "vertical" as const,
  };

  const pillStyle = (selected: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${selected ? "rgba(53,128,110,.22)" : "rgba(0,0,0,.10)"}`,
    backgroundColor: selected ? SOFT_GREEN : "rgba(255,255,255,.5)",
    color: selected ? GREEN : "rgba(0,0,0,.75)",
    fontWeight: 900,
    fontSize: 14,
    fontFamily: "var(--font-body)",
    cursor: "pointer",
    userSelect: "none" as const,
  });

  const primaryBtn: React.CSSProperties = {
    ...homePrimaryButton,
    minWidth: 180,
    minHeight: 58,
    fontSize: 16,
    cursor: "pointer",
  };

  const secondaryBtn: React.CSSProperties = {
    ...homeSecondaryButton,
    minWidth: 90,
    minHeight: 50,
    fontSize: 14,
    cursor: "pointer",
  };

  const topActionLink: React.CSSProperties = {
    ...homeSecondaryButton,
    minWidth: 116,
    minHeight: 58,
    fontSize: 15,
  };

  if (authStatus === "loading") {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontWeight: 800,
          fontFamily: "var(--font-body)",
        }}
      >
        Loading…
      </main>
    );
  }

  if (authStatus === "unconfirmed") {
    return (
      <main style={pageWrap}>
        <div style={{ ...container, maxWidth: 760 }}>
          <section style={{ ...mainCard, textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid rgba(53,128,110,0.18)",
                backgroundColor: "rgba(53,128,110,0.08)",
                color: GREEN,
                fontWeight: 900,
                fontFamily: "var(--font-body)",
                fontSize: 12,
                marginBottom: 16,
              }}
            >
              EMAIL CONFIRMATION REQUIRED
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-heading)",
                fontSize: 46,
                lineHeight: 1,
                color: GREEN,
              }}
            >
              Please confirm your email before posting a job.
            </h1>
            <p
              style={{
                margin: "16px auto 0",
                maxWidth: 560,
                color: MUTED,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
                lineHeight: 1.6,
              }}
            >
              Check your inbox for the Supabase confirmation link. Once your email is confirmed, return here to create
              job ads for your restaurant.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
              <Link
                href={`/check-email?email=${encodeURIComponent(authUserEmail ?? "")}`}
                style={homePrimaryButton}
                className="rn-btn-primary"
              >
                Check email page
              </Link>
              <Link href="/employer-login?next=/post-job" style={homeSecondaryButton} className="rn-btn-secondary">
                Return to login
              </Link>
            </div>
            {message && (
              <div style={{ marginTop: 18, color: ERROR, fontWeight: 900, fontFamily: "var(--font-body)" }}>
                {message}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={pageWrap}>
      <div style={container}>
        <section style={mainCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
              marginBottom: 10,
            }}
            className="rn-postjob-top"
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--font-heading)",
                  fontSize: 52,
                  lineHeight: 0.98,
                  color: "rgba(0,0,0,.88)",
                }}
              >
                Post a Job
              </h1>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 16,
                  color: MUTED,
                  fontWeight: 800,
                  fontFamily: "var(--font-body)",
                }}
              >
                Step {step} of 4 • Fields marked * are required
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/employer-dashboard" style={topActionLink} className="rn-btn-secondary">
                Billing
              </Link>
              <Link href="/jobs" style={topActionLink} className="rn-btn-secondary">
                View jobs
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginTop: 16,
            }}
            className="rn-steps-grid"
          >
            {[
              { n: 1, title: "Company info" },
              { n: 2, title: "Job info" },
              { n: 3, title: "Details" },
              { n: 4, title: "Review" },
            ].map((item) => (
              <div key={item.n} style={stepCard(step === item.n)}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: MUTED,
                    fontFamily: "var(--font-body)",
                    textTransform: "uppercase",
                  }}
                >
                  Step {item.n}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 18,
                    fontWeight: 900,
                    color: TEXT,
                    fontFamily: "var(--font-body)",
                    lineHeight: 1.05,
                  }}
                >
                  {item.title}
                </div>
              </div>
            ))}
          </div>

          <section
            style={{
              marginTop: 18,
              border: `1px solid ${BORDER}`,
              borderRadius: 18,
              backgroundColor: "#ffffff",
              padding: 18,
              boxShadow: "0 8px 18px rgba(0,0,0,.04)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, color: TEXT, fontFamily: "var(--font-body)", marginBottom: 12 }}>
              Optional store and template shortcuts
            </div>
            <div className="rn-two-col">
              <div>
                <label htmlFor="store-selector" style={labelStyle}>Select Store</label>
                <select id="store-selector" value={selectedStoreId} onChange={(event) => applyStoreSelection(event.target.value)} style={inputStyle}>
                  <option value="">No store selected</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {[store.location_name, store.city, store.state].filter(Boolean).join(" — ")}
                    </option>
                  ))}
                </select>
                <div style={helperStyle}>Selecting a store fills available location, routing, pay, and application fields. You can still edit every field.</div>
              </div>
              <div>
                <label htmlFor="template-selector" style={labelStyle}>Select Job Template</label>
                <select id="template-selector" value={selectedTemplateId} onChange={(event) => applyTemplateSelection(event.target.value)} style={inputStyle}>
                  <option value="">No template selected</option>
                  {jobTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.template_name}
                    </option>
                  ))}
                </select>
                <div style={helperStyle}>
                  {jobTemplates.length > 0
                    ? "Selecting a template fills the job title, category, schedule, description, and benefits. All fields remain editable."
                    : "No templates available."}
                </div>
              </div>
            </div>
          </section>

          <div style={sectionTitleWrap}>
            <div style={sectionTitleLine} />
            <div
              style={{
                fontSize: 34,
                lineHeight: 1,
                fontWeight: 700,
                color: GREEN,
                fontFamily: "var(--font-heading)",
              }}
              className="rn-section-title"
            >
              {step === 1 && "Company Info"}
              {step === 2 && "Job Info"}
              {step === 3 && "Job Details"}
              {step === 4 && "Review"}
            </div>
            <div style={sectionTitleLine} />
          </div>

          {step === 1 && (
            <div className="rn-two-col">
              <div>
                <label htmlFor="company-name" style={labelStyle}>Your company’s name *</label>
                <input
                  id="company-name"
                  required
                  aria-invalid={!!message && step === 1 && !companyName.trim()}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={inputStyle}
                  placeholder="Example Restaurant Group"
                />
              </div>

              <div>
                <label htmlFor="employee-count" style={labelStyle}>Your company’s number of employees *</label>
                <select
                  id="employee-count"
                  required
                  aria-invalid={!!message && step === 1 && !employeeCount}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select…</option>
                  {EMPLOYEE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="contact-name" style={labelStyle}>Your first and last name *</label>
                <input
                  id="contact-name"
                  required
                  aria-invalid={!!message && step === 1 && !contactName.trim()}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  style={inputStyle}
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label htmlFor="work-email" style={labelStyle}>Work Email *</label>
                <input
                  id="work-email"
                  required
                  aria-invalid={!!message && step === 1 && !workEmail.trim()}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="you@restaurant.com"
                />
                <div style={helperStyle}>
                  We use your email to follow up about the job post and verification.
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="rn-two-col">
                <div>
                  <label htmlFor="restaurant-type" style={labelStyle}>Type of Restaurant *</label>
                  <select
                    id="restaurant-type"
                    required
                    aria-invalid={!!message && step === 2 && !restaurantType}
                    aria-describedby={message ? "post-job-form-error" : undefined}
                    value={restaurantType}
                    onChange={(e) => setRestaurantType(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select…</option>
                    {RESTAURANT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="job-title" style={labelStyle}>Job title *</label>
                  <input
                    id="job-title"
                    required
                    aria-invalid={!!message && step === 2 && !jobTitle.trim()}
                    aria-describedby={message ? "post-job-form-error" : undefined}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    style={inputStyle}
                    placeholder="Host"
                  />
                </div>
              </div>

              <fieldset style={{ marginTop: 18, border: 0, padding: 0 }}>
                <legend style={labelStyle}>Role Category *</legend>
                <div role="group" aria-describedby="role-category-help" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleValue(role, roleCategories, setRoleCategories)}
                      className="rn-btn-pill"
                      style={pillStyle(roleCategories.includes(role))}
                      aria-pressed={roleCategories.includes(role)}
                    >
                      {role}
                    </button>
                  ))}
                </div>
                <div id="role-category-help" style={helperStyle}>Select one or more categories that fit this role.</div>
              </fieldset>

              <div className="rn-two-col" style={{ marginTop: 18 }}>
                <div>
                  <label htmlFor="job-city" style={labelStyle}>City *</label>
                  <input
                    id="job-city"
                    required
                    aria-invalid={!!message && step === 2 && !city.trim()}
                    aria-describedby={message ? "post-job-form-error" : undefined}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={inputStyle}
                    placeholder="Baltimore"
                  />
                  <div style={helperStyle}>We’ll add Google Places autocomplete later.</div>
                </div>

                <div>
                  <label htmlFor="job-state" style={labelStyle}>State *</label>
                  <select
                    id="job-state"
                    required
                    aria-invalid={!!message && step === 2 && !stateVal.trim()}
                    aria-describedby={message ? "post-job-form-error" : undefined}
                    value={stateVal}
                    onChange={(e) => setStateVal(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select…</option>
                    {STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <fieldset style={{ border: 0, padding: 0 }}>
                <legend style={labelStyle}>What type of job is this? *</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {EMPLOYMENT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setEmploymentType(option)}
                      className="rn-btn-pill"
                      style={pillStyle(employmentType === option)}
                      aria-pressed={employmentType === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ marginTop: 16, border: 0, padding: 0 }}>
                <legend style={labelStyle}>What is the schedule for this job?</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SCHEDULE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleValue(option, scheduleTags, setScheduleTags)}
                      className="rn-btn-pill"
                      style={pillStyle(scheduleTags.includes(option))}
                      aria-pressed={scheduleTags.includes(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset style={{ marginTop: 16, border: 0, padding: 0 }}>
                <legend style={labelStyle}>Pay *</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { value: "range", label: "Range" },
                    { value: "minimum", label: "Minimum" },
                    { value: "maximum", label: "Maximum" },
                    { value: "rate", label: "Rate" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPayMode(item.value as PayMode)}
                      className="rn-btn-pill"
                      style={pillStyle(payMode === item.value)}
                      aria-pressed={payMode === item.value}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="rn-two-col" style={{ marginTop: 16 }}>
                {payMode === "range" ? (
                  <>
                    <div>
                      <label className="sr-only" htmlFor="pay-minimum">Minimum pay</label>
                      <input
                        id="pay-minimum"
                        required
                        aria-invalid={!!message && step === 3 && payMode === "range" && !payMin.trim()}
                        aria-describedby={message ? "post-job-form-error" : undefined}
                        value={payMin}
                        onChange={(e) => setPayMin(e.target.value)}
                        style={inputStyle}
                        placeholder="Minimum"
                      />
                    </div>
                    <div>
                      <label className="sr-only" htmlFor="pay-maximum">Maximum pay</label>
                      <input
                        id="pay-maximum"
                        required
                        aria-invalid={!!message && step === 3 && payMode === "range" && !payMax.trim()}
                        aria-describedby={message ? "post-job-form-error" : undefined}
                        value={payMax}
                        onChange={(e) => setPayMax(e.target.value)}
                        style={inputStyle}
                        placeholder="Maximum"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="sr-only" htmlFor="pay-rate">Pay amount</label>
                      <input
                        id="pay-rate"
                        required
                        aria-invalid={!!message && step === 3 && !payRate.trim()}
                        aria-describedby={message ? "post-job-form-error" : undefined}
                        value={payRate}
                        onChange={(e) => setPayRate(e.target.value)}
                        style={inputStyle}
                        placeholder={payMode === "rate" ? "$18/hr" : "$18"}
                      />
                    </div>
                    <div />
                  </>
                )}
              </div>

              <div style={helperStyle}>
                For MVP we’ll require pay. Later we can enforce only for certain states.
              </div>

              <div className="rn-two-col" style={{ marginTop: 16 }}>
                <div>
                  <label htmlFor="company-website" style={labelStyle}>Company website</label>
                  <input
                    id="company-website"
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    style={inputStyle}
                    placeholder="https://company.com"
                  />
                </div>

                <div>
                  <label htmlFor="job-address" style={labelStyle}>Address</label>
                  <input
                    id="job-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    style={inputStyle}
                    placeholder="3410 Plum Tree Dr"
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label htmlFor="how-to-apply" style={labelStyle}>How to apply *</label>
                <input
                  id="how-to-apply"
                  required
                  aria-invalid={!!message && step === 3 && !howToApply.trim()}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={howToApply}
                  onChange={(e) => setHowToApply(e.target.value)}
                  style={inputStyle}
                  placeholder="Apply online, email, or visit in person."
                />
                <div style={helperStyle}>Example: Apply online, email, or visit in person.</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label htmlFor="candidate-notification-email" style={labelStyle}>Where should candidate interest emails be sent?</label>
                <input
                  id="candidate-notification-email"
                  type="text"
                  inputMode="email"
                  aria-invalid={!!message && canManageCandidateNotificationRouting && !parseCandidateNotificationEmails(candidateNotificationEmail).ok}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={candidateNotificationEmail}
                  onChange={(e) => setCandidateNotificationEmail(e.target.value)}
                  style={inputStyle}
                  placeholder="gm@example.com, op@example.com, hr@example.com"
                  disabled={!canManageCandidateNotificationRouting}
                />
                <div style={helperStyle}>
                  {canManageCandidateNotificationRouting
                    ? "Enter one or more email addresses. Separate multiple emails with commas."
                    : "Your account role cannot edit candidate notification routing. Account defaults will be used."}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label htmlFor="job-description" style={labelStyle}>Job description *</label>
                <textarea
                  id="job-description"
                  required
                  aria-invalid={!!message && step === 3 && !description.trim()}
                  aria-describedby={message ? "post-job-form-error" : undefined}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={textareaStyle}
                  placeholder="Responsibilities, schedule, experience required, etc."
                />
              </div>

              <fieldset style={{ marginTop: 16, border: 0, padding: 0 }}>
                <legend style={labelStyle}>Benefits</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BENEFIT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleValue(option, benefits, setBenefits)}
                      className="rn-btn-pill"
                      style={pillStyle(benefits.includes(option))}
                      aria-pressed={benefits.includes(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 4 && (
            <div className="rn-review-grid">
              <div
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 18,
                  backgroundColor: "#ffffff",
                  padding: 20,
                  boxShadow: "0 8px 18px rgba(0,0,0,.04)",
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: TEXT,
                    fontFamily: "var(--font-body)",
                    marginBottom: 16,
                  }}
                >
                  Review your job post
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    fontSize: 15,
                    lineHeight: 1.45,
                    color: "rgba(0,0,0,.80)",
                    fontWeight: 700,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <div><strong>Selected store:</strong> {stores.find((store) => store.id === selectedStoreId)?.location_name || "—"}</div>
                  <div><strong>Selected template:</strong> {jobTemplates.find((template) => template.id === selectedTemplateId)?.template_name || "—"}</div>
                  <div><strong>Company:</strong> {companyName || "—"}</div>
                  <div><strong>Employees:</strong> {employeeCount || "—"}</div>
                  <div><strong>Contact:</strong> {contactName || "—"}</div>
                  <div><strong>Email:</strong> {workEmail || "—"}</div>

                  <div style={{ height: 6 }} />

                  <div><strong>Restaurant type:</strong> {restaurantType || "—"}</div>
                  <div><strong>Job title:</strong> {jobTitle || "—"}</div>
                  <div><strong>Role categories:</strong> {roleCategories.join(", ") || "—"}</div>
                  <div><strong>Location:</strong> {city || "—"}, {stateVal || "—"}</div>

                  <div style={{ height: 6 }} />

                  <div><strong>Employment type:</strong> {employmentType || "—"}</div>
                  <div><strong>Schedule:</strong> {scheduleTags.join(", ") || "—"}</div>
                  <div><strong>Pay:</strong> {computedPay || "—"}</div>
                  <div><strong>Website:</strong> {companyWebsite || "—"}</div>
                  <div><strong>Address:</strong> {address || "—"}</div>
                  <div><strong>How to apply:</strong> {howToApply || "—"}</div>
                  <div><strong>Candidate notification emails:</strong> {canManageCandidateNotificationRouting && candidateNotificationEmail.trim() ? formatCandidateNotificationEmails(candidateNotificationEmail) : "Account default"}</div>
                  <div><strong>Benefits:</strong> {benefits.join(", ") || "—"}</div>

                  <div style={{ height: 6 }} />

                  <div style={{ fontWeight: 900, color: TEXT }}>Description:</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{description || "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 18,
                    backgroundColor: "#ffffff",
                    padding: 18,
                    boxShadow: "0 8px 18px rgba(0,0,0,.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: TEXT,
                      fontFamily: "var(--font-body)",
                      marginBottom: 14,
                    }}
                  >
                    Preview
                  </div>

                  <div
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 16,
                      backgroundColor: "#fcfcfb",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: 16,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                      className="rn-preview-top"
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color: TEXT,
                            lineHeight: 1.2,
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {jobTitle || "Job title"}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 14,
                            color: MUTED,
                            fontWeight: 800,
                            lineHeight: 1.35,
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {companyName || "Company"} — {city || "City"}, {stateVal || "ST"}
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                          {[
                            computedPay || "Pay",
                            employmentType || "Type",
                            roleCategories[0] || "Role",
                          ].map((pill) => (
                            <div
                              key={pill}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: `1px solid ${BORDER}`,
                                backgroundColor: "rgba(255,255,255,.85)",
                                fontWeight: 800,
                                fontSize: 12,
                                color: "rgba(0,0,0,.78)",
                              }}
                            >
                              {pill}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: 102,
                          height: 48,
                          borderRadius: 14,
                          border: `1px solid ${BORDER}`,
                          backgroundColor: "rgba(0,0,0,.03)",
                          color: "rgba(0,0,0,.62)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          fontSize: 15,
                          fontFamily: "var(--font-body)",
                          padding: "0 12px",
                        }}
                      >
                        Preview only
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop: `1px solid ${BORDER}`,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          color: TEXT,
                          marginBottom: 8,
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        Job description
                      </div>
                      <div
                        style={{
                          color: "rgba(0,0,0,.72)",
                          lineHeight: 1.5,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {description || "Description preview"}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 18,
                    backgroundColor: "#ffffff",
                    padding: 18,
                    boxShadow: "0 8px 18px rgba(0,0,0,.04)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      color: TEXT,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    When you confirm
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: MUTED,
                      fontWeight: 800,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    We’ll submit this job post for review. Once approved, it becomes publicly
                    visible on the site.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 18,
              marginTop: 22,
            }}
            className="rn-footer-actions"
          >
            <div>
              <button className="rn-btn-secondary" type="button" onClick={previousStep} style={secondaryBtn} disabled={step === 1}>
                Back
              </button>

              <div
                style={{
                  marginTop: 12,
                  color: MUTED,
                  fontSize: 12,
                  fontWeight: 800,
                  fontFamily: "var(--font-body)",
                }}
              >
                Draft saves automatically on this device. Posting is reviewed before going public.
              </div>

              {message && (
                <div
                  id="post-job-form-error"
                  role="alert"
                  style={{
                    marginTop: 10,
                    color: ERROR,
                    fontWeight: 800,
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {message}
                </div>
              )}
            </div>

            <div>
              {step < 4 ? (
                <button className="rn-btn-primary" type="button" onClick={nextStep} style={primaryBtn}>
                  Save & Continue
                </button>
              ) : (
                <button
                  className="rn-btn-primary"
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  style={{
                    ...primaryBtn,
                    opacity: isSubmitting ? 0.7 : 1,
                    boxShadow: "0 0 0 3px rgba(53,128,110,.10), 0 8px 18px rgba(0,0,0,.07)",
                  }}
                >
                  {isSubmitting ? "Submitting..." : "Confirm"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {showSuccessModal && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            ref={successDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-job-success-title"
            aria-describedby="post-job-success-description"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            style={{
              width: "100%",
              maxWidth: 500,
              backgroundColor: "#ffffff",
              borderRadius: 24,
              border: `1px solid ${BORDER}`,
              boxShadow: "0 24px 60px rgba(0,0,0,.20)",
              padding: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 999,
                backgroundColor: "rgba(53,128,110,.12)",
                color: GREEN,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 900,
                margin: "0 auto 16px",
                fontFamily: "var(--font-body)",
              }}
            >
              ✓
            </div>

            <h2
              id="post-job-success-title"
              style={{
                margin: 0,
                fontSize: 30,
                lineHeight: 1.05,
                color: "rgba(0,0,0,.88)",
                fontFamily: "var(--font-heading)",
              }}
            >
              Job submitted
            </h2>

            <p
              id="post-job-success-description"
              style={{
                marginTop: 14,
                marginBottom: 0,
                color: "rgba(0,0,0,.68)",
                fontSize: 15,
                lineHeight: 1.6,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
              }}
            >
              Your job post has been submitted for review. Once approved, it will become publicly
              visible on the site.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 22,
              }}
            >
              <button
                className="rn-btn-primary"
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  router.push("/jobs");
                }}
                style={{
                  minWidth: 150,
                  height: 50,
                  borderRadius: 16,
                  border: "1px solid rgba(0,0,0,.08)",
                  backgroundColor: GREEN,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 15,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                View jobs
              </button>

              <button
                className="rn-btn-secondary"
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  resetForm();
                }}
                style={{
                  minWidth: 150,
                  height: 50,
                  borderRadius: 16,
                  border: `1px solid ${BORDER}`,
                  backgroundColor: "#fff",
                  color: "rgba(0,0,0,.76)",
                  fontWeight: 900,
                  fontSize: 15,
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                Post another
              </button>
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rn-two-col {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
            }

            .rn-review-grid {
              display: grid;
              grid-template-columns: 1.1fr .9fr;
              gap: 18px;
            }

            @media (max-width: 980px) {
              .rn-steps-grid {
                grid-template-columns: 1fr 1fr !important;
              }

              .rn-review-grid,
              .rn-two-col {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 720px) {
              .rn-postjob-top,
              .rn-footer-actions,
              .rn-preview-top {
                flex-direction: column !important;
                align-items: stretch !important;
              }

              .rn-section-title {
                font-size: 28px !important;
              }

              .rn-steps-grid {
                grid-template-columns: 1fr !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

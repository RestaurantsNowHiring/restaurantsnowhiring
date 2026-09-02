/** Privacy-safe, typed GA4 instrumentation for the employer conversion funnel. */
export type EmployerAnalyticsEvent =
  | { name: "employer_signup_start"; parameters: { page_path: string; signup_method?: "password"; country?: string } }
  | { name: "employer_signup_success"; parameters: { page_path: string; signup_method?: "password"; country?: string; company_id?: string } }
  | { name: "employer_signup_error"; parameters: { page_path: string; error_type: EmployerSignupErrorType; error_code?: string } }
  | { name: "employer_login_success"; parameters: { page_path: string; login_method?: "password"; company_id?: string } }
  | { name: "employer_dashboard_view"; parameters: { page_path: string; company_id?: string } }
  | { name: "employer_post_job_click"; parameters: { page_path: string; cta_name: string; company_id?: string } }
  | { name: "employer_job_form_start"; parameters: { page_path: string; country?: string; company_id?: string } }
  | { name: "employer_job_posted"; parameters: { page_path: string; job_id?: string; company_id?: string; country?: string; source_type?: string; trial_status?: "free_trial" | "paid" } };

export type EmployerSignupErrorType =
  | "validation_error"
  | "account_exists"
  | "auth_error"
  | "network_error"
  | "unknown_error";

type SafeAuthError = { code?: string; message?: string };

export function currentPagePath(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function trackEmployerEvent(event: EmployerAnalyticsEvent): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event.name, event.parameters);
}

export function normalizeSignupError(error: SafeAuthError): EmployerSignupErrorType {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (code.includes("already") || message.includes("already registered") || message.includes("already exists")) return "account_exists";
  if (code.includes("network") || message.includes("network") || message.includes("fetch")) return "network_error";
  if (code || message) return "auth_error";
  return "unknown_error";
}

export function safeAnalyticsErrorCode(error: SafeAuthError): string | undefined {
  return error.code && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : undefined;
}

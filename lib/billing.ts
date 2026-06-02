import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./supabaseAdmin";
import { getEmployerAccountContext } from "./employerAccounts";

export type BillingRecord = {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_current_period_end: string | null;
  employer_account_id: string | null;
};

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

type StripeResponse<T> = T & {
  id?: string;
  object?: string;
  error?: {
    message?: string;
    type?: string;
  };
};

export type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  trial_start?: number | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: {
    data?: Array<{
      id: string;
      quantity?: number | null;
      price?: { id?: string | null } | null;
    }>;
  } | null;
};

export type BillingAccess = {
  allowed: boolean;
  reason: "active_subscription" | "trial_active" | "setup_required" | "subscription_inactive";
};

const BILLABLE_JOB_FILTER = { status: "active", active: true };
const ACTIVE_BILLING_STATUSES = new Set(["active", "trialing"]);

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function encodeStripeForm(value: Record<string, unknown>, prefix?: string): URLSearchParams {
  const params = new URLSearchParams();

  function appendEntries(input: unknown, keyPrefix: string) {
    if (input === undefined || input === null) return;

    if (Array.isArray(input)) {
      input.forEach((item, index) => appendEntries(item, `${keyPrefix}[${index}]`));
      return;
    }

    if (typeof input === "object") {
      Object.entries(input as Record<string, unknown>).forEach(([key, nestedValue]) => {
        appendEntries(nestedValue, keyPrefix ? `${keyPrefix}[${key}]` : key);
      });
      return;
    }

    params.append(keyPrefix, String(input));
  }

  Object.entries(value).forEach(([key, nestedValue]) => appendEntries(nestedValue, prefix ? `${prefix}[${key}]` : key));
  return params;
}

export async function stripeRequest<T>(path: string, options: StripeRequestOptions = {}) {
  const method = options.method ?? "GET";
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? encodeStripeForm(options.body ?? {}).toString() : undefined,
  });

  const payload = (await response.json()) as StripeResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Stripe request failed with status ${response.status}.`);
  }

  return payload as T;
}

export async function getAuthUserFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public environment variables are not configured.");

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) return null;

  return { id: data.user.id, email: data.user.email.trim() };
}

export async function getBillingRecord(userId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const { data, error } = await supabaseAdmin
    .from("employer_billing")
    .select("user_id,email,stripe_customer_id,stripe_subscription_id,billing_status,trial_started_at,trial_ends_at,subscription_current_period_end,employer_account_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Could not load billing record.");
  return (data ?? null) as BillingRecord | null;
}

export async function getBillingRecordForEmployerUser(user: { id: string; email: string }) {
  const context = await getEmployerAccountContext(user);
  return getBillingRecord(context.ownerUserId);
}

export async function countActiveBillableJobsForEmployerUser(user: { id: string; email: string }) {
  const context = await getEmployerAccountContext(user);
  return countActiveBillableJobs(context.ownerUserId, context.ownerEmail, context.accountId);
}

export async function countActiveBillableJobs(userId: string, email?: string | null, accountId?: string | null) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  let userIdCount = 0;
  let emailCount = 0;
  let accountCount = 0;

  if (accountId) {
    const accountResult = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("employer_account_id", accountId)
      .eq("status", BILLABLE_JOB_FILTER.status)
      .eq("active", BILLABLE_JOB_FILTER.active);

    if (!accountResult.error) {
      accountCount = accountResult.count ?? 0;
      return accountCount;
    }

    if (accountResult.error.code !== "42703") {
      throw new Error(accountResult.error.message || "Could not count billable jobs.");
    }
  }

  const userIdResult = await supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("employer_user_id", userId)
    .eq("status", BILLABLE_JOB_FILTER.status)
    .eq("active", BILLABLE_JOB_FILTER.active);

  if (userIdResult.error) throw new Error(userIdResult.error.message || "Could not count billable jobs.");
  userIdCount = userIdResult.count ?? 0;

  if (email) {
    const emailResult = await supabaseAdmin
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .is("employer_user_id", null)
      .eq("employer_email", email)
      .eq("status", BILLABLE_JOB_FILTER.status)
      .eq("active", BILLABLE_JOB_FILTER.active);

    if (emailResult.error) throw new Error(emailResult.error.message || "Could not count billable jobs.");
    emailCount = emailResult.count ?? 0;
  }

  return userIdCount + emailCount;
}

export function evaluateBillingAccess(record: BillingRecord | null): BillingAccess {
  if (!record) return { allowed: false, reason: "setup_required" };

  if (record.billing_status && ACTIVE_BILLING_STATUSES.has(record.billing_status)) {
    return { allowed: true, reason: "active_subscription" };
  }

  if (record.trial_ends_at && new Date(record.trial_ends_at).getTime() > Date.now()) {
    return { allowed: true, reason: "trial_active" };
  }

  if (record.trial_ends_at) return { allowed: false, reason: "subscription_inactive" };
  return { allowed: false, reason: "setup_required" };
}

function unixToIso(timestamp?: number | null) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function stripeId(value?: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function metadataValue(metadata: Record<string, string> | null | undefined, key: string) {
  const value = metadata?.[key]?.trim();
  return value || null;
}

export async function upsertBillingFromSubscription(subscription: StripeSubscription, fallbackUserId?: string | null) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error("Stripe subscription is missing a customer id.");

  const metadataUserId = metadataValue(subscription.metadata, "user_id");
  const metadataEmployerAccountId = metadataValue(subscription.metadata, "employer_account_id");
  let userId = metadataUserId || fallbackUserId || null;

  if (!userId) {
    const filters = [
      `stripe_subscription_id.eq.${subscription.id}`,
      `stripe_customer_id.eq.${customerId}`,
      metadataEmployerAccountId ? `employer_account_id.eq.${metadataEmployerAccountId}` : null,
    ].filter(Boolean);

    const { data, error } = await supabaseAdmin
      .from("employer_billing")
      .select("user_id")
      .or(filters.join(","))
      .maybeSingle();

    if (error) throw new Error(error.message || "Could not find billing owner.");
    userId = data?.user_id ?? null;
  }

  if (!userId) return null;

  const billingUpdate: Record<string, string | null> = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    billing_status: subscription.status,
    trial_started_at: unixToIso(subscription.trial_start),
    trial_ends_at: unixToIso(subscription.trial_end),
    subscription_current_period_end: unixToIso(subscription.current_period_end),
    updated_at: new Date().toISOString(),
  };

  if (metadataEmployerAccountId) {
    billingUpdate.employer_account_id = metadataEmployerAccountId;
  }

  const { data, error } = await supabaseAdmin
    .from("employer_billing")
    .upsert(billingUpdate, { onConflict: "user_id" })
    .select("user_id,email,stripe_customer_id,stripe_subscription_id,billing_status,trial_started_at,trial_ends_at,subscription_current_period_end,employer_account_id")
    .single();

  if (error) throw new Error(error.message || "Could not sync billing record.");
  return data as BillingRecord;
}

export async function syncSubscriptionQuantityForEmployer(userId: string) {
  const record = await getBillingRecord(userId);
  if (!record?.stripe_subscription_id || !record.email) return null;

  return syncSubscriptionQuantity(record.stripe_subscription_id, userId, record.email);
}

export async function syncSubscriptionQuantity(subscriptionId: string, userId?: string | null, email?: string | null) {
  const subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${subscriptionId}?expand%5B%5D=items`);
  const resolvedUserId = userId ?? subscription.metadata?.user_id ?? null;
  if (!resolvedUserId) return subscription;

  const activeJobCount = await countActiveBillableJobs(resolvedUserId, email);
  const configuredPriceId = process.env.STRIPE_PRICE_ID;
  const item = subscription.items?.data?.find((candidate) => !configuredPriceId || candidate.price?.id === configuredPriceId) ?? subscription.items?.data?.[0];

  if (item) {
    await stripeRequest(`/subscription_items/${item.id}`, {
      method: "POST",
      body: {
        quantity: activeJobCount,
        proration_behavior: "none",
      },
    });
  }

  return subscription;
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split("=");
    if (!key || !value) return acc;
    acc[key] = [...(acc[key] ?? []), value];
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

  return signatures.some((signature) => {
    const expectedBuffer = Buffer.from(expected, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");
    return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
  });
}

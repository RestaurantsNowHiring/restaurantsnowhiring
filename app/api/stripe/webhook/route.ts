import { NextResponse } from "next/server";
import {
  StripeSubscription,
  stripeRequest,
  syncSubscriptionQuantity,
  upsertBillingFromSubscription,
  verifyStripeWebhookSignature,
} from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type StripeWebhookEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

type StripeIdReference = string | { id: string } | null;

type StripeCheckoutSession = {
  id: string;
  customer?: StripeIdReference;
  subscription?: StripeIdReference;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

type StripeInvoice = {
  customer?: StripeIdReference;
  subscription?: StripeIdReference;
};

function asSubscription(value: Record<string, unknown>) {
  return value as unknown as StripeSubscription;
}

function stripeObjectId(value?: StripeIdReference) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function findBillingOwnerByStripeIds(customerId?: string | null, subscriptionId?: string | null) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");
  if (!customerId && !subscriptionId) return null;

  const filters = [
    subscriptionId ? `stripe_subscription_id.eq.${subscriptionId}` : null,
    customerId ? `stripe_customer_id.eq.${customerId}` : null,
  ].filter(Boolean);

  const { data, error } = await supabaseAdmin
    .from("employer_billing")
    .select("user_id,email")
    .or(filters.join(","))
    .maybeSingle();

  if (error) throw new Error(error.message || "Could not find billing owner.");
  return data as { user_id: string; email: string | null } | null;
}

async function handleCheckoutCompleted(session: StripeCheckoutSession) {
  const sessionSubscriptionId = stripeObjectId(session.subscription);
  if (!sessionSubscriptionId) return;

  const subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${sessionSubscriptionId}?expand%5B%5D=items`);
  const userId = session.client_reference_id ?? session.metadata?.user_id ?? subscription.metadata?.user_id ?? null;
  const billing = await upsertBillingFromSubscription(subscription, userId);

  if (billing?.user_id) {
    await syncSubscriptionQuantity(subscription.id, billing.user_id, billing.email);
  }
}

async function handleSubscriptionChange(subscription: StripeSubscription) {
  const billing = await upsertBillingFromSubscription(subscription);
  if (billing?.user_id && subscription.status !== "canceled") {
    await syncSubscriptionQuantity(subscription.id, billing.user_id, billing.email);
  }
}

async function handleSubscriptionDeleted(subscription: StripeSubscription) {
  const billing = await upsertBillingFromSubscription({ ...subscription, status: "canceled" });
  return billing;
}

async function handleInvoicePaymentFailed(invoice: StripeInvoice) {
  const owner = await findBillingOwnerByStripeIds(stripeObjectId(invoice.customer), stripeObjectId(invoice.subscription));
  if (!owner) return;

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const { error } = await supabaseAdmin
    .from("employer_billing")
    .update({ billing_status: "past_due", updated_at: new Date().toISOString() })
    .eq("user_id", owner.user_id);

  if (error) throw new Error(error.message || "Could not mark invoice as failed.");
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    if (!verifyStripeWebhookSignature(payload, signature)) {
      return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
    }

    const event = JSON.parse(payload) as StripeWebhookEvent;

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as StripeCheckoutSession);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(asSubscription(event.data.object));
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(asSubscription(event.data.object));
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as StripeInvoice);
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe webhook failed." },
      { status: 500 },
    );
  }
}

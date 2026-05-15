import { NextResponse } from "next/server";
import {
  countActiveBillableJobs,
  getAuthUserFromRequest,
  getBillingRecord,
  getSiteUrl,
  stripeRequest,
} from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { getEmployerAccountContext } from "../../../../lib/employerAccounts";

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url: string | null };

export async function POST(request: Request) {
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: "STRIPE_PRICE_ID is not configured." }, { status: 500 });

    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user);
    if (!context.canManageBilling) return NextResponse.json({ error: "Only Account Owners can manage billing." }, { status: 403 });

    const billingUserId = context.ownerUserId;
    const billingEmail = context.ownerEmail || user.email;

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase service role is not configured on the server." }, { status: 500 });
    }

    const existingBilling = await getBillingRecord(billingUserId);
    if (
      existingBilling?.stripe_subscription_id &&
      (existingBilling.billing_status === "active" || existingBilling.billing_status === "trialing")
    ) {
      return NextResponse.json({ error: "Billing is already active for this employer." }, { status: 409 });
    }

    let customerId = existingBilling?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripeRequest<StripeCustomer>("/customers", {
        method: "POST",
        body: {
          email: billingEmail,
          metadata: { user_id: billingUserId, employer_account_id: context.accountId ?? "" },
        },
      });
      customerId = customer.id;
    }

    await supabaseAdmin.from("employer_billing").upsert(
      {
        user_id: billingUserId,
        email: billingEmail,
        stripe_customer_id: customerId,
        billing_status: existingBilling?.billing_status ?? "checkout_started",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    const activeJobCount = await countActiveBillableJobs(billingUserId, billingEmail, context.accountId);
    const siteUrl = getSiteUrl();
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      method: "POST",
      body: {
        mode: "subscription",
        customer: customerId,
        client_reference_id: billingUserId,
        success_url: `${siteUrl}/employer-dashboard?billing=success`,
        cancel_url: `${siteUrl}/employer-dashboard?billing=cancelled`,
        payment_method_collection: "always",
        line_items: [{ price: priceId, quantity: Math.max(activeJobCount, 1) }],
        subscription_data: {
          trial_period_days: 30,
          metadata: { user_id: billingUserId, employer_account_id: context.accountId ?? "" },
        },
        metadata: { user_id: billingUserId, employer_account_id: context.accountId ?? "" },
      },
    });

    if (!session.url) return NextResponse.json({ error: "Stripe did not return a Checkout URL." }, { status: 500 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout session failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe Checkout session failed." },
      { status: 500 },
    );
  }
}

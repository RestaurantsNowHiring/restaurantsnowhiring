import { NextResponse } from "next/server";
import { getAuthUserFromRequest, getBillingRecord, getSiteUrl, stripeRequest } from "../../../../lib/billing";

type StripePortalSession = { id: string; url: string };

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const billing = await getBillingRecord(user.id);
    if (!billing?.stripe_customer_id) {
      return NextResponse.json({ error: "Start your free trial before managing billing." }, { status: 400 });
    }

    const portalSession = await stripeRequest<StripePortalSession>("/billing_portal/sessions", {
      method: "POST",
      body: {
        customer: billing.stripe_customer_id,
        return_url: `${getSiteUrl()}/employer-dashboard`,
      },
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe portal session failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe portal session failed." },
      { status: 500 },
    );
  }
}

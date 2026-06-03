import { NextResponse } from "next/server";
import { getAuthUserFromRequest, syncSubscriptionQuantityForEmployer } from "../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.canManageBilling) return NextResponse.json({ error: "Only Account Owners can manage billing." }, { status: 403 });

    await syncSubscriptionQuantityForEmployer(context.ownerUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Billing quantity sync failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing quantity sync failed." },
      { status: 500 },
    );
  }
}

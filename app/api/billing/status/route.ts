import { NextResponse } from "next/server";
import {
  countActiveBillableJobsForEmployerUser,
  evaluateBillingAccess,
  getAuthUserFromRequest,
  getBillingRecordForEmployerUser,
} from "../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const selectedAccountId = getSelectedEmployerAccountIdFromRequest(request);
    const context = await getEmployerAccountContext(user, selectedAccountId);
    if (!context.canManageBilling) {
      return NextResponse.json({ error: "Only Account Owners can manage billing." }, { status: 403 });
    }

    const billing = await getBillingRecordForEmployerUser(user, context.accountId);
    const activeBillableJobCount = await countActiveBillableJobsForEmployerUser(user, context.accountId);
    const access = evaluateBillingAccess(billing);

    return NextResponse.json({
      billing,
      activeBillableJobCount,
      canPostOrActivateJobs: access.allowed,
      billingGateReason: access.reason,
    });
  } catch (error) {
    console.error("Billing status failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing status failed." },
      { status: 500 },
    );
  }
}

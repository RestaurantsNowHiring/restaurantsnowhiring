import { NextResponse } from "next/server";
import {
  countActiveBillableJobsForEmployerUser,
  evaluateBillingAccess,
  getAuthUserFromRequest,
  getBillingRecordForEmployerUser,
} from "../../../../lib/billing";

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const billing = await getBillingRecordForEmployerUser(user);
    const activeBillableJobCount = await countActiveBillableJobsForEmployerUser(user);
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

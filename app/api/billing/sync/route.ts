import { NextResponse } from "next/server";
import { getAuthUserFromRequest, syncSubscriptionQuantityForEmployer } from "../../../../lib/billing";

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    await syncSubscriptionQuantityForEmployer(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Billing quantity sync failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing quantity sync failed." },
      { status: 500 },
    );
  }
}

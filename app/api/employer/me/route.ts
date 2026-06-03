import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    return NextResponse.json({ employer: context });
  } catch (error) {
    console.error("Employer access load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load employer access." },
      { status: 500 },
    );
  }
}

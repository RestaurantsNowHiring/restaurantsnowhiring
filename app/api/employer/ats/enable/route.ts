import { NextResponse } from "next/server";
import { updateEmployerAtsConnectionState, updateEmployerAtsConnectionSource, type AtsConnectionAction } from "../../../../../lib/ats/connections/manageEmployerAtsConnection";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../../lib/employerAccounts";

const MAX_BODY_BYTES = 4096;
const MAX_CAREERS_PAGE_URL_LENGTH = 2048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Payload = { connectionId?: unknown; careersPageUrl?: unknown };
type Deps = { getAuthUserFromRequest: typeof getAuthUserFromRequest; getEmployerAccountContext: typeof getEmployerAccountContext; getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest; assertEmployerPermission: typeof assertEmployerPermission; updateEmployerAtsConnectionState: typeof updateEmployerAtsConnectionState; updateEmployerAtsConnectionSource: typeof updateEmployerAtsConnectionSource };
const defaultDependencies: Deps = { getAuthUserFromRequest, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest, assertEmployerPermission, updateEmployerAtsConnectionState, updateEmployerAtsConnectionSource };
function permissionStatus(error: unknown) { return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500; }
async function readPayload(request: Request, withUrl: boolean): Promise<{ connectionId: string; careersPageUrl?: string } | { error: string }> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) { const parsed = Number.parseInt(contentLength, 10); if (!Number.isFinite(parsed) || parsed > MAX_BODY_BYTES) return { error: "Request body is too large." }; }
  const payload = (await request.json().catch(() => null)) as Payload | null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: "Request body must be valid JSON." };
  const allowed = new Set(withUrl ? ["connectionId", "careersPageUrl"] : ["connectionId"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return { error: withUrl ? "Request body must only include connectionId and careersPageUrl." : "Request body must only include connectionId." };
  const connectionId = typeof payload.connectionId === "string" ? payload.connectionId.trim() : "";
  if (!connectionId) return { error: "connectionId is required." };
  if (!UUID_PATTERN.test(connectionId)) return { error: "connectionId must be a valid UUID." };
  if (!withUrl) return { connectionId };
  const careersPageUrl = typeof payload.careersPageUrl === "string" ? payload.careersPageUrl.trim() : "";
  if (!careersPageUrl) return { error: "careersPageUrl is required." };
  if (careersPageUrl.length > MAX_CAREERS_PAGE_URL_LENGTH) return { error: "careersPageUrl is too long." };
  return { connectionId, careersPageUrl };
}
export async function handleEmployerAtsConnectionActionPost(request: Request, action: AtsConnectionAction | "update-source", dependencies: Deps = defaultDependencies) {
  const failure = action === "update-source" ? "Could not update ATS careers page URL." : "Could not update ATS connection.";
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const context = await dependencies.getEmployerAccountContext(user, dependencies.getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(context, "canManageJobs");
    const payload = await readPayload(request, action === "update-source");
    if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 400 });
    const result = action === "update-source"
      ? await dependencies.updateEmployerAtsConnectionSource({ connectionId: payload.connectionId, employerAccountId: context.accountId, careersPageUrl: payload.careersPageUrl ?? "" })
      : await dependencies.updateEmployerAtsConnectionState({ connectionId: payload.connectionId, employerAccountId: context.accountId, action });
    if (result.status === "not-found") return NextResponse.json({ error: "ATS connection not found." }, { status: 404 });
    if (result.status === "validation-failed") return NextResponse.json({ error: result.message }, { status: 400 });
    if (result.status === "failed") return NextResponse.json({ error: failure }, { status: 500 });
    return NextResponse.json({ status: "updated" }, { status: 200 });
  } catch (error) {
    console.error("Employer ATS connection action failed", { error, action });
    return NextResponse.json({ error: failure }, { status: permissionStatus(error) });
  }
}
export async function POST(request: Request) { return handleEmployerAtsConnectionActionPost(request, "enable"); }

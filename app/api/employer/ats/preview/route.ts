import { NextResponse } from "next/server";
import { previewJobImport } from "../../../../../lib/ats/import/previewJobImport";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import {
  assertEmployerPermission,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
} from "../../../../../lib/employerAccounts";

const MAX_BODY_BYTES = 4096;
const MAX_CAREERS_PAGE_URL_LENGTH = 2048;

type PreviewRequestPayload = {
  careersPageUrl?: unknown;
  offset?: unknown;
};

type PreviewRouteDependencies = {
  getAuthUserFromRequest: typeof getAuthUserFromRequest;
  getEmployerAccountContext: typeof getEmployerAccountContext;
  getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest;
  assertEmployerPermission: typeof assertEmployerPermission;
  previewJobImport: typeof previewJobImport;
};

const defaultDependencies: PreviewRouteDependencies = {
  getAuthUserFromRequest,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
  assertEmployerPermission,
  previewJobImport,
};

function permissionStatus(error: unknown) {
  return error instanceof Error && error.name === "EmployerPermissionError"
    ? 403
    : 500;
}

function validateBodySize(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return true;

  const parsedLength = Number.parseInt(contentLength, 10);
  return Number.isFinite(parsedLength) && parsedLength <= MAX_BODY_BYTES;
}

async function readPayload(request: Request) {
  if (!validateBodySize(request))
    return { error: "Request body is too large." as const };

  const payload = (await request
    .json()
    .catch(() => null)) as PreviewRequestPayload | null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Request body must be valid JSON." as const };
  }

  const careersPageUrl =
    typeof payload.careersPageUrl === "string"
      ? payload.careersPageUrl.trim()
      : "";
  if (!careersPageUrl) return { error: "careersPageUrl is required." as const };
  if (careersPageUrl.length > MAX_CAREERS_PAGE_URL_LENGTH) {
    return { error: "careersPageUrl is too long." as const };
  }

  const offset = payload.offset === undefined ? 0 : payload.offset;
  if (
    !Number.isSafeInteger(offset) ||
    (offset as number) < 0 ||
    (offset as number) % 20 !== 0 ||
    (offset as number) >= 10_000
  ) {
    return { error: "offset must be a valid job page offset." as const };
  }
  return { careersPageUrl, offset: offset as number };
}

export async function handleAtsPreviewPost(
  request: Request,
  dependencies: PreviewRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user)
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const selectedAccountId =
      dependencies.getSelectedEmployerAccountIdFromRequest(request);
    const context = await dependencies.getEmployerAccountContext(
      user,
      selectedAccountId,
    );
    if (!context.accountId)
      return NextResponse.json(
        { error: "Employer account not found." },
        { status: 403 },
      );
    dependencies.assertEmployerPermission(context, "canManageJobs");

    const payload = await readPayload(request);
    if ("error" in payload)
      return NextResponse.json({ error: payload.error }, { status: 400 });

    const result = await dependencies.previewJobImport(
      payload.careersPageUrl,
      payload.offset,
    );

    switch (result.status) {
      case "ready":
        return NextResponse.json({
          status: result.status,
          providerKey: result.providerKey,
          sourceUrl: result.sourceUrl,
          jobs: result.jobs,
          nextOffset: result.nextOffset,
          hasMore: result.hasMore,
        });
      case "discovery-failed":
      case "no-job-links":
      case "unsupported":
        return NextResponse.json({
          status: result.status,
          message: result.message,
        });
      case "retrieval-failed":
        return NextResponse.json({
          status: result.status,
          providerKey: result.providerKey,
          sourceUrl: result.sourceUrl,
          message: result.message,
        });
      default: {
        const exhaustiveResult: never = result;
        return exhaustiveResult;
      }
    }
  } catch (error) {
    console.error("Employer ATS import preview failed", { error });
    return NextResponse.json(
      { error: "Could not preview ATS job import." },
      { status: permissionStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  return handleAtsPreviewPost(request);
}

import { NextResponse } from "next/server";
import {
  importPreparedJobs,
  type JobReviewCorrection,
} from "../../../../../lib/ats/import/importPreparedJobs";
import {
  prepareJobImport,
  normalizeProviderKey,
  type SelectedImportJobKey,
} from "../../../../../lib/ats/import/prepareJobImport";
import type { AtsProviderKey } from "../../../../../lib/ats/types";
import { getAuthUserFromRequest } from "../../../../../lib/billing";
import {
  assertEmployerPermission,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
} from "../../../../../lib/employerAccounts";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CAREERS_PAGE_URL_LENGTH = 2_048;
const MAX_PROVIDER_KEY_LENGTH = 128;
const MAX_EXTERNAL_ID_LENGTH = 1_024;
const MAX_SELECTED_JOB_KEYS = 500;
const MAX_REVIEW_CORRECTIONS = 500;
const CORRECTION_LIMITS = {
  employerStoreId: 100,
  roleCategory: 100,
  employmentType: 100,
  description: 250_000,
} as const;

type AtsImportRouteDependencies = {
  getAuthUserFromRequest: typeof getAuthUserFromRequest;
  getEmployerAccountContext: typeof getEmployerAccountContext;
  getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest;
  assertEmployerPermission: typeof assertEmployerPermission;
  prepareJobImport: typeof prepareJobImport;
  importPreparedJobs: typeof importPreparedJobs;
};

const defaultDependencies: AtsImportRouteDependencies = {
  getAuthUserFromRequest,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
  assertEmployerPermission,
  prepareJobImport,
  importPreparedJobs,
};

function permissionStatus(error: unknown) {
  return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_BODY_BYTES) return null;
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

async function readPayload(request: Request) {
  const body = await readBoundedBody(request);
  if (body === null) return { error: "Request body is too large." as const };

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { error: "Request body must be valid JSON." as const };
  }
  if (!isRecord(payload)) return { error: "Request body must be a JSON object." as const };
  if (!hasOnlyKeys(payload, ["careersPageUrl", "selectedJobKeys", "reviewCorrections"])) {
    return { error: "Request body contains unexpected fields." as const };
  }

  const careersPageUrl = typeof payload.careersPageUrl === "string" ? payload.careersPageUrl.trim() : "";
  if (!careersPageUrl) return { error: "careersPageUrl is required." as const };
  if (careersPageUrl.length > MAX_CAREERS_PAGE_URL_LENGTH) return { error: "careersPageUrl is too long." as const };

  if (!Array.isArray(payload.selectedJobKeys)) return { error: "selectedJobKeys must be an array." as const };
  if (payload.selectedJobKeys.length < 1 || payload.selectedJobKeys.length > MAX_SELECTED_JOB_KEYS) {
    return { error: `selectedJobKeys must contain between 1 and ${MAX_SELECTED_JOB_KEYS} items.` as const };
  }
  const selectedJobKeys: SelectedImportJobKey[] = [];
  for (const value of payload.selectedJobKeys) {
    if (!isRecord(value)) return { error: "Each selected job key must be an object." as const };
    if (!hasOnlyKeys(value, ["providerKey", "externalId"])) {
      return { error: "Selected job keys may only contain providerKey and externalId." as const };
    }
    const providerKey = typeof value.providerKey === "string" ? value.providerKey.trim() : "";
    const externalId = typeof value.externalId === "string" ? value.externalId.trim() : "";
    if (!providerKey) return { error: "Each providerKey must be a non-empty string." as const };
    if (providerKey.length > MAX_PROVIDER_KEY_LENGTH) return { error: "providerKey is too long." as const };
    if (!externalId) return { error: "Each externalId must be a non-empty string." as const };
    if (externalId.length > MAX_EXTERNAL_ID_LENGTH) return { error: "externalId is too long." as const };
    selectedJobKeys.push({ providerKey: normalizeProviderKey(providerKey) as AtsProviderKey, externalId });
  }

  if (!Array.isArray(payload.reviewCorrections)) return { error: "reviewCorrections must be an array." as const };
  if (payload.reviewCorrections.length > MAX_REVIEW_CORRECTIONS) {
    return { error: `reviewCorrections may contain no more than ${MAX_REVIEW_CORRECTIONS} items.` as const };
  }
  const reviewCorrections: JobReviewCorrection[] = [];
  const allowedCorrectionFields = ["providerKey", "externalId", ...Object.keys(CORRECTION_LIMITS)];
  for (const value of payload.reviewCorrections) {
    if (!isRecord(value)) return { error: "Each review correction must be an object." as const };
    if (!hasOnlyKeys(value, allowedCorrectionFields)) {
      return { error: "Review corrections contain an unsupported field." as const };
    }
    const providerKey = typeof value.providerKey === "string" ? value.providerKey.trim() : "";
    const externalId = typeof value.externalId === "string" ? value.externalId.trim() : "";
    if (!providerKey || providerKey.length > MAX_PROVIDER_KEY_LENGTH ||
        !externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) {
      return { error: "Each review correction requires a valid providerKey and externalId." as const };
    }
    const correction: JobReviewCorrection = { providerKey: normalizeProviderKey(providerKey), externalId };
    for (const field of Object.keys(CORRECTION_LIMITS) as Array<keyof typeof CORRECTION_LIMITS>) {
      const fieldValue = value[field];
      if (fieldValue === undefined) continue;
      if (typeof fieldValue !== "string") return { error: `Correction ${field} must be a string.` as const };
      if (fieldValue.length > CORRECTION_LIMITS[field]) return { error: `Correction ${field} is too long.` as const };
      correction[field] = fieldValue;
    }
    reviewCorrections.push(correction);
  }
  return { careersPageUrl, selectedJobKeys, reviewCorrections };
}

export async function handleAtsImportPost(
  request: Request,
  dependencies: AtsImportRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const selectedAccountId = dependencies.getSelectedEmployerAccountIdFromRequest(request);
    const employerContext = await dependencies.getEmployerAccountContext(user, selectedAccountId);
    if (!employerContext.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(employerContext, "canManageJobs");

    const payload = await readPayload(request);
    if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 400 });

    const preparation = await dependencies.prepareJobImport({
      employerAccountId: employerContext.accountId,
      careersPageUrl: payload.careersPageUrl,
      selectedJobKeys: payload.selectedJobKeys,
    });
    if (preparation.status !== "prepared") {
      return NextResponse.json(preparation, { status: preparation.status === "invalid-request" ? 400 : 200 });
    }

    const result = await dependencies.importPreparedJobs({
      employerAccountId: employerContext.accountId,
      preparedJobs: preparation.items,
      reviewCorrections: payload.reviewCorrections,
    });
    return NextResponse.json({
      status: "completed",
      summary: {
        imported: result.Imported.length,
        updated: result.Updated.length,
        skipped: result.Skipped.length,
        failed: result.Failed.length,
      },
      ...result,
    });
  } catch (error) {
    console.error("Employer ATS job import failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "We couldn’t import your jobs right now. Please try again." },
      { status: permissionStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  return handleAtsImportPost(request);
}

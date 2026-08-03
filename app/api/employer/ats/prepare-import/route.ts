import { NextResponse } from "next/server";
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

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CAREERS_PAGE_URL_LENGTH = 2048;
const MAX_PROVIDER_KEY_LENGTH = 128;
const MAX_EXTERNAL_ID_LENGTH = 1024;
const MAX_SELECTED_JOB_KEYS = 500;

type PrepareImportRouteDependencies = {
  getAuthUserFromRequest: typeof getAuthUserFromRequest;
  getEmployerAccountContext: typeof getEmployerAccountContext;
  getSelectedEmployerAccountIdFromRequest: typeof getSelectedEmployerAccountIdFromRequest;
  assertEmployerPermission: typeof assertEmployerPermission;
  prepareJobImport: typeof prepareJobImport;
};

const defaultDependencies: PrepareImportRouteDependencies = {
  getAuthUserFromRequest,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
  assertEmployerPermission,
  prepareJobImport,
};

function permissionStatus(error: unknown) {
  return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > MAX_BODY_BYTES) return null;
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

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
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

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Request body must be a JSON object." as const };
  }
  const record = payload as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["careersPageUrl", "selectedJobKeys"])) {
    return { error: "Request body contains unexpected fields." as const };
  }

  const careersPageUrl = typeof record.careersPageUrl === "string" ? record.careersPageUrl.trim() : "";
  if (!careersPageUrl) return { error: "careersPageUrl is required." as const };
  if (careersPageUrl.length > MAX_CAREERS_PAGE_URL_LENGTH) {
    return { error: "careersPageUrl is too long." as const };
  }

  if (!Array.isArray(record.selectedJobKeys)) {
    return { error: "selectedJobKeys must be an array." as const };
  }
  if (record.selectedJobKeys.length < 1 || record.selectedJobKeys.length > MAX_SELECTED_JOB_KEYS) {
    return { error: `selectedJobKeys must contain between 1 and ${MAX_SELECTED_JOB_KEYS} items.` as const };
  }

  const selectedJobKeys: SelectedImportJobKey[] = [];
  for (const entry of record.selectedJobKeys) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: "Each selected job key must be an object." as const };
    }
    const selected = entry as Record<string, unknown>;
    if (!hasOnlyKeys(selected, ["providerKey", "externalId"])) {
      return { error: "Selected job keys may only contain providerKey and externalId." as const };
    }
    const providerKey = typeof selected.providerKey === "string" ? selected.providerKey.trim() : "";
    const externalId = typeof selected.externalId === "string" ? selected.externalId.trim() : "";
    if (!providerKey) return { error: "Each providerKey must be a non-empty string." as const };
    if (providerKey.length > MAX_PROVIDER_KEY_LENGTH) return { error: "providerKey is too long." as const };
    if (!externalId) return { error: "Each externalId must be a non-empty string." as const };
    if (externalId.length > MAX_EXTERNAL_ID_LENGTH) return { error: "externalId is too long." as const };
    selectedJobKeys.push({ providerKey: normalizeProviderKey(providerKey) as AtsProviderKey, externalId });
  }

  return { careersPageUrl, selectedJobKeys };
}

export async function handleAtsPrepareImportPost(
  request: Request,
  dependencies: PrepareImportRouteDependencies = defaultDependencies,
) {
  try {
    const user = await dependencies.getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const selectedAccountId = dependencies.getSelectedEmployerAccountIdFromRequest(request);
    const context = await dependencies.getEmployerAccountContext(user, selectedAccountId);
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    dependencies.assertEmployerPermission(context, "canManageJobs");

    const payload = await readPayload(request);
    if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 400 });

    const result = await dependencies.prepareJobImport({ ...payload, employerAccountId: context.accountId });
    return NextResponse.json(result, { status: result.status === "invalid-request" ? 400 : 200 });
  } catch (error) {
    console.error("Employer ATS import preparation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Could not prepare ATS job import." },
      { status: permissionStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  return handleAtsPrepareImportPost(request);
}

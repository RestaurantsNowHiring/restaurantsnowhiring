import "server-only";

import { decodeHTML } from "entities";

import type { AtsProvider, CareersPage, DetectionResult, ImportedJob } from "../../types";

const GREENHOUSE_HOSTNAMES = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
] as const;

const GREENHOUSE_JOB_BOARD_API_ORIGIN = "https://boards-api.greenhouse.io";
const GREENHOUSE_JOBS_TIMEOUT_MS = 10_000;
// 25 MiB keeps memory bounded while leaving room for thousands of jobs with full HTML descriptions.
export const MAX_GREENHOUSE_JOBS_RESPONSE_BYTES = 25 * 1024 * 1024;
const GREENHOUSE_BOARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

type GreenhouseJob = {
  id?: unknown;
  title?: unknown;
  updated_at?: unknown;
  location?: { name?: unknown } | null;
  absolute_url?: unknown;
  content?: unknown;
  departments?: unknown;
  metadata?: unknown;
};

type GreenhouseJobsResponse = {
  jobs?: unknown;
};

function isGreenhouseHostname(hostname: string): boolean {
  return GREENHOUSE_HOSTNAMES.some(
    (greenhouseHostname) =>
      hostname === greenhouseHostname || hostname.endsWith(`.${greenhouseHostname}`),
  );
}

function getValidGreenhouseSourceUrl(sourceUrl: string): URL | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (!isGreenhouseHostname(hostname)) {
    return null;
  }

  return url;
}

function deriveGreenhouseBoardToken(sourceUrl: string): string | null {
  const url = getValidGreenhouseSourceUrl(sourceUrl);

  if (!url) {
    return null;
  }

  const [boardToken] = url.pathname.split("/").filter(Boolean);

  if (!boardToken || !GREENHOUSE_BOARD_TOKEN_PATTERN.test(boardToken)) {
    return null;
  }

  return boardToken;
}

function buildGreenhouseJobsApiUrl(boardToken: string): string {
  const url = new URL(
    `/v1/boards/${encodeURIComponent(boardToken)}/jobs`,
    GREENHOUSE_JOB_BOARD_API_ORIGIN,
  );

  url.searchParams.set("content", "true");

  return url.toString();
}

function getContentLength(response: Response): number | null {
  const contentLengthHeader = response.headers.get("content-length");

  if (!contentLengthHeader) {
    return null;
  }

  const contentLength = Number(contentLengthHeader);

  return Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : null;
}

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = getContentLength(response);

  if (contentLength !== null && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Greenhouse jobs response was too large.");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new Error("Greenhouse jobs response was too large.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(body);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Greenhouse jobs request failed with status ${response.status}.`);
    }

    const responseText = await readBoundedResponseBody(response, MAX_GREENHOUSE_JOBS_RESPONSE_BYTES);

    return JSON.parse(responseText);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("Greenhouse jobs request timed out.");
    }

    if (error instanceof Error && error.message.startsWith("Greenhouse jobs request failed")) {
      throw error;
    }

    if (error instanceof Error && error.message === "Greenhouse jobs response was too large.") {
      throw error;
    }

    throw new Error("Greenhouse jobs request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getGreenhouseJobId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function getHttpUrl(value: unknown): string | undefined {
  const candidate = getNonEmptyString(value);

  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeDepartments(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const departmentNames = value
    .map((department) => (isRecord(department) ? getNonEmptyString(department.name) : undefined))
    .filter((departmentName): departmentName is string => Boolean(departmentName));

  return departmentNames.length > 0 ? departmentNames.join(" / ") : undefined;
}

function getEmploymentType(metadata: unknown): string | undefined {
  if (!Array.isArray(metadata)) {
    return undefined;
  }

  for (const item of metadata) {
    if (!isRecord(item)) {
      continue;
    }

    const name = getNonEmptyString(item.name)?.toLowerCase();
    const value = getNonEmptyString(item.value);

    if (value && (name === "employment type" || name === "job type")) {
      return value;
    }
  }

  return undefined;
}

function normalizeGreenhouseJob(job: GreenhouseJob): ImportedJob | null {
  const externalId = getGreenhouseJobId(job.id);
  const title = getNonEmptyString(job.title);
  const applyUrl = getHttpUrl(job.absolute_url);

  if (!externalId || !title || !applyUrl) {
    return null;
  }

  const location = isRecord(job.location) ? getNonEmptyString(job.location.name) : undefined;
  const content = getNonEmptyString(job.content);
  const descriptionHtml = content ? decodeHTML(content) : undefined;
  const department = normalizeDepartments(job.departments);
  const employmentType = getEmploymentType(job.metadata);
  const updatedAt = getNonEmptyString(job.updated_at);

  return {
    externalId,
    providerKey: "greenhouse",
    sourceUrl: applyUrl,
    title,
    ...(location ? { location } : {}),
    ...(descriptionHtml ? { descriptionHtml } : {}),
    applyUrl,
    ...(employmentType ? { employmentType } : {}),
    ...(department ? { department } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function parseGreenhouseJobsResponse(json: unknown): ImportedJob[] {
  if (!isRecord(json) || !Array.isArray((json as GreenhouseJobsResponse).jobs)) {
    throw new Error("Greenhouse jobs response was malformed.");
  }

  return (json as { jobs: unknown[] }).jobs.flatMap((job) => {
    if (!isRecord(job)) {
      return [];
    }

    const normalizedJob = normalizeGreenhouseJob(job);

    return normalizedJob ? [normalizedJob] : [];
  });
}

export const greenhouseProvider: AtsProvider = {
  key: "greenhouse",
  displayName: "Greenhouse",
  async detect(careersPage: CareersPage): Promise<DetectionResult> {
    const detectedAt = new Date().toISOString();
    const sourceUrl = getValidGreenhouseSourceUrl(careersPage.url);
    const hostname = sourceUrl?.hostname.toLowerCase().replace(/\.$/, "");

    if (hostname) {
      return {
        matched: true,
        providerKey: "greenhouse",
        confidence: "high",
        sourceUrl: careersPage.url,
        evidence: [`Matched Greenhouse hostname: ${hostname}`],
        detectedAt,
      };
    }

    return {
      matched: false,
      providerKey: null,
      confidence: null,
      sourceUrl: careersPage.url,
      evidence: [],
      detectedAt,
    };
  },
  async parseJobs(careersPage: CareersPage): Promise<ImportedJob[]> {
    const boardToken = deriveGreenhouseBoardToken(careersPage.url);

    if (!boardToken) {
      throw new Error("Careers page URL is not a recognized Greenhouse job board URL.");
    }

    const jobsApiUrl = buildGreenhouseJobsApiUrl(boardToken);
    const json = await fetchJsonWithTimeout(jobsApiUrl, GREENHOUSE_JOBS_TIMEOUT_MS);

    return parseGreenhouseJobsResponse(json);
  },
};

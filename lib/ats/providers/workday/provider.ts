import "server-only";

import type {
  AtsProvider,
  CareersPage,
  DetectionResult,
  ImportedJob,
} from "../../types";

export const WORKDAY_PAGE_SIZE = 20;
export const WORKDAY_DETAIL_CONCURRENCY = 4;
export const WORKDAY_MAX_JOBS = 5_000;
export const WORKDAY_MAX_TOTAL_DRIFT = 100;
export const WORKDAY_MAX_PAGES = Math.ceil(
  WORKDAY_MAX_JOBS / WORKDAY_PAGE_SIZE,
);
export const WORKDAY_REQUEST_TIMEOUT_MS = 10_000;
export const WORKDAY_PARSE_TIMEOUT_MS = 30_000;
export const WORKDAY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const WORKDAY_MAX_CUMULATIVE_BYTES = 40 * 1024 * 1024;
export const WORKDAY_MAX_REDIRECTS = 3;

const WORKDAY_CLUSTER_PATTERN = /^wd\d+$/;
const WORKDAY_SITE_PATTERN = /^[A-Za-z0-9_-]+$/;
const WORKDAY_LOCALE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

type WorkdaySource = {
  origin: string;
  tenant: string;
  site: string;
  locale?: string;
  hostname: string;
  publicBaseUrl: string;
};

export type WorkdayFailureCode =
  | "http_400"
  | "http_401"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_5xx"
  | "http_other"
  | "network_failure"
  | "malformed_json"
  | "request_timeout"
  | "non_json_response"
  | "response_too_large"
  | "cumulative_budget_exceeded"
  | "malformed_listing"
  | "reported_total_too_large"
  | "invalid_external_path"
  | "pagination_total_unstable"
  | "pagination_incomplete"
  | "pagination_non_progressing"
  | "pagination_limit_exceeded"
  | "detail_failed"
  | "overall_timeout"
  | "unknown_failure";

type WorkdayFailureStage = "listing" | "detail" | "normalization";

type FetchState = {
  receivedBytes: number;
  deadline: AbortSignal;
  stage: WorkdayFailureStage;
};

type RequestOptions = {
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
};

class WorkdayParserError extends Error {
  constructor(
    readonly failureCode: WorkdayFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkdayParserError";
  }
}

function workdayError(
  failureCode: WorkdayFailureCode,
  message: string,
): WorkdayParserError {
  return new WorkdayParserError(failureCode, message);
}

function classifyHttpFailureStatus(status: number): WorkdayFailureCode {
  if (status === 400) return "http_400";
  if (status === 401) return "http_401";
  if (status === 403) return "http_403";
  if (status === 404) return "http_404";
  if (status === 429) return "http_429";
  if (status >= 500 && status < 600) return "http_5xx";
  return "http_other";
}

function classifyWorkdayFailure(error: unknown): WorkdayFailureCode {
  return error instanceof WorkdayParserError
    ? error.failureCode
    : "unknown_failure";
}

function logWorkdayParsingFailure(
  stage: WorkdayFailureStage,
  error: unknown,
): void {
  const failureCode = classifyWorkdayFailure(error);
  console.error({
    provider: "workday",
    stage,
    failureCode:
      stage === "detail" && failureCode !== "overall_timeout"
        ? "detail_failed"
        : failureCode,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getHttpUrl(value: unknown): string | undefined {
  const candidate = getString(value);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    )
      return url.toString();
  } catch {}
  return undefined;
}

function isWorkdayHostname(hostname: string): boolean {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  const markerIndex = labels.findIndex(
    (label, index) => label === "myworkdayjobs" && index > 0,
  );
  return (
    markerIndex >= 2 && WORKDAY_CLUSTER_PATTERN.test(labels[markerIndex - 1])
  );
}

function parseWorkdayPath(
  pathname: string,
): { site: string; locale?: string; publicBasePath: string } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const hasLocale = WORKDAY_LOCALE_PATTERN.test(segments[0]);
  const site = hasLocale ? segments[1] : segments[0];
  if (!site || !WORKDAY_SITE_PATTERN.test(site)) return null;
  if (
    segments.length > (hasLocale ? 2 : 1) &&
    segments[hasLocale ? 2 : 1] !== "job"
  )
    return null;
  const publicBasePath = `/${hasLocale ? `${segments[0]}/` : ""}${site}`;
  return {
    site,
    ...(hasLocale ? { locale: segments[0] } : {}),
    publicBasePath,
  };
}

function getWorkdaySource(sourceUrl: string): WorkdaySource | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  )
    return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!isWorkdayHostname(hostname)) return null;
  const labels = hostname.split(".");
  const markerIndex = labels.findIndex((label) => label === "myworkdayjobs");
  const tenant = labels.slice(0, markerIndex - 1).join(".");
  const parsedPath = parseWorkdayPath(url.pathname);
  if (!tenant || !parsedPath) return null;
  return {
    origin: url.origin,
    tenant,
    site: parsedPath.site,
    ...(parsedPath.locale ? { locale: parsedPath.locale } : {}),
    hostname,
    publicBaseUrl: new URL(parsedPath.publicBasePath, url.origin)
      .toString()
      .replace(/\/$/, ""),
  };
}

function buildWorkdaySearchApiUrl(source: WorkdaySource): string {
  return new URL(
    `/wday/cxs/${encodeURIComponent(source.tenant)}/${encodeURIComponent(source.site)}/jobs`,
    source.origin,
  ).toString();
}

function buildWorkdayDetailApiUrl(
  source: WorkdaySource,
  externalPath: string,
): string {
  return new URL(
    `/wday/cxs/${encodeURIComponent(source.tenant)}/${encodeURIComponent(source.site)}${externalPath}`,
    source.origin,
  ).toString();
}

function normalizeExternalPath(value: unknown): string | null {
  const candidate = getString(value);
  if (
    !candidate ||
    !candidate.startsWith("/job/") ||
    candidate.startsWith("//")
  )
    return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) return null;
  const segments = candidate.split("/").filter(Boolean);
  if (segments.length < 3 || segments[0] !== "job") return null;
  try {
    for (const segment of segments) {
      const decoded = decodeURIComponent(segment);
      if (
        !decoded ||
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/")
      )
        return null;
    }
  } catch {
    return null;
  }
  return `/${segments.join("/")}`;
}

function buildPublicApplyUrl(
  source: WorkdaySource,
  externalPath: string,
  explicitUrl: unknown,
): string | undefined {
  const explicit = getHttpUrl(explicitUrl);
  if (explicit) {
    const url = new URL(explicit);
    if (url.hostname.toLowerCase().replace(/\.$/, "") === source.hostname)
      return url.toString();
  }
  return new URL(`${source.publicBaseUrl}${externalPath}`).toString();
}

function createOverallDeadline(): AbortController {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WORKDAY_PARSE_TIMEOUT_MS,
  );
  timeout.unref?.();
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
    once: true,
  });
  return controller;
}

function getContentLength(response: Response): number | null {
  const header = response.headers.get("content-length");
  if (!header) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function readBoundedResponseBody(
  response: Response,
  state: FetchState,
): Promise<string> {
  const contentLength = getContentLength(response);
  if (contentLength !== null) {
    if (contentLength > WORKDAY_MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw workdayError(
        "response_too_large",
        "Workday jobs response was too large.",
      );
    }
    if (state.receivedBytes + contentLength > WORKDAY_MAX_CUMULATIVE_BYTES) {
      await response.body?.cancel();
      throw workdayError(
        "cumulative_budget_exceeded",
        "Workday jobs cumulative response budget was exceeded.",
      );
    }
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      if (state.deadline.aborted)
        throw workdayError(
          state.stage === "listing" && state.deadline.aborted
            ? "overall_timeout"
            : "request_timeout",
          "Workday jobs request timed out.",
        );
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      state.receivedBytes += value.byteLength;
      if (receivedBytes > WORKDAY_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw workdayError(
          "response_too_large",
          "Workday jobs response was too large.",
        );
      }
      if (state.receivedBytes > WORKDAY_MAX_CUMULATIVE_BYTES) {
        await reader.cancel();
        throw workdayError(
          "cumulative_budget_exceeded",
          "Workday jobs cumulative response budget was exceeded.",
        );
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

function validateJsonContentType(response: Response): void {
  const contentType = response.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("json"))
    throw workdayError(
      "non_json_response",
      "Workday jobs response was not JSON.",
    );
}

async function fetchJsonWithSafety(
  url: string,
  options: RequestOptions,
  source: WorkdaySource,
  state: FetchState,
  redirects = 0,
): Promise<unknown> {
  if (state.deadline.aborted)
    throw workdayError(
      state.stage === "listing" && state.deadline.aborted
        ? "overall_timeout"
        : "request_timeout",
      "Workday jobs request timed out.",
    );
  const requestController = new AbortController();
  const timeout = setTimeout(
    () => requestController.abort(),
    WORKDAY_REQUEST_TIMEOUT_MS,
  );
  timeout.unref?.();
  const abortRequest = () => requestController.abort();
  state.deadline.addEventListener("abort", abortRequest, { once: true });
  try {
    const response = await fetch(url, {
      method: options.method,
      body: options.body,
      headers: { accept: "application/json", ...(options.headers ?? {}) },
      redirect: "manual",
      signal: requestController.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      if (redirects >= WORKDAY_MAX_REDIRECTS)
        throw workdayError(
          "http_other",
          "Workday jobs request redirected too many times.",
        );
      const location = response.headers.get("location");
      if (!location)
        throw workdayError(
          "http_other",
          "Workday jobs request redirected without a location.",
        );
      let redirected: URL;
      try {
        redirected = new URL(location, url);
      } catch {
        throw workdayError(
          "http_other",
          "Workday jobs request redirected to an unsupported host.",
        );
      }
      if (
        (redirected.protocol !== "http:" && redirected.protocol !== "https:") ||
        redirected.username ||
        redirected.password ||
        redirected.hostname.toLowerCase().replace(/\.$/, "") !== source.hostname
      )
        throw workdayError(
          "http_other",
          "Workday jobs request redirected to an unsupported host.",
        );
      return fetchJsonWithSafety(
        redirected.toString(),
        options,
        source,
        state,
        redirects + 1,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw workdayError(
        classifyHttpFailureStatus(response.status),
        "Workday jobs request failed.",
      );
    }
    validateJsonContentType(response);
    const text = await readBoundedResponseBody(response, state);
    try {
      return JSON.parse(text);
    } catch {
      throw workdayError(
        "malformed_json",
        "Workday jobs response JSON was malformed.",
      );
    }
  } catch (error) {
    if (
      state.deadline.aborted ||
      requestController.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw workdayError(
        state.stage === "listing" && state.deadline.aborted
          ? "overall_timeout"
          : "request_timeout",
        "Workday jobs request timed out.",
      );
    if (error instanceof WorkdayParserError) throw error;
    throw workdayError("network_failure", "Workday jobs request failed.");
  } finally {
    clearTimeout(timeout);
    state.deadline.removeEventListener("abort", abortRequest);
  }
}

function getJobPostings(json: unknown): {
  jobs: Record<string, unknown>[];
  total?: number;
} {
  if (!isRecord(json) || !Array.isArray(json.jobPostings))
    throw workdayError(
      "malformed_listing",
      "Workday jobs response was malformed.",
    );
  const total = getNumber(json.total);
  if (total !== undefined && (!Number.isInteger(total) || total < 0))
    throw workdayError(
      "malformed_listing",
      "Workday jobs response was malformed.",
    );
  return { jobs: json.jobPostings.filter(isRecord), total };
}

function getListingIdentity(job: Record<string, unknown>): string | null {
  const externalPathValue = getString(job.externalPath);
  if (externalPathValue && !normalizeExternalPath(externalPathValue))
    throw workdayError(
      "invalid_external_path",
      "Workday job listing contained an invalid external path.",
    );
  return getString(job.jobReqId) ?? normalizeExternalPath(externalPathValue);
}

async function fetchSearchPage(
  source: WorkdaySource,
  offset: number,
  state: FetchState,
): Promise<{ jobs: Record<string, unknown>[]; total?: number }> {
  const json = await fetchJsonWithSafety(
    buildWorkdaySearchApiUrl(source),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appliedFacets: {},
        limit: WORKDAY_PAGE_SIZE,
        offset,
        searchText: "",
      }),
    },
    source,
    state,
  );
  return getJobPostings(json);
}

async function fetchJobDetail(
  source: WorkdaySource,
  externalPath: string,
  state: FetchState,
): Promise<Record<string, unknown>> {
  const json = await fetchJsonWithSafety(
    buildWorkdayDetailApiUrl(source, externalPath),
    { method: "GET" },
    source,
    state,
  );
  if (!isRecord(json))
    throw workdayError(
      "detail_failed",
      "Workday job detail response was malformed.",
    );
  const info = json.jobPostingInfo;
  return isRecord(info) ? info : json;
}

function getFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = getString(value);
    if (text) return text;
  }
  return undefined;
}

function normalizeWorkdayJob(
  source: WorkdaySource,
  summary: Record<string, unknown>,
  detail: Record<string, unknown>,
): ImportedJob | null {
  const externalPath = normalizeExternalPath(
    summary.externalPath ?? detail.externalPath,
  );
  if (!externalPath) return null;
  const externalId = getFirstString(
    detail.jobReqId,
    summary.jobReqId,
    externalPath.split("_").at(-1),
  );
  const title = getFirstString(detail.title, summary.title);
  const applyUrl = buildPublicApplyUrl(
    source,
    externalPath,
    detail.externalUrl ??
      detail.applyUrl ??
      summary.externalUrl ??
      summary.applyUrl,
  );
  if (!externalId || !title || !applyUrl) return null;
  const descriptionHtml = getFirstString(
    detail.jobDescription,
    summary.jobDescription,
  );
  const location = getFirstString(
    detail.location,
    detail.locationText,
    summary.locationsText,
    summary.location,
  );
  const department = getFirstString(
    detail.jobFamily,
    summary.jobFamily,
    detail.supervisoryOrganization,
    summary.supervisoryOrganization,
  );
  const employmentType = getFirstString(
    detail.timeType,
    summary.timeType,
    detail.workerSubType,
    summary.workerSubType,
  );
  const updatedAt = getFirstString(
    detail.updatedOn,
    detail.updatedAt,
    detail.postedOn,
    summary.updatedOn,
    summary.updatedAt,
    summary.postedOn,
  );
  return {
    externalId,
    providerKey: "workday",
    sourceUrl: applyUrl,
    title,
    ...(location ? { location } : {}),
    ...(department ? { department } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(descriptionHtml ? { descriptionHtml } : {}),
    applyUrl,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }),
  );
  return results;
}

async function fetchCompleteListings(
  source: WorkdaySource,
  state: FetchState,
): Promise<Record<string, unknown>[]> {
  const seen = new Set<string>();
  const listings: Record<string, unknown>[] = [];
  let firstReportedTotal: number | undefined;
  let minimumReportedTotal: number | undefined;
  let maximumReportedTotal: number | undefined;
  let latestReportedTotal: number | undefined;
  let rawRowsRetrieved = 0;
  for (
    let page = 0, offset = 0;
    page < WORKDAY_MAX_PAGES;
    page += 1, offset += WORKDAY_PAGE_SIZE
  ) {
    const { jobs, total } = await fetchSearchPage(source, offset, state);
    if (total !== undefined) {
      if (total > WORKDAY_MAX_JOBS)
        throw workdayError(
          "reported_total_too_large",
          "Workday jobs total exceeds the safe import limit.",
        );
      firstReportedTotal ??= total;
      minimumReportedTotal = Math.min(minimumReportedTotal ?? total, total);
      maximumReportedTotal = Math.max(maximumReportedTotal ?? total, total);
      latestReportedTotal = total;
      if (maximumReportedTotal - minimumReportedTotal > WORKDAY_MAX_TOTAL_DRIFT)
        throw workdayError(
          "pagination_total_unstable",
          "Workday jobs pagination total changed beyond the safe drift limit.",
        );
    }
    if (
      latestReportedTotal !== undefined &&
      offset >= latestReportedTotal &&
      jobs.length > 0
    )
      throw workdayError(
        "pagination_non_progressing",
        "Workday jobs pagination did not progress consistently.",
      );
    rawRowsRetrieved += jobs.length;
    for (const job of jobs) {
      const identity = getListingIdentity(job);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      listings.push(job);
      if (listings.length > WORKDAY_MAX_JOBS)
        throw workdayError(
          "reported_total_too_large",
          "Workday jobs total exceeds the safe import limit.",
        );
    }
    if (jobs.length < WORKDAY_PAGE_SIZE) {
      void firstReportedTotal;
      if (
        latestReportedTotal !== undefined &&
        latestReportedTotal > rawRowsRetrieved &&
        (rawRowsRetrieved === 0 ||
          latestReportedTotal - rawRowsRetrieved > WORKDAY_MAX_TOTAL_DRIFT)
      )
        throw workdayError(
          "pagination_incomplete",
          "Workday jobs listing ended before the reported total was retrieved.",
        );
      return listings;
    }
  }
  throw workdayError(
    "pagination_limit_exceeded",
    "Workday jobs pagination exceeded the safe page limit.",
  );
}

export const workdayProvider: AtsProvider = {
  key: "workday",
  displayName: "Workday",
  async detect(careersPage: CareersPage): Promise<DetectionResult> {
    const detectedAt = new Date().toISOString();
    const source = getWorkdaySource(careersPage.url);
    if (source)
      return {
        matched: true,
        providerKey: "workday",
        confidence: "high",
        sourceUrl: careersPage.url,
        evidence: [
          `Matched Workday jobs host and wd cluster: ${source.hostname}`,
        ],
        detectedAt,
      };
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
    const source = getWorkdaySource(careersPage.url);
    if (!source)
      throw new Error(
        "Careers page URL is not a recognized Workday careers URL.",
      );
    const deadline = createOverallDeadline();
    const state: FetchState = {
      receivedBytes: 0,
      deadline: deadline.signal,
      stage: "listing",
    };
    try {
      const listings = await fetchCompleteListings(source, state);
      state.stage = "detail";
      const jobs = await mapWithConcurrency(
        listings,
        WORKDAY_DETAIL_CONCURRENCY,
        async (summary) => {
          const externalPath = normalizeExternalPath(summary.externalPath);
          if (!externalPath)
            throw workdayError(
              "invalid_external_path",
              "Workday job listing contained an invalid external path.",
            );
          const detail = await fetchJobDetail(source, externalPath, state);
          state.stage = "normalization";
          return normalizeWorkdayJob(source, summary, detail);
        },
      );
      return jobs.filter((job): job is ImportedJob => Boolean(job));
    } catch (error) {
      logWorkdayParsingFailure(state.stage, error);
      throw error;
    } finally {
      deadline.abort();
    }
  },
};

import "server-only";

import type {
  AtsProvider,
  CareersPage,
  DetectionResult,
  HydratedJobResult,
  ImportedJob,
} from "../../types";

export const WORKDAY_PAGE_SIZE = 20;
export const WORKDAY_DETAIL_CONCURRENCY = 4;
export const WORKDAY_LISTING_CONCURRENCY = 8;
export const WORKDAY_LISTING_MAX_ATTEMPTS = 3;
export const WORKDAY_MAX_JOBS = 5_000;
export const WORKDAY_MAX_TOTAL_DRIFT = 100;
export const WORKDAY_MAX_PAGES = Math.ceil(
  WORKDAY_MAX_JOBS / WORKDAY_PAGE_SIZE,
);
export const WORKDAY_REQUEST_TIMEOUT_MS = 10_000;
// Maximum budget for retrieving and validating a complete Workday listing
// board, including bounded retries.
export const WORKDAY_LISTING_TIMEOUT_MS = 90_000;
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
  | "pagination_sparse"
  | "pagination_non_progressing"
  | "pagination_limit_exceeded"
  | "listing_page_failed"
  | "listing_plan_incomplete"
  | "listing_offset_gap"
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

type WorkdayPaginationTotalDiagnostic = {
  firstReportedTotal: number;
  minimumReportedTotal: number;
  maximumReportedTotal: number;
  latestReportedTotal: number;
  pagesRequested: number;
  rawRowsRetrieved: number;
};

type WorkdayListingTimingDiagnostic = {
  firstPageDurationMs: number;
  pageSchedulingDurationMs: number;
  pageFetchDurationMs: number;
  cumulativeRequestDurationMs: number;
  validationDurationMs: number;
  idleGapDurationMs: number;
  totalListingDurationMs: number;
  numberOfPages: number;
  numberOfListingRequests: number;
  maximumConcurrentRequestsObserved: number;
  averageConcurrentRequests: number;
  underfilledDurationMs: number;
  fullUtilizationDurationMs: number;
  singleRequestDurationMs: number;
  initialPlannedPageCount: number;
  dynamicallyPlannedPageCount: number;
  authoritativeTotalExtensionCount: number;
  sentinelExtensionCount: number;
  stableDrainCycleCount: number;
  numberOfRetryAttempts: number;
  numberOfRetriedRequests: number;
};

export class WorkdayListingUtilizationTracker {
  private startedAt: number | undefined;
  private lastChangedAt: number | undefined;
  private active = 0;
  private activeRequestMilliseconds = 0;
  private underfilledMilliseconds = 0;
  private fullMilliseconds = 0;
  private singleMilliseconds = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(active: number): void {
    const now = this.now();
    this.startedAt = now;
    this.lastChangedAt = now;
    this.active = active;
  }

  setActive(active: number): void {
    if (this.lastChangedAt === undefined) return;
    this.record(this.now());
    this.active = active;
  }

  snapshot() {
    const now = this.now();
    this.record(now);
    const elapsed = Math.max(0, now - (this.startedAt ?? now));
    return {
      averageConcurrentRequests:
        elapsed === 0 ? 0 : this.activeRequestMilliseconds / elapsed,
      underfilledDurationMs: this.underfilledMilliseconds,
      fullUtilizationDurationMs: this.fullMilliseconds,
      singleRequestDurationMs: this.singleMilliseconds,
    };
  }

  private record(now: number): void {
    if (this.lastChangedAt === undefined) return;
    const duration = Math.max(0, now - this.lastChangedAt);
    this.activeRequestMilliseconds += duration * this.active;
    if (this.active > 0 && this.active < WORKDAY_LISTING_CONCURRENCY)
      this.underfilledMilliseconds += duration;
    if (this.active === WORKDAY_LISTING_CONCURRENCY)
      this.fullMilliseconds += duration;
    if (this.active === 1) this.singleMilliseconds += duration;
    this.lastChangedAt = now;
  }
}

class WorkdayParserError extends Error {
  constructor(
    readonly failureCode: WorkdayFailureCode,
    message: string,
    readonly paginationTotalDiagnostic?: WorkdayPaginationTotalDiagnostic,
    public listingTimingDiagnostic?: WorkdayListingTimingDiagnostic,
  ) {
    super(message);
    this.name = "WorkdayParserError";
  }
}

function workdayError(
  failureCode: WorkdayFailureCode,
  message: string,
  paginationTotalDiagnostic?: WorkdayPaginationTotalDiagnostic,
): WorkdayParserError {
  return new WorkdayParserError(
    failureCode,
    message,
    paginationTotalDiagnostic,
  );
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

function isRetryableListingFailure(error: unknown): boolean {
  const failureCode = classifyWorkdayFailure(error);
  return (
    failureCode === "request_timeout" ||
    failureCode === "network_failure" ||
    failureCode === "http_429" ||
    failureCode === "http_5xx"
  );
}

function waitForListingRetry(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted)
    return Promise.reject(
      workdayError("overall_timeout", "Workday jobs listing timed out."),
    );
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(
        workdayError("overall_timeout", "Workday jobs listing timed out."),
      );
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function logWorkdayParsingFailure(
  stage: WorkdayFailureStage,
  error: unknown,
): void {
  const failureCode = classifyWorkdayFailure(error);
  const loggedFailureCode =
    stage === "detail" && failureCode !== "overall_timeout"
      ? "detail_failed"
      : failureCode;
  if (
    stage === "listing" &&
    loggedFailureCode === "pagination_total_unstable" &&
    error instanceof WorkdayParserError &&
    error.paginationTotalDiagnostic
  ) {
    console.error({
      provider: "workday",
      stage,
      failureCode: loggedFailureCode,
      ...error.paginationTotalDiagnostic,
    });
    return;
  }
  if (
    stage === "listing" &&
    loggedFailureCode === "overall_timeout" &&
    error instanceof WorkdayParserError &&
    error.listingTimingDiagnostic
  ) {
    console.error({
      provider: "workday",
      stage,
      failureCode: loggedFailureCode,
      ...error.listingTimingDiagnostic,
    });
    return;
  }
  console.error({
    provider: "workday",
    stage,
    failureCode: loggedFailureCode,
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

function createOverallDeadline(
  timeoutMs = WORKDAY_PARSE_TIMEOUT_MS,
): AbortController {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  detail: Record<string, unknown> = {},
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

type WorkdayListingPage = {
  offset: number;
  jobs: Record<string, unknown>[];
  total?: number;
};

function getAuthoritativeTotal(
  offset: number,
  jobs: Record<string, unknown>[],
  total: number | undefined,
): number | undefined {
  return total === 0 && (offset > 0 || jobs.length > 0) ? undefined : total;
}

function getLastDataOffset(total: number): number {
  return (
    Math.floor(Math.max(total - 1, 0) / WORKDAY_PAGE_SIZE) * WORKDAY_PAGE_SIZE
  );
}

function addPlannedOffsets(plan: Set<number>, highestTotal: number): void {
  const lastDataOffset = getLastDataOffset(highestTotal);
  const sentinelOffset = lastDataOffset + WORKDAY_PAGE_SIZE;
  if (sentinelOffset / WORKDAY_PAGE_SIZE >= WORKDAY_MAX_PAGES)
    throw workdayError(
      "pagination_limit_exceeded",
      "Workday jobs pagination exceeded the safe page limit.",
    );
  for (
    let offset = WORKDAY_PAGE_SIZE;
    offset <= sentinelOffset;
    offset += WORKDAY_PAGE_SIZE
  )
    plan.add(offset);
}

function buildTotalDiagnostic(
  totals: {
    firstReportedTotal: number | undefined;
    minimumReportedTotal: number | undefined;
    maximumReportedTotal: number | undefined;
    latestReportedTotal: number | undefined;
  },
  pagesRequested: number,
  rawRowsRetrieved: number,
): WorkdayPaginationTotalDiagnostic | undefined {
  if (
    totals.firstReportedTotal === undefined ||
    totals.minimumReportedTotal === undefined ||
    totals.maximumReportedTotal === undefined ||
    totals.latestReportedTotal === undefined
  )
    return undefined;
  return {
    firstReportedTotal: totals.firstReportedTotal,
    minimumReportedTotal: totals.minimumReportedTotal,
    maximumReportedTotal: totals.maximumReportedTotal,
    latestReportedTotal: totals.latestReportedTotal,
    pagesRequested,
    rawRowsRetrieved,
  };
}

async function fetchCompleteListings(
  source: WorkdaySource,
  state: FetchState,
): Promise<Record<string, unknown>[]> {
  const listingStartedAt = performance.now();
  let firstPageDurationMs = 0;
  let pageSchedulingDurationMs = 0;
  let pageFetchDurationMs = 0;
  let cumulativeRequestDurationMs = 0;
  let validationDurationMs = 0;
  let numberOfListingRequests = 0;
  let activeRequests = 0;
  let maximumConcurrentRequestsObserved = 0;
  let idleStartedAt: number | undefined;
  let idleGapDurationMs = 0;
  const utilization = new WorkdayListingUtilizationTracker();
  let utilizationStarted = false;
  let initialPlannedPageCount = 0;
  let dynamicallyPlannedPageCount = 0;
  let authoritativeTotalExtensionCount = 0;
  let sentinelExtensionCount = 0;
  let stableDrainCycleCount = 0;
  let numberOfRetryAttempts = 0;
  const retriedOffsets = new Set<number>();
  type OffsetState =
    | { status: "planned" }
    | { status: "in_flight" }
    | { status: "completed"; page: WorkdayListingPage }
    | { status: "failed"; error: unknown };
  type ActiveRequest = {
    offset: number;
    promise: Promise<{
      offset: number;
      page?: { jobs: Record<string, unknown>[]; total?: number };
      error?: unknown;
    }>;
  };

  const listingController = new AbortController();
  const abortListing = () => listingController.abort();
  state.deadline.addEventListener("abort", abortListing, { once: true });
  const listingState: FetchState = {
    receivedBytes: state.receivedBytes,
    deadline: listingController.signal,
    stage: state.stage,
  };
  const offsets = new Map<number, OffsetState>();
  const active = new Map<number, ActiveRequest>();
  const totals = {
    firstReportedTotal: undefined as number | undefined,
    minimumReportedTotal: undefined as number | undefined,
    maximumReportedTotal: undefined as number | undefined,
    latestReportedTotal: undefined as number | undefined,
  };
  let rawRowsObserved = 0;
  let planVersion = 0;

  const finishIdleGap = (now: number): void => {
    if (idleStartedAt === undefined) return;
    idleGapDurationMs += now - idleStartedAt;
    idleStartedAt = undefined;
  };
  const buildTimingDiagnostic = (): WorkdayListingTimingDiagnostic => {
    const now = performance.now();
    finishIdleGap(now);
    const utilizationDiagnostic = utilization.snapshot();
    return {
      firstPageDurationMs: Math.round(firstPageDurationMs),
      pageSchedulingDurationMs: Math.round(pageSchedulingDurationMs),
      pageFetchDurationMs: Math.round(pageFetchDurationMs),
      cumulativeRequestDurationMs: Math.round(cumulativeRequestDurationMs),
      validationDurationMs: Math.round(validationDurationMs),
      idleGapDurationMs: Math.round(idleGapDurationMs),
      totalListingDurationMs: Math.round(now - listingStartedAt),
      // Pages are unique offsets that completed successfully; requests are all
      // HTTP attempts, including transient retries.
      numberOfPages: [...offsets.values()].filter(
        (entry) => entry.status === "completed",
      ).length,
      numberOfListingRequests,
      maximumConcurrentRequestsObserved,
      averageConcurrentRequests:
        Math.round(utilizationDiagnostic.averageConcurrentRequests * 100) / 100,
      underfilledDurationMs: Math.round(
        utilizationDiagnostic.underfilledDurationMs,
      ),
      fullUtilizationDurationMs: Math.round(
        utilizationDiagnostic.fullUtilizationDurationMs,
      ),
      singleRequestDurationMs: Math.round(
        utilizationDiagnostic.singleRequestDurationMs,
      ),
      initialPlannedPageCount,
      dynamicallyPlannedPageCount,
      authoritativeTotalExtensionCount,
      sentinelExtensionCount,
      stableDrainCycleCount,
      numberOfRetryAttempts,
      numberOfRetriedRequests: retriedOffsets.size,
    };
  };

  const planOffset = (offset: number): boolean => {
    if (offsets.has(offset)) return false;
    offsets.set(offset, { status: "planned" });
    planVersion += 1;
    if (initialPlannedPageCount > 0) dynamicallyPlannedPageCount += 1;
    return true;
  };
  const planThroughTotal = (highestTotal: number): void => {
    const planned = new Set(offsets.keys());
    addPlannedOffsets(planned, highestTotal);
    for (const offset of [...planned].sort((a, b) => a - b)) planOffset(offset);
  };
  const observeTotal = (
    offset: number,
    jobs: Record<string, unknown>[],
    total: number | undefined,
  ): void => {
    const authoritativeTotal = getAuthoritativeTotal(offset, jobs, total);
    if (authoritativeTotal === undefined) return;
    if (authoritativeTotal > WORKDAY_MAX_JOBS)
      throw workdayError(
        "reported_total_too_large",
        "Workday jobs total exceeds the safe import limit.",
      );
    totals.firstReportedTotal ??= authoritativeTotal;
    totals.minimumReportedTotal = Math.min(
      totals.minimumReportedTotal ?? authoritativeTotal,
      authoritativeTotal,
    );
    const previousMaximum = totals.maximumReportedTotal;
    totals.maximumReportedTotal = Math.max(
      totals.maximumReportedTotal ?? authoritativeTotal,
      authoritativeTotal,
    );
    totals.latestReportedTotal = authoritativeTotal;
    if (
      (totals.maximumReportedTotal ?? 0) - (totals.minimumReportedTotal ?? 0) >
      WORKDAY_MAX_TOTAL_DRIFT
    )
      throw workdayError(
        "pagination_total_unstable",
        "Workday jobs pagination total changed beyond the safe drift limit.",
        buildTotalDiagnostic(totals, offsets.size, rawRowsObserved),
      );
    const sizeBeforePlanning = offsets.size;
    planThroughTotal(totals.maximumReportedTotal);
    if (
      previousMaximum !== undefined &&
      authoritativeTotal > previousMaximum &&
      offsets.size > sizeBeforePlanning
    )
      authoritativeTotalExtensionCount += 1;
  };

  const completePage = (
    offset: number,
    page: { jobs: Record<string, unknown>[]; total?: number },
  ): void => {
    const validationStartedAt = performance.now();
    const completedPage = { offset, jobs: page.jobs, total: page.total };
    offsets.set(offset, { status: "completed", page: completedPage });
    rawRowsObserved += page.jobs.length;
    const emptyFirstPage =
      offset === 0 &&
      getAuthoritativeTotal(offset, page.jobs, page.total) === 0 &&
      page.jobs.length === 0;
    if (!emptyFirstPage) observeTotal(offset, page.jobs, page.total);
    const highestObservedRequiredOffset =
      totals.maximumReportedTotal === undefined
        ? undefined
        : getLastDataOffset(totals.maximumReportedTotal);
    const rowBearingSentinel =
      highestObservedRequiredOffset !== undefined &&
      offset > highestObservedRequiredOffset &&
      page.jobs.length > 0;
    if (
      (totals.firstReportedTotal === undefined || rowBearingSentinel) &&
      page.jobs.length === WORKDAY_PAGE_SIZE
    ) {
      const following = offset + WORKDAY_PAGE_SIZE;
      if (following / WORKDAY_PAGE_SIZE >= WORKDAY_MAX_PAGES)
        throw workdayError(
          "pagination_limit_exceeded",
          "Workday jobs pagination exceeded the safe page limit.",
        );
      if (planOffset(following)) sentinelExtensionCount += 1;
    }
    validationDurationMs += performance.now() - validationStartedAt;
  };

  const requestOffset = async (offset: number) => {
    const requestStartedAt = performance.now();
    finishIdleGap(requestStartedAt);
    numberOfListingRequests += 1;
    activeRequests += 1;
    if (utilizationStarted) utilization.setActive(activeRequests);
    maximumConcurrentRequestsObserved = Math.max(
      maximumConcurrentRequestsObserved,
      activeRequests,
    );
    try {
      return await fetchSearchPage(source, offset, listingState);
    } finally {
      const requestFinishedAt = performance.now();
      cumulativeRequestDurationMs += requestFinishedAt - requestStartedAt;
      activeRequests -= 1;
      if (utilizationStarted) utilization.setActive(activeRequests);
      if (activeRequests === 0) idleStartedAt = requestFinishedAt;
    }
  };

  const requestOffsetWithRetry = async (offset: number) => {
    const retryDelaysMs = [250, 600] as const;
    for (
      let attempt = 1;
      attempt <= WORKDAY_LISTING_MAX_ATTEMPTS;
      attempt += 1
    ) {
      if (attempt > 1) {
        numberOfRetryAttempts += 1;
        retriedOffsets.add(offset);
      }
      if (listingController.signal.aborted)
        throw workdayError(
          "overall_timeout",
          "Workday jobs listing timed out.",
        );
      try {
        return await requestOffset(offset);
      } catch (error) {
        if (
          attempt === WORKDAY_LISTING_MAX_ATTEMPTS ||
          !isRetryableListingFailure(error) ||
          listingController.signal.aborted
        )
          throw error;
        await waitForListingRetry(
          retryDelaysMs[attempt - 1],
          listingController.signal,
        );
      }
    }
    throw workdayError("unknown_failure", "Workday jobs request failed.");
  };

  planOffset(0);
  try {
    offsets.set(0, { status: "in_flight" });
    const firstFetchStartedAt = performance.now();
    try {
      completePage(0, await requestOffsetWithRetry(0));
    } catch (error) {
      offsets.set(0, { status: "failed", error });
      throw error;
    } finally {
      const firstFetchFinishedAt = performance.now();
      firstPageDurationMs = firstFetchFinishedAt - firstFetchStartedAt;
      pageFetchDurationMs += firstPageDurationMs;
    }

    initialPlannedPageCount = offsets.size;
    dynamicallyPlannedPageCount = 0;
    utilizationStarted = true;
    utilization.start(activeRequests);

    const claimPlannedOffset = (): number | undefined => {
      const schedulingStartedAt = performance.now();
      const offset = [...offsets.entries()]
        .filter(([, entry]) => entry.status === "planned")
        .map(([candidate]) => candidate)
        .sort((a, b) => a - b)[0];
      if (offset !== undefined) offsets.set(offset, { status: "in_flight" });
      pageSchedulingDurationMs += performance.now() - schedulingStartedAt;
      return offset;
    };
    const replenish = (): void => {
      while (
        !listingController.signal.aborted &&
        active.size < WORKDAY_LISTING_CONCURRENCY
      ) {
        const offset = claimPlannedOffset();
        if (offset === undefined) return;
        const promise = requestOffsetWithRetry(offset).then(
          (page) => ({ offset, page }),
          (error: unknown) => ({ offset, error }),
        );
        active.set(offset, { offset, promise });
      }
    };

    let stableVersion: number | undefined;
    const poolFetchStartedAt = performance.now();
    try {
      while (!listingController.signal.aborted) {
        replenish();
        if (active.size === 0) {
          stableDrainCycleCount += 1;
          if (stableVersion === planVersion) break;
          stableVersion = planVersion;
          continue;
        }
        stableVersion = undefined;
        const result = await Promise.race(
          [...active.values()].map(({ promise }) => promise),
        );
        active.delete(result.offset);
        if (result.error !== undefined) {
          offsets.set(result.offset, { status: "failed", error: result.error });
          listingController.abort();
          await Promise.allSettled(
            [...active.values()].map(({ promise }) => promise),
          );
          for (const { offset } of active.values())
            if (offsets.get(offset)?.status === "in_flight")
              offsets.set(offset, { status: "failed", error: result.error });
          throw result.error;
        }
        completePage(result.offset, result.page!);
      }
    } finally {
      pageFetchDurationMs += performance.now() - poolFetchStartedAt;
    }
    if (state.deadline.aborted || listingController.signal.aborted)
      throw workdayError("overall_timeout", "Workday jobs listing timed out.");

    state.receivedBytes = listingState.receivedBytes;
    const validationStartedAt = performance.now();
    const sortedOffsets = [...offsets.keys()].sort((a, b) => a - b);
    const pages = new Map<number, WorkdayListingPage>();
    for (let i = 0; i < sortedOffsets.length; i += 1) {
      const offset = sortedOffsets[i];
      if (offset !== i * WORKDAY_PAGE_SIZE)
        throw workdayError(
          "listing_offset_gap",
          "Workday jobs pagination had a gap.",
        );
      const entry = offsets.get(offset);
      if (entry?.status !== "completed")
        throw workdayError(
          "listing_plan_incomplete",
          "Workday jobs pagination plan did not complete.",
        );
      pages.set(offset, entry.page);
    }
    const first = pages.get(0);
    if (!first)
      throw workdayError(
        "listing_plan_incomplete",
        "Workday jobs pagination plan did not complete.",
      );
    const firstPageAuthoritativeTotal = getAuthoritativeTotal(
      0,
      first.jobs,
      first.total,
    );
    if (firstPageAuthoritativeTotal === 0 && first.jobs.length === 0) return [];
    const highestRequiredOffset =
      totals.maximumReportedTotal === undefined
        ? (sortedOffsets.at(-1) ?? 0)
        : getLastDataOffset(totals.maximumReportedTotal);
    const shortPageOffset = sortedOffsets.find((offset) => {
      const page = pages.get(offset);
      return Boolean(page && page.jobs.length < WORKDAY_PAGE_SIZE);
    });
    if (shortPageOffset === undefined)
      throw workdayError(
        "pagination_incomplete",
        "Workday jobs listing ended before completion was established.",
      );
    const laterRowOffset = sortedOffsets.find((offset) => {
      const page = pages.get(offset);
      return Boolean(page && offset > shortPageOffset && page.jobs.length > 0);
    });
    if (laterRowOffset !== undefined && shortPageOffset < highestRequiredOffset)
      throw workdayError(
        "pagination_sparse",
        "Workday jobs pagination returned rows after an early short page.",
      );
    if (
      totals.maximumReportedTotal !== undefined &&
      totals.maximumReportedTotal > 0 &&
      rawRowsObserved === 0
    )
      throw workdayError(
        "pagination_incomplete",
        "Workday jobs listing ended before completion was established.",
      );
    const shortPageCanBeTerminal =
      shortPageOffset >= highestRequiredOffset || laterRowOffset === undefined;
    if (!shortPageCanBeTerminal)
      throw workdayError(
        "pagination_incomplete",
        "Workday jobs listing ended before completion was established.",
      );
    const seen = new Set<string>();
    const listings: Record<string, unknown>[] = [];
    for (const offset of [...pages.keys()].sort((a, b) => a - b)) {
      const page = pages.get(offset);
      if (!page) continue;
      for (const job of page.jobs) {
        const identity = getListingIdentity(job);
        if (!identity) continue;
        if (seen.has(identity)) continue;
        seen.add(identity);
        listings.push(job);
        if (listings.length > WORKDAY_MAX_JOBS)
          throw workdayError(
            "reported_total_too_large",
            "Workday jobs total exceeds the safe import limit.",
          );
      }
    }
    validationDurationMs += performance.now() - validationStartedAt;
    return listings;
  } catch (error) {
    if (
      error instanceof WorkdayParserError &&
      error.failureCode === "overall_timeout"
    )
      error.listingTimingDiagnostic = buildTimingDiagnostic();
    throw error;
  } finally {
    state.deadline.removeEventListener("abort", abortListing);
    listingController.abort();
    await Promise.allSettled(
      [...active.values()].map(({ promise }) => promise),
    );
    state.receivedBytes = listingState.receivedBytes;
  }
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
  async parseJobs(
    careersPage: CareersPage,
    options?: { detailMode?: "listing" | "full" },
  ): Promise<ImportedJob[]> {
    const source = getWorkdaySource(careersPage.url);
    if (!source)
      throw new Error(
        "Careers page URL is not a recognized Workday careers URL.",
      );
    const deadline = createOverallDeadline(WORKDAY_LISTING_TIMEOUT_MS);
    const state: FetchState = {
      receivedBytes: 0,
      deadline: deadline.signal,
      stage: "listing",
    };
    try {
      const listings = await fetchCompleteListings(source, state);
      if (options?.detailMode === "listing") {
        state.stage = "normalization";
        return listings
          .map((summary) => normalizeWorkdayJob(source, summary))
          .filter((job): job is ImportedJob => Boolean(job));
      }
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
  async hydrateJobs(input: {
    careersPage: CareersPage;
    jobs: ImportedJob[];
  }): Promise<HydratedJobResult[]> {
    const source = getWorkdaySource(input.careersPage.url);
    if (!source)
      throw new Error(
        "Careers page URL is not a recognized Workday careers URL.",
      );
    const deadline = createOverallDeadline(WORKDAY_LISTING_TIMEOUT_MS);
    const state: FetchState = {
      receivedBytes: 0,
      deadline: deadline.signal,
      stage: "listing",
    };
    try {
      const listings = await fetchCompleteListings(source, state);
      const listingsById = new Map<string, Record<string, unknown>>();
      for (const listing of listings) {
        const listingJob = normalizeWorkdayJob(source, listing);
        if (listingJob) listingsById.set(listingJob.externalId, listing);
      }
      const unique = new Map<string, ImportedJob>();
      for (const job of input.jobs)
        if (job.providerKey === "workday" && !unique.has(job.externalId))
          unique.set(job.externalId, job);
      const selected = [...unique.values()];
      state.stage = "detail";
      return await mapWithConcurrency(
        selected,
        WORKDAY_DETAIL_CONCURRENCY,
        async (job) => {
          const listing = listingsById.get(job.externalId);
          if (!listing)
            return {
              status: "unavailable",
              providerKey: "workday",
              externalId: job.externalId,
            };
          const externalPath = normalizeExternalPath(listing.externalPath);
          if (!externalPath)
            return {
              status: "unavailable",
              providerKey: "workday",
              externalId: job.externalId,
            };
          try {
            const detail = await fetchJobDetail(source, externalPath, state);
            state.stage = "normalization";
            const hydrated = normalizeWorkdayJob(source, listing, detail);
            return hydrated
              ? { status: "ready", job: hydrated }
              : {
                  status: "unavailable",
                  providerKey: "workday",
                  externalId: job.externalId,
                };
          } catch (error) {
            logWorkdayParsingFailure("detail", error);
            return {
              status: "unavailable",
              providerKey: "workday",
              externalId: job.externalId,
            };
          } finally {
            state.stage = "detail";
          }
        },
      );
    } catch (error) {
      logWorkdayParsingFailure(state.stage, error);
      throw error;
    } finally {
      deadline.abort();
    }
  },
};

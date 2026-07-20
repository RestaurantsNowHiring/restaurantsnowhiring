import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { isIP } from "node:net";

import type { DiscoveryResult, RedirectStep } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 10;
const USER_AGENT =
  "RestaurantsNowHiring/1.0 (+https://restaurantsnowhiring.com; careers-page-discovery)";

const REQUEST_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ValidatedAddress = {
  address: string;
  family: 4 | 6;
};

type HeadersResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: IncomingMessage;
};

class HtmlBodyTooLargeError extends Error {
  constructor() {
    super(
      `Careers page HTML is too large to analyze. Maximum supported size is ${MAX_HTML_BYTES} bytes.`,
    );
    this.name = "HtmlBodyTooLargeError";
  }
}

class DiscoveryTimeoutError extends Error {
  constructor() {
    super(`Careers page request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    this.name = "TimeoutError";
  }
}

function failedResult(
  originalUrl: string,
  errorMessage: string,
  options: {
    finalUrl?: string | null;
    redirectHistory?: RedirectStep[];
    httpStatus?: number | null;
  } = {},
): DiscoveryResult {
  return {
    status: "failed",
    originalUrl,
    finalUrl: options.finalUrl ?? null,
    redirectHistory: options.redirectHistory ?? [],
    httpStatus: options.httpStatus ?? null,
    errorMessage,
  };
}

function parseHttpUrl(inputUrl: string): URL | null {
  try {
    const url = new URL(inputUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (!url.hostname || url.username || url.password) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return parts.reduce((total, part) => total * 256 + part, 0);
}

function isIpv4InCidr(
  address: string,
  baseAddress: string,
  prefixLength: number,
): boolean {
  const addressNumber = ipv4ToNumber(address);
  const baseNumber = ipv4ToNumber(baseAddress);

  if (addressNumber === null || baseNumber === null) {
    return true;
  }

  const mask =
    prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;

  return (addressNumber & mask) === (baseNumber & mask);
}

function isBlockedIpv4(address: string): boolean {
  return [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([baseAddress, prefixLength]) =>
    isIpv4InCidr(address, String(baseAddress), Number(prefixLength)),
  );
}

function getIpv4FromMappedIpv6(address: string): string | null {
  const normalizedAddress = address.toLowerCase();
  const mappedPrefix = "::ffff:";

  if (!normalizedAddress.startsWith(mappedPrefix)) {
    return null;
  }

  const embeddedIpv4 = normalizedAddress.slice(mappedPrefix.length);

  return isIP(embeddedIpv4) === 4 ? embeddedIpv4 : null;
}

function isBlockedIpv6(address: string): boolean {
  const normalizedAddress = address.toLowerCase();
  const mappedIpv4 = getIpv4FromMappedIpv6(normalizedAddress);

  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  return (
    normalizedAddress === "::" ||
    normalizedAddress === "::1" ||
    normalizedAddress.startsWith("fe80:") ||
    normalizedAddress.startsWith("fc") ||
    normalizedAddress.startsWith("fd")
  );
}

function isBlockedAddress(address: string): boolean {
  const ipVersion = isIP(address);

  if (ipVersion === 4) {
    return isBlockedIpv4(address);
  }

  if (ipVersion === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

function isLocalHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "local" ||
    normalizedHostname.endsWith(".local")
  );
}

function getAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DiscoveryTimeoutError();
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw getAbortReason(signal);
  }
}

async function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  throwIfAborted(signal);

  let abortHandler: (() => void) | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abortHandler = () =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new DiscoveryTimeoutError(),
          );
        signal.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);
  } finally {
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

async function validatePublicHttpDestination(
  url: URL,
  signal: AbortSignal,
): Promise<ValidatedAddress[] | string> {
  throwIfAborted(signal);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only http:// and https:// careers page URLs are supported.";
  }

  if (url.username || url.password) {
    return "Careers page URL must not include username or password credentials.";
  }

  if (isLocalHostname(url.hostname)) {
    return "Careers page URL host is not allowed.";
  }

  const literalIpVersion = isIP(url.hostname);

  if (literalIpVersion !== 0) {
    return isBlockedAddress(url.hostname)
      ? "Careers page URL resolves to a private, local, or otherwise non-public network address."
      : [{ address: url.hostname, family: literalIpVersion === 4 ? 4 : 6 }];
  }

  try {
    const addresses = await withAbort(
      lookup(url.hostname, { all: true, verbatim: true }),
      signal,
    );

    if (addresses.length === 0) {
      return "Careers page URL hostname could not be resolved.";
    }

    if (addresses.some(({ address }) => isBlockedAddress(address))) {
      return "Careers page URL resolves to a private, local, or otherwise non-public network address.";
    }

    return addresses.map(({ address, family }) => ({
      address,
      family: family === 4 ? 4 : 6,
    }));
  } catch (error) {
    if (isTimeoutError(error)) {
      throw error;
    }

    return "Careers page URL hostname could not be resolved.";
  }
}

function getHeaderValue(
  headers: IncomingHttpHeaders,
  headerName: string,
): string | null {
  const value = headers[headerName.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getContentTypeMediaType(headers: IncomingHttpHeaders): string | null {
  const contentType = getHeaderValue(headers, "content-type");

  if (!contentType) {
    return null;
  }

  return contentType.split(";", 1)[0]?.trim().toLowerCase() || null;
}

function isHtmlCompatibleContentType(headers: IncomingHttpHeaders): boolean {
  const mediaType = getContentTypeMediaType(headers);

  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function getContentLength(headers: IncomingHttpHeaders): number | null {
  const contentLength = getHeaderValue(headers, "content-length");

  if (!contentLength || !/^\d+$/.test(contentLength.trim())) {
    return null;
  }

  const parsedLength = Number(contentLength);

  return Number.isSafeInteger(parsedLength) ? parsedLength : null;
}

function getCharset(headers: IncomingHttpHeaders): string {
  const contentType = getHeaderValue(headers, "content-type");
  const charset = contentType
    ?.split(";")
    .slice(1)
    .map((parameter) => parameter.trim())
    .find((parameter) => parameter.toLowerCase().startsWith("charset="))
    ?.slice("charset=".length)
    .trim()
    .replace(/^['"]|['"]$/g, "");

  return charset || "utf-8";
}

function decodeHtmlBody(body: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  }
}

async function readBoundedHtmlBody(
  response: HeadersResponse,
  signal: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);

  const contentLength = getContentLength(response.headers);

  if (contentLength !== null && contentLength > MAX_HTML_BYTES) {
    cancelResponseBody(response);
    throw new HtmlBodyTooLargeError();
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const abortHandler = () =>
    cancelResponseBody(response, getAbortReason(signal));

  signal.addEventListener("abort", abortHandler, { once: true });

  try {
    for await (const chunk of response.body) {
      throwIfAborted(signal);

      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bufferChunk.byteLength;

      if (totalBytes > MAX_HTML_BYTES) {
        cancelResponseBody(response);
        throw new HtmlBodyTooLargeError();
      }

      chunks.push(bufferChunk);
    }
  } catch (error) {
    if (signal.aborted) {
      throw getAbortReason(signal);
    }

    throw error;
  } finally {
    signal.removeEventListener("abort", abortHandler);
    cancelResponseBody(response);
  }

  throwIfAborted(signal);

  return decodeHtmlBody(
    Buffer.concat(chunks, totalBytes),
    getCharset(response.headers),
  );
}

function getRedirectTarget(
  response: HeadersResponse,
  currentUrl: URL,
): URL | null {
  const location = getHeaderValue(response.headers, "location");

  if (!location) {
    return null;
  }

  try {
    return new URL(location, currentUrl);
  } catch {
    return null;
  }
}

function cancelResponseBody(
  response: HeadersResponse | null,
  error?: Error,
): void {
  if (!response || response.body.destroyed || response.body.readableEnded) {
    return;
  }

  try {
    response.body.destroy(error);
  } catch {
    // Best-effort cleanup should not mask discovery's primary result.
  }
}

function requestHeadersForAddress(
  url: URL,
  validatedAddress: ValidatedAddress,
  signal: AbortSignal,
): Promise<HeadersResponse> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);

    let receivedResponse = false;
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: REQUEST_HEADERS,
        servername: url.protocol === "https:" ? url.hostname : undefined,
        lookup: (_hostname, _options, callback) => {
          callback(null, validatedAddress.address, validatedAddress.family);
        },
        signal,
      },
      (body) => {
        receivedResponse = true;
        body.pause();
        resolve({ status: body.statusCode ?? 0, headers: body.headers, body });
      },
    );

    request.on("error", (error) => {
      if (!receivedResponse) {
        request.destroy();
      }

      reject(error);
    });
    request.end();
  });
}

async function requestHeaders(
  url: URL,
  validatedAddresses: ValidatedAddress[],
  signal: AbortSignal,
): Promise<HeadersResponse> {
  let lastError: unknown = null;

  for (const validatedAddress of validatedAddresses) {
    try {
      return await requestHeadersForAddress(url, validatedAddress, signal);
    } catch (error) {
      if (isTimeoutError(error)) {
        throw error;
      }

      lastError = error;
      throwIfAborted(signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All validated addresses failed to connect.");
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DiscoveryTimeoutError ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function getFetchErrorMessage(error: unknown): string {
  if (isTimeoutError(error)) {
    return `Careers page request timed out after ${REQUEST_TIMEOUT_MS}ms.`;
  }

  if (error instanceof HtmlBodyTooLargeError) {
    return error.message;
  }

  if (error instanceof Error) {
    return `Careers page request failed: ${error.message}`;
  }

  return "Careers page request failed.";
}

/**
 * Native fetch does not expose redirect history after automatic redirects in a
 * portable way. This service follows redirects one hop at a time so every
 * redirect target can be validated and fetched through the pinned DNS lookup.
 */
export async function discoverCareersPage(
  inputUrl: string,
): Promise<DiscoveryResult> {
  const originalUrl = inputUrl;
  const initialUrl = parseHttpUrl(inputUrl);

  if (!initialUrl) {
    return failedResult(
      originalUrl,
      "Invalid careers page URL. Please provide an http:// or https:// URL without embedded credentials.",
    );
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new DiscoveryTimeoutError()),
    REQUEST_TIMEOUT_MS,
  );

  const redirectHistory: RedirectStep[] = [];
  let currentUrl = initialUrl;
  let lastStatus: number | null = null;
  let response: HeadersResponse | null = null;
  let redirectsFollowed = 0;

  try {
    for (;;) {
      const validationResult = await validatePublicHttpDestination(
        currentUrl,
        timeoutController.signal,
      );

      if (typeof validationResult === "string") {
        return failedResult(originalUrl, validationResult, {
          finalUrl: currentUrl.toString(),
          redirectHistory,
          httpStatus: lastStatus,
        });
      }

      response = await requestHeaders(
        currentUrl,
        validationResult,
        timeoutController.signal,
      );
      lastStatus = response.status;

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirectsFollowed >= MAX_REDIRECTS) {
          cancelResponseBody(response);
          response = null;

          return failedResult(
            originalUrl,
            `Careers page exceeded ${MAX_REDIRECTS} redirects.`,
            {
              finalUrl: currentUrl.toString(),
              redirectHistory,
              httpStatus: lastStatus,
            },
          );
        }

        const nextUrl = getRedirectTarget(response, currentUrl);
        cancelResponseBody(response);
        response = null;

        if (!nextUrl) {
          return failedResult(
            originalUrl,
            "Redirect response did not include a valid Location header.",
            {
              finalUrl: currentUrl.toString(),
              redirectHistory,
              httpStatus: lastStatus,
            },
          );
        }

        redirectHistory.push({
          fromUrl: currentUrl.toString(),
          toUrl: nextUrl.toString(),
          status: lastStatus,
        });
        redirectsFollowed += 1;
        currentUrl = nextUrl;
        continue;
      }

      const finalUrl = currentUrl.toString();
      const finalParsedUrl = parseHttpUrl(finalUrl);

      if (!finalParsedUrl) {
        cancelResponseBody(response);
        response = null;

        return failedResult(
          originalUrl,
          "Final careers page URL is not an http:// or https:// URL.",
          {
            finalUrl,
            redirectHistory,
            httpStatus: lastStatus,
          },
        );
      }

      if (response.status < 200 || response.status > 299) {
        cancelResponseBody(response);
        response = null;

        return failedResult(
          originalUrl,
          `Careers page returned a non-success HTTP status: ${lastStatus}.`,
          {
            finalUrl,
            redirectHistory,
            httpStatus: lastStatus,
          },
        );
      }

      if (!isHtmlCompatibleContentType(response.headers)) {
        cancelResponseBody(response);
        response = null;

        return {
          status: "success",
          originalUrl,
          finalUrl,
          redirectHistory,
          httpStatus: lastStatus,
          html: null,
        };
      }

      const html = await readBoundedHtmlBody(
        response,
        timeoutController.signal,
      );
      response = null;

      return {
        status: "success",
        originalUrl,
        finalUrl,
        redirectHistory,
        httpStatus: lastStatus,
        html,
      };
    }
  } catch (error) {
    return failedResult(originalUrl, getFetchErrorMessage(error), {
      finalUrl: currentUrl.toString(),
      redirectHistory,
      httpStatus: lastStatus,
    });
  } finally {
    cancelResponseBody(response);
    clearTimeout(timeout);
  }
}

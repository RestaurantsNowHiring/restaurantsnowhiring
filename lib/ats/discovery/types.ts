/**
 * Shared ATS careers page discovery types.
 *
 * These provider-agnostic shapes describe the outcome of resolving an
 * employer-provided URL to a real careers page. This file intentionally
 * contains no fetching, redirect-following, ATS detection, UI code, or
 * persistence mapping.
 */
export type DiscoveryStatus = "success" | "failed";

export type RedirectStep = {
  fromUrl: string;
  toUrl: string;
  status: number;
};

export type DiscoveryResult =
  | {
      status: "success";
      originalUrl: string;
      finalUrl: string;
      redirectHistory: RedirectStep[];
      httpStatus: number;
      html: string | null;
    }
  | {
      status: "failed";
      originalUrl: string;
      finalUrl: string | null;
      redirectHistory: RedirectStep[];
      httpStatus: number | null;
      errorMessage: string;
    };

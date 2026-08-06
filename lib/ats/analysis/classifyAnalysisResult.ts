import type { CareersPageAnalysisResult } from "./types";
import type { AtsProviderKey } from "../types";

const DISCOVERY_FAILED_MESSAGE =
  "We couldn't access that careers page. Check the URL and try again.";
const NO_JOB_LINKS_MESSAGE =
  "We couldn't find job or careers links on that page.";
const UNSUPPORTED_MESSAGE =
  "We found careers or job pages, but couldn't identify a supported job system.";

export type CareersPageAnalysisOutcome =
  | {
      status: "provider-found";
      providerKey: AtsProviderKey;
      sourceUrl: string;
    }
  | {
      status: "discovery-failed";
      message: string;
    }
  | {
      status: "no-job-links";
      message: string;
    }
  | {
      status: "unsupported";
      message: string;
    };

export function classifyAnalysisResult(
  result: CareersPageAnalysisResult,
): CareersPageAnalysisOutcome {
  switch (result.stage) {
    case "discovery":
      return {
        status: "discovery-failed",
        message: DISCOVERY_FAILED_MESSAGE,
      };

    case "detection":
      return {
        status: "provider-found",
        providerKey: result.detection.providerKey,
        sourceUrl: result.detection.sourceUrl,
      };

    case "link-discovery":
      return {
        status: "no-job-links",
        message: NO_JOB_LINKS_MESSAGE,
      };

    case "careers-path-inspection":
      if (result.status === "matched") {
        return {
          status: "provider-found",
          providerKey: result.careersPathInspection.detection.providerKey,
          sourceUrl: result.careersPathInspection.detection.sourceUrl,
        };
      }

      return {
        status: "unsupported",
        message: UNSUPPORTED_MESSAGE,
      };

    default: {
      const exhaustiveResult: never = result;
      return exhaustiveResult;
    }
  }
}

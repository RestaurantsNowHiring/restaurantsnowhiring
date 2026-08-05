import "server-only";

import { analyzeCareersPage } from "../analysis/analyzeCareersPage";
import { classifyAnalysisResult } from "../analysis/classifyAnalysisResult";
import { getAtsProvider } from "../providers/registry";
import type { AtsProviderKey, ImportedJob } from "../types";

const PROVIDER_UNAVAILABLE_MESSAGE =
  "We found the job system, but couldn't retrieve the jobs right now. Please try again.";

export type JobImportPreviewResult =
  | {
      status: "ready";
      providerKey: AtsProviderKey;
      sourceUrl: string;
      jobs: ImportedJob[];
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
    }
  | {
      status: "retrieval-failed";
      providerKey: AtsProviderKey;
      sourceUrl: string;
      message: string;
    };

export async function previewJobImport(
  inputUrl: string,
): Promise<JobImportPreviewResult> {
  const analysisResult = await analyzeCareersPage(inputUrl);
  const classification = classifyAnalysisResult(analysisResult);

  switch (classification.status) {
    case "discovery-failed":
    case "no-job-links":
    case "unsupported":
      return {
        status: classification.status,
        message: classification.message,
      };

    case "provider-found": {
      const provider = getAtsProvider(classification.providerKey);

      if (provider === undefined) {
        return {
          status: "retrieval-failed",
          providerKey: classification.providerKey,
          sourceUrl: classification.sourceUrl,
          message: PROVIDER_UNAVAILABLE_MESSAGE,
        };
      }

      try {
        const jobs = await provider.parseJobs({
          url: classification.sourceUrl,
        }, { detailMode: "listing" });

        return {
          status: "ready",
          providerKey: classification.providerKey,
          sourceUrl: classification.sourceUrl,
          jobs,
        };
      } catch {
        return {
          status: "retrieval-failed",
          providerKey: classification.providerKey,
          sourceUrl: classification.sourceUrl,
          message: PROVIDER_UNAVAILABLE_MESSAGE,
        };
      }
    }

    default: {
      const exhaustiveClassification: never = classification;
      return exhaustiveClassification;
    }
  }
}

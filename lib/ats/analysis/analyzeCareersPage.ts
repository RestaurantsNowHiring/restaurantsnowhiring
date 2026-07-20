import "server-only";

import { detectProvider } from "../detection/detectProvider";
import { discoverCareersPage } from "../discovery/discoverCareersPage";
import type { CareersPage } from "../types";
import type { CareersPageAnalysisResult } from "./types";

export async function analyzeCareersPage(
  inputUrl: string,
): Promise<CareersPageAnalysisResult> {
  const discovery = await discoverCareersPage(inputUrl);

  if (discovery.status === "failed") {
    return {
      stage: "discovery",
      status: "failed",
      discovery,
    };
  }

  const careersPage: CareersPage = {
    url: discovery.finalUrl,
  };

  const detection = await detectProvider(careersPage);

  if (detection.matched) {
    return {
      stage: "detection",
      status: "matched",
      discovery,
      detection,
    };
  }

  return {
    stage: "detection",
    status: "unmatched",
    discovery,
    detection,
  };
}

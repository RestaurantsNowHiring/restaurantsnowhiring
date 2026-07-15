import "server-only";

import { discoverCareersPage } from "../discovery/discoverCareersPage";
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

  return {
    stage: "detection",
    status: "pending",
    discovery,
  };
}

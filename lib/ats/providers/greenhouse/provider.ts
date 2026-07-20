import "server-only";

import type { AtsProvider, CareersPage, DetectionResult } from "../../types";

const GREENHOUSE_HOSTNAMES = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
] as const;

function normalizeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isGreenhouseHostname(hostname: string): boolean {
  return GREENHOUSE_HOSTNAMES.some(
    (greenhouseHostname) =>
      hostname === greenhouseHostname || hostname.endsWith(`.${greenhouseHostname}`),
  );
}

export const greenhouseProvider: AtsProvider = {
  key: "greenhouse",
  displayName: "Greenhouse",
  async detect(careersPage: CareersPage): Promise<DetectionResult> {
    const detectedAt = new Date().toISOString();
    const hostname = normalizeHostname(careersPage.url);

    if (hostname && isGreenhouseHostname(hostname)) {
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
  async parseJobs() {
    throw new Error("Greenhouse job parsing is not implemented.");
  },
};

import { atsProviders } from "../providers/registry";
import type { CareersPage, DetectionResult } from "../types";

export async function detectProvider(
  careersPage: CareersPage,
): Promise<DetectionResult> {
  for (const provider of atsProviders) {
    try {
      const detectionResult = await provider.detect(careersPage);

      if (detectionResult.matched) {
        return detectionResult;
      }
    } catch {
      continue;
    }
  }

  return {
    matched: false,
    providerKey: null,
    confidence: null,
    sourceUrl: careersPage.url,
    evidence: [],
    detectedAt: new Date().toISOString(),
  };
}

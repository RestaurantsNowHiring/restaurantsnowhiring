import { detectProvider } from "../detection/detectProvider";
import type { DetectionResult } from "../types";
import { discoverCareersPage } from "./discoverCareersPage";
import type { DiscoveryResult } from "./types";
import type { RankedCandidateLink } from "./rankCandidateLinks";
import { MAX_SELECTED_CANDIDATE_LINKS } from "./selectCandidateLinks";

export type CandidateLinkInspectionResult =
  | {
      status: "matched";
      candidate: RankedCandidateLink;
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: true }>;
      inspectedCount: number;
    }
  | {
      status: "unmatched";
      inspectedCount: number;
    };

export async function inspectCandidateLinks(
  candidateLinks: RankedCandidateLink[],
): Promise<CandidateLinkInspectionResult> {
  let inspectedCount = 0;

  for (const candidateLink of candidateLinks.slice(0, MAX_SELECTED_CANDIDATE_LINKS)) {
    inspectedCount += 1;

    const discovery = await discoverCareersPage(candidateLink.candidate.url);

    if (discovery.status === "failed") {
      continue;
    }

    const detection = await detectProvider({
      url: discovery.finalUrl,
    });

    if (detection.matched) {
      return {
        status: "matched",
        candidate: candidateLink,
        discovery,
        detection,
        inspectedCount,
      };
    }
  }

  return {
    status: "unmatched",
    inspectedCount,
  };
}

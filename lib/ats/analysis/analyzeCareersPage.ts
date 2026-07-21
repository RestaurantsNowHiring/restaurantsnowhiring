import "server-only";

import { detectProvider } from "../detection/detectProvider";
import { discoverCareersPage } from "../discovery/discoverCareersPage";
import { extractCandidateLinks } from "../discovery/extractCandidateLinks";
import { inspectCandidateLinks } from "../discovery/inspectCandidateLinks";
import { rankCandidateLinks } from "../discovery/rankCandidateLinks";
import { selectCandidateLinks } from "../discovery/selectCandidateLinks";
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

  if (discovery.html === null) {
    return {
      stage: "link-discovery",
      status: "no-candidates",
      discovery,
      detection,
      candidateLinks: [],
    };
  }

  const candidateLinks = selectCandidateLinks(
    rankCandidateLinks(extractCandidateLinks(discovery.html, discovery.finalUrl)),
  );

  if (candidateLinks.length === 0) {
    return {
      stage: "link-discovery",
      status: "no-candidates",
      discovery,
      detection,
      candidateLinks: [],
    };
  }

  const candidateInspection = await inspectCandidateLinks(candidateLinks);

  if (candidateInspection.status === "matched") {
    return {
      stage: "candidate-inspection",
      status: "matched",
      discovery,
      detection,
      candidateLinks,
      candidateInspection,
    };
  }

  return {
    stage: "candidate-inspection",
    status: "unmatched",
    discovery,
    detection,
    candidateLinks,
    candidateInspection,
  };
}

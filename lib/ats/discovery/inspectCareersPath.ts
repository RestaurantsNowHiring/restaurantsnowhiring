import { detectProvider } from "../detection/detectProvider";
import type { DetectionResult } from "../types";
import { discoverCareersPage } from "./discoverCareersPage";
import { extractCandidateLinks } from "./extractCandidateLinks";
import { rankCandidateLinks, type RankedCandidateLink } from "./rankCandidateLinks";
import { selectCandidateLinks } from "./selectCandidateLinks";
import type { DiscoveryResult } from "./types";

export const MAX_CAREERS_PATH_DEPTH = 2;
export const MAX_CAREERS_PATH_PAGES = 5;

type SuccessfulDiscoveryResult = Extract<DiscoveryResult, { status: "success" }>;
type MatchedDetectionResult = Extract<DetectionResult, { matched: true }>;

export type CareersPathInspectionResult =
  | {
      status: "matched";
      detection: MatchedDetectionResult;
      discovery: SuccessfulDiscoveryResult;
      path: RankedCandidateLink[];
      inspectedCount: number;
      maxDepthReached: number;
    }
  | {
      status: "unmatched";
      inspectedCount: number;
      maxDepthReached: number;
    };

type CareersPathQueueItem = {
  candidateLink: RankedCandidateLink;
  depth: number;
  path: RankedCandidateLink[];
};

function normalizeDestinationKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";

    return url.href;
  } catch {
    return rawUrl;
  }
}

function markDiscoveryDestinationsVisited(
  discovery: DiscoveryResult,
  visitedDestinationKeys: Set<string>,
): void {
  if (discovery.finalUrl) {
    visitedDestinationKeys.add(normalizeDestinationKey(discovery.finalUrl));
  }

  for (const redirectStep of discovery.redirectHistory) {
    visitedDestinationKeys.add(normalizeDestinationKey(redirectStep.fromUrl));
    visitedDestinationKeys.add(normalizeDestinationKey(redirectStep.toUrl));
  }
}

/**
 * Inspects already-selected careers/job candidate links with a deterministic,
 * breadth-first traversal. Depth 1 candidates are inspected in ranking order
 * before any selected depth 2 children, and no links beyond depth 2 are queued.
 */
export async function inspectCareersPath(
  candidateLinks: RankedCandidateLink[],
): Promise<CareersPathInspectionResult> {
  const visitedDestinationKeys = new Set<string>();
  const queue: CareersPathQueueItem[] = candidateLinks.map((candidateLink) => ({
    candidateLink,
    depth: 1,
    path: [candidateLink],
  }));
  let inspectedCount = 0;
  let maxDepthReached = 0;

  while (queue.length > 0 && inspectedCount < MAX_CAREERS_PATH_PAGES) {
    const item = queue.shift();

    if (!item || item.depth > MAX_CAREERS_PATH_DEPTH) {
      continue;
    }

    const candidateDestinationKey = normalizeDestinationKey(item.candidateLink.candidate.url);

    if (visitedDestinationKeys.has(candidateDestinationKey)) {
      continue;
    }

    visitedDestinationKeys.add(candidateDestinationKey);
    inspectedCount += 1;
    maxDepthReached = Math.max(maxDepthReached, item.depth);

    const discovery = await discoverCareersPage(item.candidateLink.candidate.url);
    const finalDestinationWasVisited = discovery.finalUrl
      ? visitedDestinationKeys.has(normalizeDestinationKey(discovery.finalUrl))
      : false;

    markDiscoveryDestinationsVisited(discovery, visitedDestinationKeys);

    if (discovery.status === "failed") {
      continue;
    }

    if (
      normalizeDestinationKey(discovery.finalUrl) !== candidateDestinationKey &&
      finalDestinationWasVisited
    ) {
      continue;
    }

    const detection = await detectProvider({
      url: discovery.finalUrl,
    });

    if (detection.matched) {
      return {
        status: "matched",
        detection,
        discovery,
        path: item.path,
        inspectedCount,
        maxDepthReached,
      };
    }

    if (item.depth >= MAX_CAREERS_PATH_DEPTH || !discovery.html) {
      continue;
    }

    const childCandidateLinks = selectCandidateLinks(
      rankCandidateLinks(extractCandidateLinks(discovery.html, discovery.finalUrl)),
    );

    for (const childCandidateLink of childCandidateLinks) {
      const childDestinationKey = normalizeDestinationKey(childCandidateLink.candidate.url);

      if (visitedDestinationKeys.has(childDestinationKey)) {
        continue;
      }

      queue.push({
        candidateLink: childCandidateLink,
        depth: item.depth + 1,
        path: [...item.path, childCandidateLink],
      });
    }
  }

  return {
    status: "unmatched",
    inspectedCount,
    maxDepthReached,
  };
}

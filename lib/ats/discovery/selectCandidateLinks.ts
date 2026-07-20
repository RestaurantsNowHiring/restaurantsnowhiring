import type { RankedCandidateLink } from "./rankCandidateLinks";

export const MAX_SELECTED_CANDIDATE_LINKS = 5;

function getRedundancyKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    url.hostname = url.hostname.toLowerCase();

    return url.href;
  } catch {
    return rawUrl;
  }
}

export function selectCandidateLinks(
  rankedLinks: RankedCandidateLink[],
): RankedCandidateLink[] {
  const selectedLinks: RankedCandidateLink[] = [];
  const selectedDestinationKeys = new Set<string>();

  for (const rankedLink of rankedLinks) {
    if (rankedLink.score <= 0) {
      continue;
    }

    const destinationKey = getRedundancyKey(rankedLink.candidate.url);

    if (selectedDestinationKeys.has(destinationKey)) {
      continue;
    }

    selectedLinks.push(rankedLink);
    selectedDestinationKeys.add(destinationKey);

    if (selectedLinks.length === MAX_SELECTED_CANDIDATE_LINKS) {
      break;
    }
  }

  return selectedLinks;
}

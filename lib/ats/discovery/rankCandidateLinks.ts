import type { CandidateLink } from "./extractCandidateLinks";

export type RankedCandidateLink = {
  candidate: CandidateLink;
  score: number;
  reasons: string[];
};

type ScoredSignal = {
  label: string;
  score: number;
};

const STRONG_TEXT_SIGNALS: ScoredSignal[] = [
  { label: "view jobs", score: 50 },
  { label: "search jobs", score: 50 },
  { label: "find jobs", score: 50 },
  { label: "open positions", score: 50 },
  { label: "current openings", score: 50 },
  { label: "job openings", score: 50 },
  { label: "view openings", score: 50 },
  { label: "search openings", score: 50 },
  { label: "see openings", score: 50 },
  { label: "join our team", score: 40 },
  { label: "explore careers", score: 40 },
];

const POSITIVE_URL_WORDS = new Set([
  "jobs",
  "job",
  "careers",
  "career",
  "openings",
  "positions",
  "opportunities",
]);

const NEGATIVE_WORDS = new Set([
  "privacy",
  "terms",
  "contact",
  "about",
  "accessibility",
]);

const SOCIAL_HOST_PATTERNS = [
  /(?:^|\.)facebook\.com$/,
  /(?:^|\.)instagram\.com$/,
  /(?:^|\.)linkedin\.com$/,
  /(?:^|\.)tiktok\.com$/,
  /(?:^|\.)x\.com$/,
  /(?:^|\.)twitter\.com$/,
  /(?:^|\.)youtube\.com$/,
];

const RECRUITING_PLATFORM_HOST_PATTERNS = [
  /^boards\.greenhouse\.io$/,
  /^job-boards\.greenhouse\.io$/,
  /^jobs\.lever\.co$/,
  /(?:^|\.)myworkdayjobs\.com$/,
  /(?:^|\.)workdayjobs\.com$/,
  /^companies\.smartrecruiters\.com$/,
  /^jobs\.jobvite\.com$/,
  /^recruiting\.paylocity\.com$/,
  /^www\.paycomonline\.net$/,
  /^workforcenow\.adp\.com$/,
  /^recruiting\.ultipro\.com$/,
  /^career[0-9]*\.successfactors\.com$/,
  /^careers-[^.]+\.icims\.com$/,
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function textContainsPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?:^| )${phrase.replaceAll(" ", " +")}(?: |$)`).test(text);
}

function getUrlParts(rawUrl: string): { hostname: string; pathWords: string[]; path: string } | null {
  try {
    const url = new URL(rawUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    const pathWords = decodedPath
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    return {
      hostname: url.hostname.toLowerCase(),
      pathWords,
      path: url.pathname,
    };
  } catch {
    return null;
  }
}

function matchesAnyHostPattern(hostname: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(hostname));
}

function scoreCandidate(candidate: CandidateLink): Omit<RankedCandidateLink, "candidate"> {
  let score = 0;
  const reasons: string[] = [];
  const normalizedText = normalizeText(candidate.text);
  const urlParts = getUrlParts(candidate.url);

  for (const signal of STRONG_TEXT_SIGNALS) {
    if (textContainsPhrase(normalizedText, signal.label)) {
      score += signal.score;
      reasons.push(`Strong job-intent anchor text (+${signal.score}): ${candidate.text}`);
    }
  }

  if (urlParts) {
    const matchedPositiveWords = [...new Set(urlParts.pathWords.filter((word) => POSITIVE_URL_WORDS.has(word)))];

    if (matchedPositiveWords.length > 0) {
      const pathScore = 20 + Math.min((matchedPositiveWords.length - 1) * 5, 10);
      score += pathScore;
      reasons.push(
        `Job-related URL path (+${pathScore}): ${urlParts.path} matched ${matchedPositiveWords.join(", ")}`,
      );
    }

    const matchedNegativeWords = [...new Set(urlParts.pathWords.filter((word) => NEGATIVE_WORDS.has(word)))];

    if (matchedNegativeWords.length > 0) {
      const negativeScore = -25;
      score += negativeScore;
      reasons.push(
        `Unrelated URL path (${negativeScore}): ${urlParts.path} matched ${matchedNegativeWords.join(", ")}`,
      );
    }

    if (matchesAnyHostPattern(urlParts.hostname, SOCIAL_HOST_PATTERNS)) {
      const socialScore = -35;
      score += socialScore;
      reasons.push(`Social-media destination (${socialScore}): ${urlParts.hostname}`);
    }

    if (matchesAnyHostPattern(urlParts.hostname, RECRUITING_PLATFORM_HOST_PATTERNS)) {
      const platformScore = 45;
      score += platformScore;
      reasons.push(`External recruiting/job platform destination (+${platformScore}): ${urlParts.hostname}`);
    }
  }

  for (const word of NEGATIVE_WORDS) {
    if (textContainsPhrase(normalizedText, word)) {
      const negativeScore = -20;
      score += negativeScore;
      reasons.push(`Unrelated anchor text (${negativeScore}): ${candidate.text} matched ${word}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push("No positive or negative ranking signals matched");
  }

  return { score, reasons };
}

export function rankCandidateLinks(
  links: CandidateLink[],
): RankedCandidateLink[] {
  return links
    .map((candidate, index) => ({
      candidate,
      index,
      ...scoreCandidate(candidate),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ candidate, score, reasons }) => ({ candidate, score, reasons }));
}

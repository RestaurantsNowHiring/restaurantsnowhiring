export const SOURCED_REVIEW_DAYS = 7;
export const OUTREACH_UNIQUE_VIEWERS = 50;
export const OUTREACH_APPLY_CLICKS = 10;

export function nextReviewDate(from = new Date()) {
  return new Date(from.getTime() + SOURCED_REVIEW_DAYS * 86_400_000).toISOString();
}

export function isReadyForOutreach(uniqueViewers: number, applyClicks: number) {
  return uniqueViewers >= OUTREACH_UNIQUE_VIEWERS || applyClicks >= OUTREACH_APPLY_CLICKS;
}

export function isOfficialSourceUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "monster.com", "careerbuilder.com"].every(
      (blocked) => host !== blocked && !host.endsWith(`.${blocked}`),
    ) && (url.protocol === "https:" || url.protocol === "http:");
  } catch { return false; }
}

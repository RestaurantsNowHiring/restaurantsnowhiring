export const DEFAULT_JOB_LISTING_DURATION_DAYS = 30;

export function addDefaultJobListingDuration(date: Date = new Date()) {
  const expiresAt = new Date(date);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + DEFAULT_JOB_LISTING_DURATION_DAYS);
  return expiresAt;
}

export function getDefaultJobExpirationIso(date: Date = new Date()) {
  return addDefaultJobListingDuration(date).toISOString();
}

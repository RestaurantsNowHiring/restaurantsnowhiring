import { createHash, randomBytes } from "node:crypto";
import { absoluteUrl } from "./seo";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePromotionalContactEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

export function parseFutureOfferExpiration(value: unknown, now = new Date()) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime() ? date : null;
}

export function createPromotionalBearerToken(random: (size: number) => Buffer = randomBytes) {
  const rawToken = random(32).toString("base64url");
  const digest = createHash("sha256").update(rawToken, "utf8").digest();
  return { rawToken, digest, databaseDigest: `\\x${digest.toString("hex")}` };
}

export function buildPromotionalUrl(rawToken: string) {
  return absoluteUrl(`/promotional-post/${encodeURIComponent(rawToken)}`);
}

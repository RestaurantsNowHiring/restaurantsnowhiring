import { createHash, createHmac, randomBytes } from "node:crypto";
import { CANADIAN_PROVINCE_OPTIONS, EMPLOYMENT_OPTIONS, STATE_OPTIONS, normalizeJobCountry } from "./jobFormOptions";
import { normalizePromotionalContactEmail } from "./promotionalInvitations";

export const PROMOTIONAL_IP_LIMIT_PER_HOUR = 5;
export const PROMOTIONAL_EMAIL_LIMIT_PER_HOUR = 3;

// Intentionally local and reviewable. Add confirmed temporary-mail domains here.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com", "temp-mail.org", "tempmail.com", "yopmail.com",
]);

export type PromotionalEntryInput = {
  companyName: string; companyWebsite: string; contactName: string; contactEmail: string;
  title: string; city: string; state: string; country: "United States" | "Canada";
  employmentType: string; description: string; applicationUrl: string;
};

function requiredText(value: unknown, max: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text && text.length <= max ? text : null;
}

export function normalizeHttpUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch { return null; }
}

export function isDisposableEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && DISPOSABLE_EMAIL_DOMAINS.has(domain));
}

export function validatePromotionalEntry(value: unknown): { data?: PromotionalEntryInput; error?: string } {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const companyName = requiredText(body.companyName, 160), contactName = requiredText(body.contactName, 160);
  const title = requiredText(body.title, 160), city = requiredText(body.city, 120), description = requiredText(body.description, 10000);
  const contactEmail = normalizePromotionalContactEmail(body.contactEmail);
  const companyWebsite = normalizeHttpUrl(body.companyWebsite), applicationUrl = normalizeHttpUrl(body.applicationUrl);
  const country = normalizeJobCountry(body.country), state = String(body.state ?? "").trim(), employmentType = String(body.employmentType ?? "").trim();
  if (!companyName || !contactName || !title || !city || !description || !contactEmail || !companyWebsite || !applicationUrl || !country || !state) return { error: "Complete all required fields with valid information." };
  if (isDisposableEmail(contactEmail)) return { error: "Please use a permanent email address." };
  if (!EMPLOYMENT_OPTIONS.includes(employmentType)) return { error: "Select a supported job type." };
  const locations: readonly string[] = country === "Canada" ? CANADIAN_PROVINCE_OPTIONS : STATE_OPTIONS;
  if (!locations.includes(state)) return { error: "Select a valid state or province." };
  return { data: { companyName, companyWebsite, contactName, contactEmail, title, city, state, country, employmentType, description, applicationUrl } };
}

export function getPromotionalEntryPepper(environment = process.env) {
  const pepper = environment.PROMOTIONAL_ENTRY_IP_PEPPER?.trim();
  if (pepper) return pepper;
  return environment.NODE_ENV === "production" ? null : "local-development-only-promotional-entry-pepper";
}

export function digestClientIp(ip: string, pepper: string) {
  return `\\x${createHmac("sha256", pepper).update(ip.trim().toLowerCase()).digest("hex")}`;
}

export function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function createDigestOnlyToken(random = randomBytes) {
  const raw = random(32);
  return `\\x${createHash("sha256").update(raw).digest("hex")}`;
}

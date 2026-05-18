export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CandidateNotificationEmailParseResult =
  | { ok: true; emails: string[]; value: string }
  | { ok: false; emails: string[]; invalidEmails: string[]; message: string };

export function normalizeCandidateNotificationEmails(value: string | string[] | null | undefined) {
  const source = Array.isArray(value) ? value.join(",") : value ?? "";
  const emails = source
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(emails));
}

export function parseCandidateNotificationEmails(value: string | string[] | null | undefined): CandidateNotificationEmailParseResult {
  const emails = normalizeCandidateNotificationEmails(value);
  const invalidEmails = emails.filter((email) => !EMAIL_PATTERN.test(email));

  if (invalidEmails.length > 0) {
    return {
      ok: false,
      emails,
      invalidEmails,
      message: `Enter valid email addresses separated by commas. Invalid: ${invalidEmails.join(", ")}`,
    };
  }

  return { ok: true, emails, value: emails.join(", ") };
}

export function formatCandidateNotificationEmails(emails: string[] | string | null | undefined) {
  return normalizeCandidateNotificationEmails(emails).join(", ");
}

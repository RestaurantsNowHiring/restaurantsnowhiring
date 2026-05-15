import type { EmployerRole } from "./employerAccounts";
import { buildBrandedEmailHtml, buildBrandedEmailText, escapeHtml, normalizeEmailText } from "./emailTemplates";
import { absoluteUrl } from "./seo";

const SUBJECT = "You’ve been invited to Restaurants Now Hiring";

const ROLE_LABELS: Record<EmployerRole, string> = {
  account_owner: "Account Owner",
  hiring_manager: "Hiring Manager",
  viewer: "Viewer",
};

export type TeamInviteEmailInput = {
  toEmail: string;
  accountName: string | null;
  role: EmployerRole;
  inviterEmail?: string | null;
};

export type TeamInviteEmailResult =
  | { ok: true }
  | { ok: false; reason: "missing_resend_api_key" | "missing_invited_email" | "email_provider_error" };

function buildEmailHtml(input: TeamInviteEmailInput) {
  const accountName = normalizeEmailText(input.accountName, "an employer account");
  const roleLabel = ROLE_LABELS[input.role];
  const inviterEmail = normalizeEmailText(input.inviterEmail, "your account owner");
  const loginUrl = absoluteUrl("/employer-login");
  const invitedEmail = input.toEmail;

  return buildBrandedEmailHtml({
    preheader: `${inviterEmail} invited you to join ${accountName} on RestaurantsNOWHiring.com.`,
    title: "You’re invited to join your team",
    intro: `${inviterEmail} invited you to access ${accountName} on RestaurantsNOWHiring.com.`,
    bodyHtml: `<p style="margin:0;">Use <strong>${escapeHtml(invitedEmail)}</strong> when you create an account or sign in. If you already have an account with this email, sign in and your team access will be applied automatically.</p>`,
    cta: {
      label: "Sign up or log in",
      href: loginUrl,
    },
    contextRows: [
      { label: "Employer Account Name", value: accountName },
      { label: "Access Level", value: roleLabel },
      { label: "Invited By", value: inviterEmail },
    ],
    footerNote: `This invitation was sent because ${invitedEmail} was added to ${accountName}. Hiring built for restaurants.`,
  });
}

function buildEmailText(input: TeamInviteEmailInput) {
  const accountName = normalizeEmailText(input.accountName, "an employer account");
  const inviter = normalizeEmailText(input.inviterEmail, "your account owner");

  return buildBrandedEmailText({
    title: "You’re invited to join your team",
    intro: `${inviter} invited you to access ${accountName} on RestaurantsNOWHiring.com.`,
    contextRows: [
      { label: "Employer Account Name", value: accountName },
      { label: "Access Level", value: ROLE_LABELS[input.role] },
      { label: "Invited By", value: inviter },
    ],
    cta: {
      label: "Sign up or log in",
      href: absoluteUrl("/employer-login"),
    },
    footerNote: `This invitation was sent because ${input.toEmail} was added to ${accountName}. Hiring built for restaurants.`,
  });
}

export async function sendTeamInviteEmail(input: TeamInviteEmailInput): Promise<TeamInviteEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false, reason: "missing_resend_api_key" };

  const toEmail = input.toEmail.trim().toLowerCase();
  if (!toEmail) return { ok: false, reason: "missing_invited_email" };

  const fromEmail = process.env.TEAM_INVITE_FROM ?? process.env.CONTACT_NOTIFICATION_FROM ?? "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: SUBJECT,
      text: buildEmailText({ ...input, toEmail }),
      html: buildEmailHtml({ ...input, toEmail }),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Employer team invite email failed", {
      status: response.status,
      details,
      toEmail,
      accountName: input.accountName,
      role: input.role,
    });
    return { ok: false, reason: "email_provider_error" };
  }

  return { ok: true };
}

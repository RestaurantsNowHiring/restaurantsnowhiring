import { absoluteUrl } from "./seo";
import type { EmployerRole } from "./employerAccounts";

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

function normalizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailHtml(input: TeamInviteEmailInput) {
  const accountName = escapeHtml(normalizeText(input.accountName, "an employer account"));
  const roleLabel = escapeHtml(ROLE_LABELS[input.role]);
  const inviterEmail = input.inviterEmail?.trim() ? escapeHtml(input.inviterEmail.trim()) : "your account owner";
  const loginUrl = absoluteUrl("/employer-login");
  const escapedLoginUrl = escapeHtml(loginUrl);
  const invitedEmail = escapeHtml(input.toEmail);

  return `
  <div style="margin:0;padding:0;background:#f6f5f3;font-family:Inter,Arial,sans-serif;color:#1f1f1f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5f3;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid rgba(0,0,0,.10);border-radius:22px;overflow:hidden;box-shadow:0 18px 40px rgba(0,0,0,.08);">
            <tr>
              <td style="background:#35806e;color:#ffffff;padding:22px 24px;">
                <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;opacity:.9;">Restaurants Now Hiring</div>
                <div style="font-size:28px;line-height:1.1;font-weight:900;margin-top:6px;">You’ve been invited</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;font-weight:700;color:rgba(0,0,0,.72);">${inviterEmail} invited you to join ${accountName} on Restaurants Now Hiring.</p>
                <div style="border:1px solid rgba(53,128,110,.18);background:rgba(53,128,110,.08);border-radius:18px;padding:18px;margin:18px 0;">
                  <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#35806e;">Employer account</div>
                  <div style="font-size:22px;line-height:1.25;font-weight:900;color:#202020;margin-top:6px;">${accountName}</div>
                  <div style="font-size:15px;line-height:1.5;font-weight:700;color:rgba(0,0,0,.68);margin-top:8px;">Access level: ${roleLabel}</div>
                </div>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;font-weight:700;color:rgba(0,0,0,.68);">Use ${invitedEmail} when you create an account or sign in. If you already have an account with this email, sign in and your team access will be applied automatically.</p>
                <a href="${escapedLoginUrl}" style="display:inline-block;background:#35806e;color:#ffffff;text-decoration:none;border-radius:14px;padding:14px 18px;font-size:15px;font-weight:900;">Sign up or log in</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px;border-top:1px solid rgba(0,0,0,.08);font-size:12px;line-height:1.5;color:rgba(0,0,0,.55);font-weight:700;">
                This invitation was sent because an Account Owner added ${invitedEmail} to ${accountName}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function buildEmailText(input: TeamInviteEmailInput) {
  const accountName = normalizeText(input.accountName, "an employer account");
  const inviter = input.inviterEmail?.trim() || "your account owner";

  return [
    "Restaurants Now Hiring",
    SUBJECT,
    "",
    `${inviter} invited you to join ${accountName}.`,
    `Access level: ${ROLE_LABELS[input.role]}`,
    "",
    `Use ${input.toEmail} when you create an account or sign in. If you already have an account with this email, sign in and your team access will be applied automatically.`,
    "",
    `Sign up or log in: ${absoluteUrl("/employer-login")}`,
  ].join("\n");
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

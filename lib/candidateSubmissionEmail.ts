import { buildBrandedEmailHtml, escapeHtml } from "./emailTemplates";

type CandidateSubmissionEmailJob = {
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
};

type CandidateSubmissionEmailSubmission = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  message: string | null;
  created_at: string;
};

type CandidateSubmissionEmailInput = {
  submission: CandidateSubmissionEmailSubmission;
  job: CandidateSubmissionEmailJob;
  dashboardUrl: string;
  resumeUrl?: string;
};

const EMAIL_COLORS = {
  green: "#35806e",
  darkGreen: "#276455",
  warmCard: "#fffaf1",
  ink: "#1f2a26",
  muted: "#5f6f67",
  border: "#dfe6dc",
  white: "#ffffff",
};

function formatSubmittedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just submitted";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(date);
}

function formatRestaurantLocation(job: CandidateSubmissionEmailJob) {
  const cityState = [job.city, job.state].filter(Boolean).join(", ");
  return [job.restaurant_name, cityState].filter(Boolean).join(" — ") || "Restaurant location not provided";
}

function formatRoleLocation(job: CandidateSubmissionEmailJob) {
  return `${job.title} • ${formatRestaurantLocation(job)}`;
}

function renderDetailRows(rows: Array<{ label: string; value: string; href?: string }>) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${rows
        .map((row, index) => {
          const border = index === 0 ? "" : `border-top:1px solid ${EMAIL_COLORS.border};`;
          const valueHtml = row.href
            ? `<a href="${escapeHtml(row.href)}" style="color:${EMAIL_COLORS.darkGreen};font-weight:900;text-decoration:underline;word-break:break-word;">${escapeHtml(row.value)}</a>`
            : escapeHtml(row.value);

          return `
            <tr>
              <td style="${border}padding:13px 0 13px 0;font-size:12px;line-height:1.35;letter-spacing:.08em;text-transform:uppercase;font-weight:900;color:${EMAIL_COLORS.muted};vertical-align:top;width:34%;">${escapeHtml(row.label)}</td>
              <td style="${border}padding:13px 0 13px 16px;font-size:15px;line-height:1.45;font-weight:850;color:${EMAIL_COLORS.ink};vertical-align:top;text-align:right;word-break:break-word;">${valueHtml}</td>
            </tr>`;
        })
        .join("")}
    </table>`;
}

function renderSection(title: string, contentHtml: string) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:18px 0 0;background:${EMAIL_COLORS.white};border:1px solid ${EMAIL_COLORS.border};border-radius:18px;overflow:hidden;">
      <tr>
        <td style="padding:18px 20px 0;">
          <div style="font-size:13px;line-height:1.35;letter-spacing:.11em;text-transform:uppercase;font-weight:950;color:${EMAIL_COLORS.green};">${escapeHtml(title)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 20px 18px;">
          ${contentHtml}
        </td>
      </tr>
    </table>`;
}

function renderCandidateSummary(input: CandidateSubmissionEmailInput) {
  const { submission, job } = input;

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:28px 0 0;background:${EMAIL_COLORS.white};border:1px solid rgba(53,128,110,.22);border-radius:22px;overflow:hidden;box-shadow:0 14px 30px rgba(31,42,38,.08);">
      <tr>
        <td style="padding:22px 22px 20px;text-align:center;">
          <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(53,128,110,.12);color:${EMAIL_COLORS.darkGreen};font-size:12px;line-height:1.2;letter-spacing:.12em;text-transform:uppercase;font-weight:950;">New Candidate</div>
          <h2 style="margin:14px 0 0;font-size:28px;line-height:1.1;letter-spacing:-.03em;font-weight:950;color:${EMAIL_COLORS.ink};">${escapeHtml(submission.candidate_name)}</h2>
          <p style="margin:9px auto 0;max-width:460px;font-size:15px;line-height:1.55;font-weight:800;color:${EMAIL_COLORS.muted};">${escapeHtml(formatRoleLocation(job))}</p>
        </td>
      </tr>
    </table>`;
}

function renderResumeCta(input: CandidateSubmissionEmailInput) {
  const href = input.resumeUrl || input.dashboardUrl;

  return renderSection(
    "Resume CTA",
    `<p style="margin:10px 0 16px;font-size:15px;line-height:1.6;font-weight:750;color:${EMAIL_COLORS.muted};">Open the employer dashboard to securely view the candidate’s uploaded resume and manage their status.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0;">
      <tr>
        <td align="center" style="border-radius:999px;background:${EMAIL_COLORS.warmCard};border:1px solid rgba(53,128,110,.35);">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;border-radius:999px;color:${EMAIL_COLORS.darkGreen};font-size:14px;line-height:1.2;font-weight:950;text-decoration:none;">View Resume</a>
        </td>
      </tr>
    </table>`,
  );
}

export function buildCandidateSubmissionEmailHtml(input: CandidateSubmissionEmailInput) {
  const { submission, job, dashboardUrl, resumeUrl } = input;

  const candidateInfo = renderSection(
    "Candidate Information",
    renderDetailRows([
      { label: "Name", value: submission.candidate_name },
      { label: "Email", value: submission.candidate_email, href: `mailto:${submission.candidate_email}` },
      { label: "Phone", value: submission.candidate_phone, href: `tel:${submission.candidate_phone}` },
      { label: "Submitted", value: formatSubmittedAt(submission.created_at) },
    ]),
  );

  const jobInfo = renderSection(
    "Job Information",
    renderDetailRows([
      { label: "Role", value: job.title },
      { label: "Location", value: formatRestaurantLocation(job) },
    ]),
  );

  const candidateMessage = renderSection(
    "Candidate Message",
    `<p style="margin:10px 0 0;font-size:15px;line-height:1.7;font-weight:750;color:${EMAIL_COLORS.ink};white-space:pre-wrap;">${escapeHtml(submission.message || "No message included.")}</p>`,
  );

  return buildBrandedEmailHtml({
    preheader: `${submission.candidate_name} is interested in ${job.title}.`,
    eyebrow: "Restaurant Hiring Platform",
    title: "New candidate interested in your job ad",
    intro: `${submission.candidate_name} just submitted their contact information for ${job.title}.`,
    bodyHtml: `${renderCandidateSummary(input)}${candidateInfo}${jobInfo}${candidateMessage}${renderResumeCta(input)}`,
    cta: {
      label: "Open Employer Dashboard",
      href: dashboardUrl,
    },
    secondaryCta: resumeUrl
      ? {
          label: "View Resume",
          href: resumeUrl,
        }
      : undefined,
    footerNote: "Hiring built for restaurants.",
  });
}

export function buildCandidateSubmissionEmailText(input: CandidateSubmissionEmailInput) {
  const { submission, job, dashboardUrl, resumeUrl } = input;

  return [
    "RestaurantsNOWHiring.com",
    "Restaurant Hiring Platform",
    "",
    "New candidate interested in your job ad",
    "New Candidate",
    "",
    `Candidate name: ${submission.candidate_name}`,
    `Candidate email: ${submission.candidate_email}`,
    `Candidate phone: ${submission.candidate_phone}`,
    `Submitted: ${formatSubmittedAt(submission.created_at)}`,
    "",
    `Job title: ${job.title}`,
    `Restaurant/location: ${formatRestaurantLocation(job)}`,
    "",
    "Candidate message:",
    submission.message || "No message included.",
    "",
    `Open Employer Dashboard: ${dashboardUrl}`,
    resumeUrl ? `View Resume: ${resumeUrl}` : `View Resume: ${dashboardUrl}`,
    "",
    "Hiring built for restaurants.",
  ].join("\n");
}

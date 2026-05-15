import { NextResponse } from "next/server";
import { getSiteUrl } from "../../../../../lib/billing";
import { isPubliclyVisibleJob } from "../../../../../lib/jobStatus";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

const RESUME_BUCKET = "candidate-resumes";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_RESUME_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

type RouteContext = { params: { id?: string } | Promise<{ id?: string }> };

type JobRow = {
  id: string;
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  active: boolean;
  status?: string | null;
  employer_user_id: string | null;
  employer_email: string | null;
  employer_account_id?: string | null;
  apply_email?: string | null;
  candidate_notification_email?: string | null;
  candidate_notification_routing?: string | null;
  posted_by_email?: string | null;
  employer_accounts?: { owner_email?: string | null; support_email?: string | null; default_candidate_notification_routing?: string | null } | null;
};

function cleanString(value: FormDataEntryValue | null, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "resume";
}

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatLocation(job: JobRow) {
  return [job.restaurant_name, [job.city, job.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") || "—";
}

function buildEmailText(input: { submission: CandidateSubmissionRow; job: JobRow; dashboardUrl: string }) {
  const { submission, job, dashboardUrl } = input;
  return [
    "New candidate interested in your job ad",
    "",
    `Candidate name: ${submission.candidate_name}`,
    `Candidate email: ${submission.candidate_email}`,
    `Candidate phone: ${submission.candidate_phone}`,
    `Job title: ${job.title}`,
    `Restaurant/location: ${formatLocation(job)}`,
    `Optional message: ${submission.message || "—"}`,
    "",
    `View candidates: ${dashboardUrl}`,
  ].join("\n");
}

function buildEmailHtml(input: { submission: CandidateSubmissionRow; job: JobRow; dashboardUrl: string }) {
  const { submission, job, dashboardUrl } = input;
  const rows = [
    ["Candidate name", submission.candidate_name],
    ["Candidate email", submission.candidate_email],
    ["Candidate phone", submission.candidate_phone],
    ["Job title", job.title],
    ["Restaurant/location", formatLocation(job)],
    ["Optional message", submission.message || "—"],
  ];

  return `
    <h2>New candidate interested in your job ad</h2>
    <table style="border-collapse:collapse;width:100%;max-width:720px">
      ${rows
        .map(
          ([label, value]) => `
            <tr>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;background:#f7f7f7;width:170px">${escapeHtml(label)}</th>
              <td style="border:1px solid #ddd;padding:8px;white-space:pre-wrap">${escapeHtml(value)}</td>
            </tr>
          `,
        )
        .join("")}
    </table>
    <p><a href="${escapeHtml(dashboardUrl)}">Open employer dashboard candidates</a></p>
  `;
}

type CandidateSubmissionRow = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  message: string | null;
  created_at: string;
};

function resolveCandidateNotificationEmail(job: JobRow) {
  const routing = job.candidate_notification_routing || job.employer_accounts?.default_candidate_notification_routing || "job_poster";
  const candidates =
    routing === "account_owner"
      ? [job.employer_accounts?.owner_email, job.employer_email, job.apply_email]
      : routing === "company_support"
        ? [job.employer_accounts?.support_email, job.apply_email, job.employer_email]
        : routing === "custom_job_email"
          ? [job.candidate_notification_email, job.apply_email, job.employer_email]
          : [job.posted_by_email, job.apply_email, job.employer_email];

  return candidates.find((candidate) => typeof candidate === "string" && EMAIL_PATTERN.test(candidate.trim()))?.trim().toLowerCase() ?? "";
}

async function sendEmployerNotification(input: { to: string; submission: CandidateSubmissionRow; job: JobRow }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false as const, reason: "missing_resend_api_key" };

  const fromEmail = process.env.CANDIDATE_NOTIFICATION_FROM ?? process.env.CONTACT_NOTIFICATION_FROM ?? "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";
  const dashboardUrl = `${getSiteUrl()}/employer-dashboard#interested-candidates`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: input.to,
      subject: "New candidate interested in your job ad",
      reply_to: input.submission.candidate_email,
      text: buildEmailText({ ...input, dashboardUrl }),
      html: buildEmailHtml({ ...input, dashboardUrl }),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Candidate employer notification failed", { status: response.status, details, submissionId: input.submission.id });
    return { ok: false as const, reason: "email_provider_error" };
  }

  return { ok: true as const };
}

export async function POST(request: Request, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const jobId = params.id?.trim();
  if (!jobId) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Candidate submissions are not configured yet." }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });

  const candidateName = cleanString(formData.get("fullName"), 160);
  const candidateEmail = cleanString(formData.get("email"), 254).toLowerCase();
  const candidatePhone = cleanString(formData.get("phone"), 40);
  const message = cleanString(formData.get("message"), 2000) || null;
  const resume = formData.get("resume");

  if (!candidateName || !candidateEmail || !candidatePhone) {
    return NextResponse.json({ error: "Please fill out your name, email, phone number, and resume." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(candidateEmail)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!(resume instanceof File) || resume.size === 0) {
    return NextResponse.json({ error: "Please upload your resume as a PDF, DOC, or DOCX file." }, { status: 400 });
  }
  if (resume.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume files must be 5MB or smaller." }, { status: 400 });
  }

  const resumeExtension = getExtension(resume.name);
  if (!ALLOWED_RESUME_EXTENSIONS.has(resumeExtension) || !ALLOWED_RESUME_MIME_TYPES.has(resume.type)) {
    return NextResponse.json({ error: "Resume must be a PDF, DOC, or DOCX file." }, { status: 400 });
  }

  const { data: jobData, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id,title,restaurant_name,city,state,active,status,employer_user_id,employer_email,employer_account_id,apply_email,candidate_notification_email,candidate_notification_routing,posted_by_email,employer_accounts(owner_email,support_email,default_candidate_notification_routing)")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("Candidate submission job lookup failed", { jobError, jobId });
    return NextResponse.json({ error: "Could not confirm this job is active." }, { status: 500 });
  }

  const job = jobData as JobRow | null;
  if (!job || !isPubliclyVisibleJob(job.status, job.active)) {
    return NextResponse.json({ error: "This job is no longer accepting candidate submissions." }, { status: 404 });
  }

  const employerEmail = resolveCandidateNotificationEmail(job);
  if (!job.employer_user_id && !employerEmail) {
    return NextResponse.json({ error: "This employer is missing contact details." }, { status: 400 });
  }

  const objectPath = `${job.id}/${crypto.randomUUID()}-${safeFilename(resume.name)}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(RESUME_BUCKET)
    .upload(objectPath, resume, { contentType: resume.type, upsert: false });

  if (uploadError) {
    console.error("Candidate resume upload failed", { uploadError, jobId });
    return NextResponse.json({ error: "Could not upload your resume. Please try again." }, { status: 500 });
  }

  const { data: submissionData, error: insertError } = await supabaseAdmin
    .from("candidate_submissions")
    .insert({
      job_id: job.id,
      employer_user_id: job.employer_user_id,
      employer_email: employerEmail || job.employer_email,
      employer_account_id: job.employer_account_id ?? null,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      candidate_phone: candidatePhone,
      message,
      resume_path: objectPath,
      resume_filename: resume.name,
      resume_mime_type: resume.type,
      status: "new",
    })
    .select("id,candidate_name,candidate_email,candidate_phone,message,created_at")
    .single();

  if (insertError || !submissionData) {
    await supabaseAdmin.storage.from(RESUME_BUCKET).remove([objectPath]);
    console.error("Candidate submission insert failed", { insertError, jobId });
    return NextResponse.json({ error: "Could not save your information. Please try again." }, { status: 500 });
  }

  const submission = submissionData as CandidateSubmissionRow;
  if (employerEmail) {
    const emailResult = await sendEmployerNotification({ to: employerEmail, submission, job });
    if (!emailResult.ok) {
      console.error("Candidate submission stored without employer email", { submissionId: submission.id, reason: emailResult.reason });
    }
  }

  return NextResponse.json({ ok: true, submissionId: submission.id });
}

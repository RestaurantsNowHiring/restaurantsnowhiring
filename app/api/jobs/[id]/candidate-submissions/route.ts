import { NextResponse } from "next/server";
import { getSiteUrl } from "../../../../../lib/billing";
import { isPubliclyVisibleJob } from "../../../../../lib/jobStatus";
import { buildCandidateSubmissionEmailHtml, buildCandidateSubmissionEmailText } from "../../../../../lib/candidateSubmissionEmail";
import { EMAIL_PATTERN, normalizeCandidateNotificationEmails } from "../../../../../lib/candidateNotificationEmails";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";

const RESUME_BUCKET = "candidate-resumes";
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
  candidate_notification_emails?: string[] | null;
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

type CandidateSubmissionRow = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  message: string | null;
  created_at: string;
};

function resolveCandidateNotificationEmails(job: JobRow) {
  const routing = job.candidate_notification_routing || job.employer_accounts?.default_candidate_notification_routing || "job_poster";
  const customEmails = normalizeCandidateNotificationEmails(
    job.candidate_notification_emails?.length ? job.candidate_notification_emails : job.candidate_notification_email,
  ).filter((email) => EMAIL_PATTERN.test(email));

  const fallbackCandidates =
    routing === "account_owner"
      ? [job.employer_accounts?.owner_email, job.employer_email, job.apply_email]
      : routing === "company_support"
        ? [job.employer_accounts?.support_email, job.apply_email, job.employer_email]
        : routing === "custom_job_email"
          ? [job.apply_email, job.employer_email]
          : [job.posted_by_email, job.apply_email, job.employer_email];

  const fallbackEmail = fallbackCandidates.find((candidate) => typeof candidate === "string" && EMAIL_PATTERN.test(candidate.trim()))?.trim().toLowerCase();
  if (routing === "custom_job_email" && customEmails.length > 0) return customEmails;
  return fallbackEmail ? [fallbackEmail] : [];
}

async function sendEmployerNotification(input: { to: string[]; submission: CandidateSubmissionRow; job: JobRow }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { ok: false as const, reason: "missing_resend_api_key" };

  try {
    const fromEmail = process.env.CANDIDATE_NOTIFICATION_FROM ?? process.env.CONTACT_NOTIFICATION_FROM ?? "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";
    const dashboardUrl = `${getSiteUrl()}/employer-dashboard#interested-candidates`;
    const resumeUrl = `${getSiteUrl()}/employer-dashboard#candidate-${encodeURIComponent(input.submission.id)}`;
    const emailContent = { ...input, dashboardUrl, resumeUrl };
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
        text: buildCandidateSubmissionEmailText(emailContent),
        html: buildCandidateSubmissionEmailHtml(emailContent),
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("Candidate employer notification failed", { status: response.status, details, submissionId: input.submission.id });
      return { ok: false as const, reason: "email_provider_error" };
    }

    return { ok: true as const };
  } catch (error) {
    console.error("Candidate employer notification rendering or sending failed", {
      error,
      submissionId: input.submission.id,
      jobId: input.job.id,
      to: input.to,
    });
    return { ok: false as const, reason: "email_render_or_send_error" };
  }
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
    .select("id,title,restaurant_name,city,state,active,status,employer_user_id,employer_email,employer_account_id,apply_email,candidate_notification_email,candidate_notification_emails,candidate_notification_routing,posted_by_email,employer_accounts(owner_email,support_email,default_candidate_notification_routing)")
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

  const employerEmails = resolveCandidateNotificationEmails(job);
  const primaryEmployerEmail = employerEmails[0] ?? job.employer_email ?? "";
  if (!job.employer_user_id && employerEmails.length === 0) {
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
      employer_email: primaryEmployerEmail,
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
  if (employerEmails.length > 0) {
    const emailResult = await sendEmployerNotification({ to: employerEmails, submission, job });
    if (!emailResult.ok) {
      console.error("Candidate submission stored without employer email", {
        submissionId: submission.id,
        jobId: job.id,
        recipients: employerEmails,
        reason: emailResult.reason,
      });
    }
  }

  return NextResponse.json({ ok: true, submissionId: submission.id });
}

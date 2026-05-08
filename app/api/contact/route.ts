import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabaseAdmin";

const CONTACT_NOTIFICATION_TO = "team@restaurantsnowhiring.com";
const CONTACT_NOTIFICATION_SUBJECT = "New RestaurantsNowHiring.com Contact Inquiry";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTHS = {
  name: 160,
  email: 254,
  subject: 200,
  message: 5000,
};

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
};

type ContactInquiryRow = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
};

type ContactInsertAttempt = {
  tableName: "contact_inquiries" | "contact_messages";
  includeSubject: boolean;
};

function sanitizeField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateContactPayload(payload: ContactPayload | null) {
  const name = sanitizeField(payload?.name);
  const email = sanitizeField(payload?.email).toLowerCase();
  const subject = sanitizeField(payload?.subject);
  const message = sanitizeField(payload?.message);

  if (!name || !email || !subject || !message) {
    return {
      ok: false as const,
      error: "Please fill out your name, email, subject, and message.",
    };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false as const, error: "Please enter a valid email address." };
  }

  if (
    name.length > MAX_FIELD_LENGTHS.name ||
    email.length > MAX_FIELD_LENGTHS.email ||
    subject.length > MAX_FIELD_LENGTHS.subject ||
    message.length > MAX_FIELD_LENGTHS.message
  ) {
    return {
      ok: false as const,
      error: "Please shorten your message and try again.",
    };
  }

  return { ok: true as const, inquiry: { name, email, subject, message } };
}

function isMissingTableOrColumnError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("could not find the table") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

function formatSubmittedAt(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function buildEmailHtml(inquiry: ContactInquiryRow) {
  const submittedAt = formatSubmittedAt(inquiry.created_at);
  const rows = [
    ["Name", inquiry.name],
    ["Email", inquiry.email],
    ["Subject", inquiry.subject ?? "—"],
    ["Submitted", `${submittedAt} UTC`],
    ["Message", inquiry.message],
  ];

  return `
    <h2>${CONTACT_NOTIFICATION_SUBJECT}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:720px">
      ${rows
        .map(
          ([label, value]) => `
            <tr>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;background:#f7f7f7;width:140px">${escapeHtml(label)}</th>
              <td style="border:1px solid #ddd;padding:8px;white-space:pre-wrap">${escapeHtml(value)}</td>
            </tr>
          `,
        )
        .join("")}
    </table>
  `;
}

function buildEmailText(inquiry: ContactInquiryRow) {
  return [
    CONTACT_NOTIFICATION_SUBJECT,
    "",
    `Name: ${inquiry.name}`,
    `Email: ${inquiry.email}`,
    `Subject: ${inquiry.subject ?? "—"}`,
    `Submitted: ${formatSubmittedAt(inquiry.created_at)} UTC`,
    "",
    "Message:",
    inquiry.message,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendContactNotification(inquiry: ContactInquiryRow) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_NOTIFICATION_FROM ?? "Restaurants Now Hiring <notifications@restaurantsnowhiring.com>";

  if (!resendApiKey) {
    return { ok: false as const, reason: "missing_resend_api_key" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: CONTACT_NOTIFICATION_TO,
      subject: CONTACT_NOTIFICATION_SUBJECT,
      reply_to: inquiry.email,
      text: buildEmailText(inquiry),
      html: buildEmailHtml(inquiry),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Contact inquiry email notification failed", {
      status: response.status,
      details,
      inquiryId: inquiry.id,
    });
    return { ok: false as const, reason: "email_provider_error" };
  }

  return { ok: true as const };
}

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as ContactPayload | null;
  const validation = validateContactPayload(payload);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Contact form is not configured. Please try again later." },
      { status: 500 },
    );
  }

  const attempts: ContactInsertAttempt[] = [
    { tableName: "contact_inquiries", includeSubject: true },
    { tableName: "contact_messages", includeSubject: true },
    { tableName: "contact_messages", includeSubject: false },
  ];

  let lastError: { message?: string; code?: string } | null = null;

  for (const attempt of attempts) {
    const insertPayload = attempt.includeSubject
      ? validation.inquiry
      : {
          name: validation.inquiry.name,
          email: validation.inquiry.email,
          message: validation.inquiry.message,
        };

    const selectFields = attempt.includeSubject
      ? "id,name,email,subject,message,created_at"
      : "id,name,email,message,created_at";

    const { data, error } = await supabaseAdmin
      .from(attempt.tableName)
      .insert(insertPayload)
      .select(selectFields)
      .single();

    if (!error && data) {
      const row = data as unknown as Record<string, unknown>;
      const inquiry = {
        id: String(row.id),
        name: String(row.name),
        email: String(row.email),
        subject:
          typeof row.subject === "string"
            ? row.subject
            : validation.inquiry.subject,
        message: String(row.message),
        created_at: String(row.created_at),
      } satisfies ContactInquiryRow;

      const emailResult = await sendContactNotification(inquiry);
      if (!emailResult.ok) {
        console.error("Contact inquiry was stored, but notification was not sent", {
          inquiryId: inquiry.id,
          reason: emailResult.reason,
        });
      }

      return NextResponse.json({ ok: true, inquiryId: inquiry.id });
    }

    lastError = error;

    if (!error || !isMissingTableOrColumnError(error)) {
      break;
    }
  }

  console.error("Contact inquiry storage failed", lastError);

  return NextResponse.json(
    {
      error:
        "We could not save your message. Please email team@restaurantsnowhiring.com directly.",
    },
    { status: 500 },
  );
}

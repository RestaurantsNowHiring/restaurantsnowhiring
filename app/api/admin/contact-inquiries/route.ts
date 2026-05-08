import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, getAdminUserFromAccessToken } from "../../../../lib/adminAuth";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type ContactInquiry = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  message: string | null;
  created_at: string;
  status: string | null;
  is_read: boolean | null;
};

type ContactQueryAttempt = {
  tableName: "contact_inquiries" | "contact_messages";
  fields: string;
};

async function requireAdmin() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const adminCheck = await getAdminUserFromAccessToken(accessToken);
  if (!adminCheck.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unauthorized." },
        { status: adminCheck.code === "not_admin" ? 403 : 401 },
      ),
    };
  }

  return { ok: true as const };
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

function normalizeRows(rows: Array<Record<string, unknown>>): ContactInquiry[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    name: typeof row.name === "string" ? row.name : null,
    email: typeof row.email === "string" ? row.email : null,
    subject: typeof row.subject === "string" ? row.subject : null,
    message: typeof row.message === "string" ? row.message : null,
    created_at: String(row.created_at ?? ""),
    status: typeof row.status === "string" ? row.status : null,
    is_read: typeof row.is_read === "boolean" ? row.is_read : null,
  }));
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role environment variable is missing." },
      { status: 500 },
    );
  }

  const attempts: ContactQueryAttempt[] = [
    {
      tableName: "contact_inquiries",
      fields: "id,name,email,subject,message,created_at,status,is_read",
    },
    {
      tableName: "contact_inquiries",
      fields: "id,name,email,subject,message,created_at",
    },
    {
      tableName: "contact_messages",
      fields: "id,name,email,subject,message,created_at,status,is_read",
    },
    {
      tableName: "contact_messages",
      fields: "id,name,email,subject,message,created_at",
    },
    {
      tableName: "contact_messages",
      fields: "id,name,email,message,created_at",
    },
  ];

  let lastError: { message?: string; code?: string } | null = null;

  for (const attempt of attempts) {
    const { data, error } = await supabaseAdmin
      .from(attempt.tableName)
      .select(attempt.fields)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error) {
      return NextResponse.json({
        inquiries: normalizeRows(((data ?? []) as unknown) as Array<Record<string, unknown>>),
        source: attempt.tableName,
      });
    }

    lastError = error;
    if (!isMissingTableOrColumnError(error)) break;
  }

  console.error("Admin contact inquiry load failed", lastError);
  return NextResponse.json(
    {
      error:
        "No readable contact inquiry table was found. Apply supabase/policies/contact-inquiries.sql in Supabase.",
    },
    { status: 500 },
  );
}

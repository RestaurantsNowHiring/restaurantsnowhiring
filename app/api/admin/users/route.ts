import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  getAdminAllowlist,
  getAdminUserFromAccessToken,
  normalizeAdminEmail,
} from "../../../../lib/adminAuth";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminUserRow = {
  email: string;
  created_at: string | null;
  created_by_email: string | null;
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

  return { ok: true as const, admin: adminCheck };
}

function formatAllowlistAdmins() {
  return getAdminAllowlist().map((email) => ({
    email,
    source: "bootstrap" as const,
    created_at: null,
    created_by_email: null,
  }));
}

async function listAdminUsers() {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return {
      rows: [] as AdminUserRow[],
      error: "Supabase service role is not configured on the server.",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("email,created_at,created_by_email")
    .order("created_at", { ascending: true });

  if (error) {
    return {
      rows: [] as AdminUserRow[],
      error: error.message || "Could not load admin users.",
    };
  }

  return { rows: (data ?? []) as AdminUserRow[], error: null };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { rows, error } = await listAdminUsers();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const bootstrapAdmins = formatAllowlistAdmins();
  const bootstrapEmails = new Set(
    bootstrapAdmins.map((adminUser) => adminUser.email),
  );
  const databaseAdmins = rows
    .filter((row) => !bootstrapEmails.has(row.email))
    .map((row) => ({
      email: row.email,
      source: "database" as const,
      created_at: row.created_at,
      created_by_email: row.created_by_email,
    }));

  return NextResponse.json({ admins: [...bootstrapAdmins, ...databaseAdmins] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await req.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = normalizeAdminEmail(body?.email);

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid admin email address." },
      { status: 400 },
    );
  }

  if (getAdminAllowlist().includes(email)) {
    return NextResponse.json(
      { error: "That email is already a bootstrap admin." },
      { status: 409 },
    );
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 },
    );
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("admin_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message || "Could not check admin user." },
      { status: 500 },
    );
  }

  if (existing?.email) {
    return NextResponse.json(
      { error: "That email is already an admin." },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .insert({ email, created_by_email: admin.admin.email })
    .select("email,created_at,created_by_email")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not add admin user." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { admin: { ...data, source: "database" } },
    { status: 201 },
  );
}

import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type EmployerProfileRow = {
  user_id: string;
  login_email: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  support_email: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  jobs_open: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LatestEmployerJob = {
  restaurant_name: string | null;
  apply_email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  employer_user_id: string | null;
  employer_email: string | null;
};

const SAFE_PROFILE_FIELDS = [
  "company_name",
  "contact_name",
  "phone",
  "address",
  "city",
  "state",
  "postal_code",
  "support_email",
] as const;

type SafeProfileField = (typeof SAFE_PROFILE_FIELDS)[number];

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(" ") || null;
}

function profileFromMetadata(userId: string, email: string, metadata: Record<string, unknown>): EmployerProfileRow {
  const firstName = cleanString(metadata.first_name, 120);
  const lastName = cleanString(metadata.last_name, 120);

  return {
    user_id: userId,
    login_email: email,
    company_name: cleanString(metadata.company_name, 180),
    contact_name: fullName(firstName, lastName),
    phone: cleanString(metadata.phone, 40),
    address: cleanString(metadata.address, 220),
    city: cleanString(metadata.city, 120),
    state: cleanString(metadata.state, 40),
    postal_code: cleanString(metadata.postal_code, 24),
    support_email: cleanString(metadata.support_email, 180),
    first_name: firstName,
    last_name: lastName,
    job_title: cleanString(metadata.job_title, 160),
    jobs_open: cleanString(metadata.jobs_open, 40),
  };
}

function mergeFallbacks(base: EmployerProfileRow, latestJob: LatestEmployerJob | null) {
  return {
    ...base,
    company_name: base.company_name ?? latestJob?.restaurant_name ?? null,
    support_email: base.support_email ?? latestJob?.apply_email ?? null,
    address: base.address ?? latestJob?.address ?? null,
    city: base.city ?? latestJob?.city ?? null,
    state: base.state ?? latestJob?.state ?? null,
  };
}

async function loadLatestEmployerJob(userId: string, email: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const [userIdResult, emailResult] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select("restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at")
      .eq("employer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("jobs")
      .select("restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at")
      .eq("employer_email", email)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const error = userIdResult.error ?? emailResult.error;
  if (error) throw new Error(error.message || "Could not load employer job fallback details.");

  const rows = [...(userIdResult.data ?? []), ...(emailResult.data ?? [])];
  rows.sort((a, b) => new Date(String(b.created_at ?? "")).getTime() - new Date(String(a.created_at ?? "")).getTime());

  return (rows[0] ?? null) as LatestEmployerJob | null;
}

async function getEmployerProfile(userId: string, email: string, metadata: Record<string, unknown>) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

  const [{ data: row, error }, latestJob] = await Promise.all([
    supabaseAdmin
      .from("employer_profiles")
      .select(
        "user_id,login_email,company_name,contact_name,phone,address,city,state,postal_code,support_email,first_name,last_name,job_title,jobs_open,created_at,updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    loadLatestEmployerJob(userId, email),
  ]);

  if (error) throw new Error(error.message || "Could not load employer profile.");

  const metadataProfile = profileFromMetadata(userId, email, metadata);
  return mergeFallbacks(row ? { ...metadataProfile, ...row, login_email: email } : metadataProfile, latestJob);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(user.id);
    if (authUserError) throw new Error(authUserError.message || "Could not load auth user metadata.");

    const profile = await getEmployerProfile(user.id, user.email, authUserData.user?.user_metadata ?? {});
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Employer profile load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Employer profile load failed." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const safeUpdate = SAFE_PROFILE_FIELDS.reduce<Record<SafeProfileField, string | null>>((acc, field) => {
      const maxLength = field === "address" ? 220 : field === "support_email" || field === "company_name" ? 180 : 120;
      acc[field] = cleanString(payload[field], maxLength);
      return acc;
    }, {} as Record<SafeProfileField, string | null>);

    if (safeUpdate.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeUpdate.support_email)) {
      return NextResponse.json({ error: "Enter a valid support/contact email address." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("employer_profiles")
      .upsert(
        {
          user_id: user.id,
          login_email: user.email,
          ...safeUpdate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(
        "user_id,login_email,company_name,contact_name,phone,address,city,state,postal_code,support_email,first_name,last_name,job_title,jobs_open,created_at,updated_at",
      )
      .single();

    if (error) throw new Error(error.message || "Could not save employer profile.");

    return NextResponse.json({ profile: { ...data, login_email: user.email } });
  } catch (error) {
    console.error("Employer profile save failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Employer profile save failed." },
      { status: 500 },
    );
  }
}

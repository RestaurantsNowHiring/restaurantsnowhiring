import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import {
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
} from "../../../../lib/employerAccounts";

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
  company_short_description?: string | null;
  company_description?: string | null;
  company_website?: string | null;
  company_logo_url?: string | null;
  company_cover_image_url?: string | null;
  headquarters?: string | null;
  location_count?: number | null;
  benefits_summary?: string | null;
  benefits_list?: string | null;
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

const SAFE_ACCOUNT_FIELDS = [
  "company_short_description",
  "company_description",
  "company_website",
  "company_logo_url",
  "company_cover_image_url",
  "headquarters",
  "location_count",
  "benefits_summary",
  "benefits_list",
] as const;

type SafeProfileField = (typeof SAFE_PROFILE_FIELDS)[number];
type SafeAccountField = (typeof SAFE_ACCOUNT_FIELDS)[number];

const ACCOUNT_PROFILE_SELECT =
"company_short_description,company_description,company_website,company_logo_url,company_cover_image_url,headquarters,location_count,benefits_summary,benefits_list";

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return (
    [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(" ") ||
    null
  );
}

function profileFromMetadata(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
): EmployerProfileRow {
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

function mergeFallbacks(
  base: EmployerProfileRow,
  latestJob: LatestEmployerJob | null,
) {
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
  if (!supabaseAdmin) {
    throw new Error("Supabase service role is not configured on the server.");
  }

  const [userIdResult, emailResult] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select(
        "restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at",
      )
      .eq("employer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from("jobs")
      .select(
        "restaurant_name,apply_email,address,city,state,employer_user_id,employer_email,created_at",
      )
      .eq("employer_email", email)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const error = userIdResult.error ?? emailResult.error;
  if (error) {
    throw new Error(error.message || "Could not load employer job fallback details.");
  }

  const rows = [...(userIdResult.data ?? []), ...(emailResult.data ?? [])];
  rows.sort(
    (a, b) =>
      new Date(String(b.created_at ?? "")).getTime() -
      new Date(String(a.created_at ?? "")).getTime(),
  );

  return (rows[0] ?? null) as LatestEmployerJob | null;
}

async function getEmployerProfile(
  userId: string,
  email: string,
  metadata: Record<string, unknown>,
) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Supabase service role is not configured on the server.");
  }

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

  return mergeFallbacks(
    row ? { ...metadataProfile, ...row, login_email: email } : metadataProfile,
    latestJob,
  );
}

async function loadEmployerAccountProfile(accountId: string) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    throw new Error("Supabase service role is not configured on the server.");
  }

  const { data, error } = await supabaseAdmin
    .from("employer_accounts")
    .select(ACCOUNT_PROFILE_SELECT)
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Could not load company profile fields.");
  return data ?? {};
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      throw new Error("Supabase service role is not configured on the server.");
    }

    const context = await getEmployerAccountContext(
      user,
      getSelectedEmployerAccountIdFromRequest(request),
    );
    const profileUserId = context.ownerUserId;
    const profileEmail = context.ownerEmail;

    const { data: authUserData, error: authUserError } =
      await supabaseAdmin.auth.admin.getUserById(profileUserId);

    if (authUserError) {
      throw new Error(authUserError.message || "Could not load auth user metadata.");
    }

    const [profile, accountProfile] = await Promise.all([
      getEmployerProfile(
        profileUserId,
        profileEmail,
        authUserData.user?.user_metadata ?? {},
      ),
      context.accountId
        ? loadEmployerAccountProfile(context.accountId)
        : Promise.resolve({}),
    ]);

    return NextResponse.json({ profile: { ...profile, ...accountProfile } });
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

    const context = await getEmployerAccountContext(
      user,
      getSelectedEmployerAccountIdFromRequest(request),
    );

    if (!context.canManageProfile) {
      return NextResponse.json(
        {
          error:
            "Only Account Owners can edit the company profile. Contact your account admin to make changes.",
        },
        { status: 403 },
      );
    }

    if (!context.accountId) {
      return NextResponse.json(
        { error: "No employer account selected." },
        { status: 400 },
      );
    }

    const payload = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!payload) {
      return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      throw new Error("Supabase service role is not configured on the server.");
    }

    const safeUpdate = SAFE_PROFILE_FIELDS.reduce<
      Record<SafeProfileField, string | null>
    >((acc, field) => {
      const maxLength =
        field === "address"
          ? 220
          : field === "support_email" || field === "company_name"
            ? 180
            : 120;

      acc[field] = cleanString(payload[field], maxLength);
      return acc;
    }, {} as Record<SafeProfileField, string | null>);

    const safeAccountUpdate = SAFE_ACCOUNT_FIELDS.reduce<
      Record<SafeAccountField, string | number | null>
    >((acc, field) => {
     if (field === "location_count") {
  acc[field] = cleanNumber(payload[field]);
  return acc;
}

      const maxLength =
        field === "company_short_description"
          ? 500
          : field === "company_description"
            ? 1800
            : field === "benefits_summary" || field === "benefits_list"
              ? 1200
              : field === "company_logo_url" || field === "company_website"
                ? 500
                : 180;

      acc[field] = cleanString(payload[field], maxLength);
      return acc;
    }, {} as Record<SafeAccountField, string | number | null>);

    if (
      safeUpdate.support_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeUpdate.support_email)
    ) {
      return NextResponse.json(
        { error: "Enter a valid support/contact email address." },
        { status: 400 },
      );
    }

    const website = safeAccountUpdate.company_website;
    if (
      typeof website === "string" &&
      website &&
      !/^https?:\/\/[^\s]+\.[^\s]+/.test(website)
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid company website URL starting with http:// or https://.",
        },
        { status: 400 },
      );
    }

    const logoUrl = safeAccountUpdate.company_logo_url;
    if (
      typeof logoUrl === "string" &&
      logoUrl &&
      !/^https?:\/\/[^\s]+\.[^\s]+/.test(logoUrl)
    ) {
      return NextResponse.json(
        { error: "Enter a valid logo URL starting with http:// or https://." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("employer_profiles")
      .upsert(
        {
          user_id: context.ownerUserId,
          login_email: context.ownerEmail,
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

    const { data: accountData, error: accountError } = await supabaseAdmin
      .from("employer_accounts")
      .update({
        ...safeAccountUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.accountId)
      .select(ACCOUNT_PROFILE_SELECT)
      .single();

    if (accountError) {
      throw new Error(accountError.message || "Could not save company profile fields.");
    }

    return NextResponse.json({
      profile: {
        ...data,
        ...accountData,
        login_email: context.ownerEmail,
      },
    });
  } catch (error) {
    console.error("Employer profile save failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Employer profile save failed." },
      { status: 500 },
    );
  }
}

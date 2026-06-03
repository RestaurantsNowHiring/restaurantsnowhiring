import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/.+/i;

type StorePayload = {
  id?: string;
  location_name?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  store_email?: string | null;
  ta_email?: string | null;
  gm_op_email?: string | null;
  minimum_wage?: string | null;
  pay_range?: string | null;
  default_application_url?: string | null;
  active?: boolean;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 254)?.toLowerCase() ?? null;
  return email;
}

function cleanUrl(value: unknown) {
  const url = cleanText(value, 500);
  if (!url) return null;
  return URL_PATTERN.test(url) ? url : `https://${url}`;
}

function validateEmail(email: string | null, label: string) {
  if (email && !EMAIL_PATTERN.test(email)) return `${label} must be a valid email address.`;
  return null;
}

function buildStoreRow(payload: StorePayload, employerAccountId: string) {
  const locationName = cleanText(payload.location_name, 180);
  if (!locationName) return { error: "Store/location name is required." as const };

  const storeEmail = cleanEmail(payload.store_email);
  const taEmail = cleanEmail(payload.ta_email);
  const gmOpEmail = cleanEmail(payload.gm_op_email);
  const emailError =
    validateEmail(storeEmail, "Store email") ||
    validateEmail(taEmail, "TA email") ||
    validateEmail(gmOpEmail, "GM/OP email");
  if (emailError) return { error: emailError };

  return {
    row: {
      employer_account_id: employerAccountId,
      location_name: locationName,
      address: cleanText(payload.address, 240),
      city: cleanText(payload.city, 120),
      state: cleanText(payload.state, 2)?.toUpperCase() ?? null,
      store_email: storeEmail,
      ta_email: taEmail,
      gm_op_email: gmOpEmail,
      minimum_wage: cleanText(payload.minimum_wage, 80),
      pay_range: cleanText(payload.pay_range, 120),
      default_application_url: cleanUrl(payload.default_application_url),
      active: payload.active !== false,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user);
    if (!context.accountId) return NextResponse.json({ stores: [] });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data: stores, error } = await supabaseAdmin
      .from("employer_stores")
      .select("id,employer_account_id,location_name,address,city,state,store_email,ta_email,gm_op_email,minimum_wage,pay_range,default_application_url,active,created_at,updated_at")
      .eq("employer_account_id", context.accountId)
      .order("location_name", { ascending: true });

    if (error) throw new Error(error.message || "Could not load stores.");

    const storeIds = (stores ?? []).map((store) => store.id).filter(Boolean);
    let activeJobsByStore: Record<string, Array<{ id: string; title: string; city: string | null; state: string | null }>> = {};

    if (storeIds.length > 0) {
      const { data: jobs, error: jobsError } = await supabaseAdmin
        .from("jobs")
        .select("id,title,city,state,employer_store_id")
        .in("employer_store_id", storeIds)
        .eq("status", "active")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (!jobsError) {
        activeJobsByStore = (jobs ?? []).reduce((acc, job) => {
          const storeId = typeof job.employer_store_id === "string" ? job.employer_store_id : null;
          if (!storeId) return acc;
          acc[storeId] = acc[storeId] ?? [];
          acc[storeId].push({
            id: String(job.id),
            title: String(job.title ?? "Untitled job"),
            city: typeof job.city === "string" ? job.city : null,
            state: typeof job.state === "string" ? job.state : null,
          });
          return acc;
        }, {} as Record<string, Array<{ id: string; title: string; city: string | null; state: string | null }>>);
      }
    }

    return NextResponse.json({ stores: stores ?? [], activeJobsByStore });
  } catch (error) {
    console.error("Employer store load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load stores." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user);
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 400 });
    assertEmployerPermission(context, "canManageTeam");

    const payload = (await request.json().catch(() => null)) as StorePayload | null;
    const built = buildStoreRow(payload ?? {}, context.accountId);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_stores")
      .insert(built.row)
      .select("id,employer_account_id,location_name,address,city,state,store_email,ta_email,gm_op_email,minimum_wage,pay_range,default_application_url,active,created_at,updated_at")
      .single();

    if (error) throw new Error(error.message || "Could not save store.");
    return NextResponse.json({ store: data });
  } catch (error) {
    console.error("Employer store create failed", { error });
    const status = error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save store." }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user);
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 400 });
    assertEmployerPermission(context, "canManageTeam");

    const payload = (await request.json().catch(() => null)) as StorePayload | null;
    const storeId = cleanText(payload?.id, 80);
    if (!storeId) return NextResponse.json({ error: "Store id is required." }, { status: 400 });

    const built = buildStoreRow(payload ?? {}, context.accountId);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_stores")
      .update(built.row)
      .eq("id", storeId)
      .eq("employer_account_id", context.accountId)
      .select("id,employer_account_id,location_name,address,city,state,store_email,ta_email,gm_op_email,minimum_wage,pay_range,default_application_url,active,created_at,updated_at")
      .single();

    if (error) throw new Error(error.message || "Could not update store.");
    return NextResponse.json({ store: data });
  } catch (error) {
    console.error("Employer store update failed", { error });
    const status = error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update store." }, { status });
  }
}

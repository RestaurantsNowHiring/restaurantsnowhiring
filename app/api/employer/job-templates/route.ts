import { NextResponse } from "next/server";
import { getAuthUserFromRequest } from "../../../../lib/billing";
import { assertEmployerPermission, getEmployerAccountContext, getSelectedEmployerAccountIdFromRequest } from "../../../../lib/employerAccounts";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type TemplatePayload = {
  id?: string;
  template_name?: string;
  job_title?: string;
  role_category?: string | null;
  employment_type?: string | null;
  schedule?: string | null;
  pay_defaults?: string | null;
  job_description?: string | null;
  benefits?: string | null;
  active?: boolean;
};

const TEMPLATE_SELECT_FIELDS = "id,employer_account_id,template_name,job_title,role_category,employment_type,schedule,pay_defaults,job_description,benefits,active,is_default,created_at,updated_at";

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function buildTemplateRow(payload: TemplatePayload, employerAccountId: string) {
  const templateName = cleanText(payload.template_name, 180);
  const jobTitle = cleanText(payload.job_title, 180);
  if (!templateName) return { error: "Template name is required." as const };
  if (!jobTitle) return { error: "Job title is required." as const };

  return {
    row: {
      employer_account_id: employerAccountId,
      template_name: templateName,
      job_title: jobTitle,
      role_category: cleanText(payload.role_category, 120),
      employment_type: cleanText(payload.employment_type, 120),
      schedule: cleanText(payload.schedule, 500),
      pay_defaults: cleanText(payload.pay_defaults, 180),
      job_description: cleanText(payload.job_description, 8000),
      benefits: cleanText(payload.benefits, 1200),
      active: payload.active !== false,
      is_default: false,
      updated_at: new Date().toISOString(),
    },
  };
}

function permissionStatus(error: unknown) {
  return error instanceof Error && error.name === "EmployerPermissionError" ? 403 : 500;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    let query = supabaseAdmin
      .from("employer_job_templates")
      .select(TEMPLATE_SELECT_FIELDS)
      .order("template_name", { ascending: true });

    if (!includeInactive) query = query.eq("active", true);

    if (!context.accountId) return NextResponse.json({ templates: [] });

    query = query.eq("employer_account_id", context.accountId);

    const { data, error } = await query;
    if (error) throw new Error(error.message || "Could not load job templates.");

    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    console.error("Employer job template load failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load job templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 400 });
    assertEmployerPermission(context, "canManageJobs");

    const payload = (await request.json().catch(() => null)) as TemplatePayload | null;
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const built = buildTemplateRow(payload ?? {}, context.accountId);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("employer_job_templates")
      .insert(built.row)
      .select(TEMPLATE_SELECT_FIELDS)
      .single();

    if (error) throw new Error(error.message || "Could not save job template.");
    return NextResponse.json({ template: data });
  } catch (error) {
    console.error("Employer job template create failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save job template." }, { status: permissionStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 400 });
    assertEmployerPermission(context, "canManageJobs");

    const payload = (await request.json().catch(() => null)) as TemplatePayload | null;
    const templateId = cleanText(payload?.id, 80);
    if (!templateId) return NextResponse.json({ error: "Template id is required." }, { status: 400 });

    const built = buildTemplateRow(payload ?? {}, context.accountId);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { data, error } = await supabaseAdmin
      .from("employer_job_templates")
      .update(built.row)
      .eq("id", templateId)
      .eq("employer_account_id", context.accountId)
      .select(TEMPLATE_SELECT_FIELDS)
      .single();

    if (error) throw new Error(error.message || "Could not update job template.");
    return NextResponse.json({ template: data });
  } catch (error) {
    console.error("Employer job template update failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update job template." }, { status: permissionStatus(error) });
  }
}

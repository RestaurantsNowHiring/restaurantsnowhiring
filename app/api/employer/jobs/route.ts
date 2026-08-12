import { NextResponse } from "next/server";
import { getAuthUserFromRequest, syncSubscriptionQuantityForEmployer } from "../../../../lib/billing";
import {
  assertEmployerPermission,
  getEmployerAccountContext,
  getSelectedEmployerAccountIdFromRequest,
} from "../../../../lib/employerAccounts";
import { buildCanonicalJobInsertPayload, shouldAutoApproveJob } from "../../../../lib/jobPersistence";
import { filterEmployerVisibleJobs, loadEmployerJobsForDashboard } from "../../../../lib/employerVisibleJobs";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

type JobPayload = {
  restaurantName?: string;
  title?: string;
  roleCategory?: string;
  city?: string;
  state?: string;
  applyEmail?: string;
  companyWebsite?: string | null;
  employmentType?: string;
  payRange?: string | null;
  address?: string | null;
  howToApply?: string | null;
  description?: string;
  candidateNotificationEmail?: string | null;
  candidateNotificationEmails?: string[] | null;
  candidateNotificationRouting?: "account_owner" | "job_poster" | "company_support" | "custom_job_email";
  employerStoreId?: string | null;
  employerJobTemplateId?: string | null;
};

const ALLOWED_FIELDS = new Set<keyof JobPayload>([
  "restaurantName", "title", "roleCategory", "city", "state", "applyEmail", "companyWebsite",
  "employmentType", "payRange", "address", "howToApply", "description", "candidateNotificationEmail",
  "candidateNotificationEmails", "candidateNotificationRouting", "employerStoreId", "employerJobTemplateId",
]);

function text(value: unknown, maximum: number, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== "string") return required ? undefined : null;
  const clean = value.trim();
  if (!clean || clean.length > maximum) return required ? undefined : null;
  return clean;
}

function invalidPayload(value: unknown): value is null {
  return !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key as keyof JobPayload));
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) throw new Error("Supabase service role is not configured on the server.");

    const { jobs, includesViews } = await loadEmployerJobsForDashboard(supabaseAdmin, context);
    const visibleJobs = filterEmployerVisibleJobs(user, context, jobs);
    return NextResponse.json({ jobs: visibleJobs, includesViews });
  } catch (error) {
    console.error("Employer jobs load failed", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load employer job listings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const context = await getEmployerAccountContext(user, getSelectedEmployerAccountIdFromRequest(request));
    if (!context.accountId) return NextResponse.json({ error: "Employer account not found." }, { status: 403 });
    assertEmployerPermission(context, "canManageJobs");

    const body = await request.json().catch(() => null) as JobPayload | null;
    if (invalidPayload(body)) return NextResponse.json({ error: "Invalid job submission." }, { status: 400 });

    const restaurantName = text(body.restaurantName, 500, true);
    const title = text(body.title, 500, true);
    const roleCategory = text(body.roleCategory, 100, true);
    const city = text(body.city, 200, true);
    const state = text(body.state, 2, true)?.toUpperCase();
    const applyEmail = text(body.applyEmail, 254, true);
    const employmentType = text(body.employmentType, 100, true);
    const description = text(body.description, 250_000, true);
    if (!restaurantName || !title || !roleCategory || !city || !state || !applyEmail || !employmentType || !description) {
      return NextResponse.json({ error: "Complete all required job fields." }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured on the server.");

    const storeId = text(body.employerStoreId, 100);
    if (storeId) {
      const store = await admin.from("employer_stores").select("id").eq("id", storeId)
        .eq("employer_account_id", context.accountId).eq("active", true).eq("is_assignable_location", true).maybeSingle();
      if (store.error || !store.data || (context.assignedStoreIds.length > 0 && !context.assignedStoreIds.includes(storeId))) {
        return NextResponse.json({ error: "Choose a valid restaurant location." }, { status: 400 });
      }
    }

    const templateId = text(body.employerJobTemplateId, 100);
    if (templateId) {
      const template = await admin.from("employer_job_templates").select("id").eq("id", templateId)
        .eq("employer_account_id", context.accountId).maybeSingle();
      if (template.error || !template.data) return NextResponse.json({ error: "Choose a valid job template." }, { status: 400 });
    }

    const canRoute = context.canManageNotificationRouting;
    const emails = canRoute && Array.isArray(body.candidateNotificationEmails)
      ? body.candidateNotificationEmails.map((email) => text(email, 254, true)).filter((email): email is string => Boolean(email))
      : null;
    const autoApproved = shouldAutoApproveJob(context.accountId);
    const payload = buildCanonicalJobInsertPayload({
      restaurantName, title, roleCategory, city, state, applyEmail, employmentType, description,
      employerEmail: context.ownerEmail, employerUserId: context.ownerUserId, employerAccountId: context.accountId,
      postedByUserId: user.id, postedByEmail: user.email,
      companyWebsite: text(body.companyWebsite, 2048), payRange: text(body.payRange, 500),
      address: text(body.address, 1000), howToApply: text(body.howToApply, 2048),
      candidateNotificationEmail: canRoute ? text(body.candidateNotificationEmail, 254) : null,
      candidateNotificationEmails: emails,
      candidateNotificationRouting: canRoute ? body.candidateNotificationRouting : context.defaultCandidateNotificationRouting,
      employerStoreId: storeId, employerJobTemplateId: templateId,
    });

    const inserted = await admin.from("jobs").insert(payload).select("id,status,active,approved_at").single();
    if (inserted.error) throw new Error(inserted.error.message || "Could not submit job.");

    if (autoApproved) {
      await syncSubscriptionQuantityForEmployer(context.ownerUserId).catch((error) => {
        console.error("Failed to sync Stripe quantity after manual auto-approval", { error });
      });
    }
    return NextResponse.json({ job: inserted.data, autoApproved });
  } catch (error) {
    const forbidden = error instanceof Error && error.name === "EmployerPermissionError";
    console.error("Employer job submission failed", { error });
    return NextResponse.json({ error: forbidden ? "Forbidden." : "Could not submit job." }, { status: forbidden ? 403 : 500 });
  }
}

import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import { isOfficialSourceUrl, isReadyForOutreach, nextReviewDate } from "../../../../lib/sourcedJobs";
import { EMPLOYMENT_OPTIONS } from "../../../../lib/jobFormOptions";

export async function GET() {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  const [{ data: jobs, error }, { data: companies }, { data: events }] = await Promise.all([
    db.from("jobs").select("id,company_id,restaurant_name,title,city,state,employment_type,pay_range,description,source_url,external_apply_url,last_verified_at,review_due_at,status,active,retired_at,retired_reason,created_at").eq("source_type", "rnh_sourced").order("created_at", { ascending: false }),
    db.from("companies").select("id,name,website").order("name"),
    db.from("job_events").select("job_id,company_id,event_type,session_id,created_at"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const analytics = (companies ?? []).map((company) => {
    const companyJobs=(jobs ?? []).filter((job)=>job.company_id===company.id); const ids=new Set(companyJobs.map((job)=>job.id));
    const companyEvents=(events ?? []).filter((event)=>ids.has(event.job_id)); const views=companyEvents.filter((event)=>event.event_type==="job_view"); const clicks=companyEvents.filter((event)=>event.event_type==="apply_click");
    const uniqueViewers=new Set(views.map((event)=>event.session_id)).size;
    return {companyId:company.id,companyName:company.name,activeSourcedJobs:companyJobs.filter((job)=>job.status==="active").length,totalJobViews:views.length,uniqueViewers,applyClicks:clicks.length,applyClickRate:views.length?clicks.length/views.length:0,readyForOutreach:isReadyForOutreach(uniqueViewers, clicks.length),jobs:companyJobs.map((job)=>{const e=companyEvents.filter((event)=>event.job_id===job.id);const v=e.filter((event)=>event.event_type==="job_view");return {id:job.id,title:job.title,views:v.length,uniqueViewers:new Set(v.map((event)=>event.session_id)).size,applyClicks:e.filter((event)=>event.event_type==="apply_click").length};})};
  });
  return NextResponse.json({ jobs, companies, analytics });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const required = ["companyName","title","city","state","employmentType","summary","sourceUrl","externalApplyUrl"];
  if (required.some((key) => !String(body[key] ?? "").trim())) return NextResponse.json({ error: "Complete all required fields." }, { status: 400 });
  if (!isOfficialSourceUrl(body.sourceUrl) || !isOfficialSourceUrl(body.externalApplyUrl)) return NextResponse.json({ error: "Use an official employer careers or ATS URL; third-party job boards are not allowed." }, { status: 400 });
  const companyWebsite = String(body.companyWebsite ?? "").trim();
  if (companyWebsite && !isOfficialSourceUrl(companyWebsite)) return NextResponse.json({ error: "Company Website must be an official HTTP or HTTPS company URL." }, { status: 400 });
  if (![...EMPLOYMENT_OPTIONS, "Other"].includes(String(body.employmentType).trim())) return NextResponse.json({ error: "Select a supported employment type." }, { status: 400 });
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  let companyId = String(body.companyId ?? "").trim();
  if (!companyId) {
    const companyName = String(body.companyName).trim();
    const { data: companyRows, error: companyLookupError } = await db.from("companies").select("id,name,website");
    if (companyLookupError) return NextResponse.json({ error: companyLookupError.message }, { status: 500 });
    const existing = companyRows?.find((company) => company.name.trim().toLocaleLowerCase() === companyName.toLocaleLowerCase());
    if (existing) {
      companyId = existing.id;
      if (companyWebsite && companyWebsite !== existing.website) {
        const { error: websiteError } = await db.from("companies").update({ website: companyWebsite, updated_at: new Date().toISOString() }).eq("id", companyId);
        if (websiteError) return NextResponse.json({ error: websiteError.message }, { status: 500 });
      }
    } else {
      const { data: createdCompany, error: companyCreateError } = await db.from("companies").insert({ name: companyName, website: companyWebsite || null }).select("id").single();
      if (companyCreateError) return NextResponse.json({ error: companyCreateError.message }, { status: 500 });
      companyId = createdCompany.id;
    }
  }
  if (!companyId) return NextResponse.json({ error: "Could not create or select company." }, { status: 500 });
  const status = ["draft","active","expired","retired","removed"].includes(body.status) ? body.status : "active";
  const lastVerified = new Date().toISOString();
  const { data, error } = await db.from("jobs").insert({
    company_id: companyId, restaurant_name: String(body.companyName).trim(), title: String(body.title).trim(), city: String(body.city).trim(), state: String(body.state).trim(),
    employment_type: String(body.employmentType).trim(), pay_range: String(body.payRange ?? "").trim() || null, description: String(body.summary).trim(),
    source_type: "rnh_sourced", source_url: body.sourceUrl, external_apply_url: body.externalApplyUrl, how_to_apply: body.externalApplyUrl,
    last_verified_at: lastVerified, review_due_at: nextReviewDate(new Date(lastVerified)), status, active: status === "active",
    role_category: "Other", apply_email: "sourced-listing@restaurantsnowhiring.com", employer_email: null, employer_user_id: null, employer_account_id: null,
  }).select("id").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ job: data }, { status: 201 });
}

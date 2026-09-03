import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabaseAdmin";
import { createDigestOnlyToken, digestClientIp, getClientIp, getPromotionalEntryPepper, normalizeCompanyIdentity, promotionalEntryIsRateLimited, validatePromotionalEntry } from "../../../lib/promotionalEntry";

const FRIENDLY_INELIGIBLE = "This Free First Job offer is not available for this request.";

export async function POST(request: Request) {
  const pepper = getPromotionalEntryPepper();
  if (!pepper) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  const db = getSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const validated = validatePromotionalEntry(body);
  if (!validated.data) return NextResponse.json({ error: validated.error }, { status: 400 });
  const input = validated.data;
  const ipDigest = digestClientIp(getClientIp(request), pepper);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [ipCount, emailCount] = await Promise.all([
    db.from("promotional_entry_attempts").select("id", { count: "exact", head: true }).eq("ip_digest", ipDigest).gte("attempted_at", since),
    db.from("promotional_entry_attempts").select("id", { count: "exact", head: true }).eq("contact_email", input.contactEmail).gte("attempted_at", since),
  ]);
  if (ipCount.error || emailCount.error) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  const limited = promotionalEntryIsRateLimited(ipCount.count ?? 0, emailCount.count ?? 0);
  const attempt = await db.from("promotional_entry_attempts").insert({ ip_digest: ipDigest, contact_email: input.contactEmail, outcome: limited ? "rate_limited" : "allowed" });
  if (attempt.error) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  if (limited) return NextResponse.json({ error: "We could not accept another request right now. Please try again later." }, { status: 429 });

  const identityKey = normalizeCompanyIdentity(input.companyName);
  let companyResult = await db.from("companies").select("id,name,website").eq("identity_key", identityKey).maybeSingle();
  if (companyResult.error) return NextResponse.json({ error: "We could not process your request. Please try again." }, { status: 500 });
  let company = companyResult.data;
  if (!company) {
    const created = await db.from("companies").insert({ name: input.companyName, website: input.companyWebsite, identity_key: identityKey }).select("id,name,website").single();
    if (created.error) {
      companyResult = await db.from("companies").select("id,name,website").eq("identity_key", identityKey).maybeSingle();
      if (companyResult.error || !companyResult.data) return NextResponse.json({ error: "We could not process your request. Please try again." }, { status: 500 });
      company = companyResult.data;
    } else company = created.data;
  }
  const [redeemedEmail, redeemedCompany] = await Promise.all([
    db.from("promotional_invitations").select("id").eq("contact_email", input.contactEmail).not("redeemed_job_id", "is", null).limit(1),
    db.from("promotional_invitations").select("id").eq("company_id", company.id).not("redeemed_job_id", "is", null).limit(1),
  ]);
  if (redeemedEmail.error || redeemedCompany.error) return NextResponse.json({ error: "We could not process your request. Please try again." }, { status: 500 });
  if (redeemedEmail.data?.length || redeemedCompany.data?.length) return NextResponse.json({ error: FRIENDLY_INELIGIBLE }, { status: 409 });

  const invitation = await db.from("promotional_invitations").insert({
    company_id: company.id, contact_email: input.contactEmail, entry_source: "public_request", eligibility_status: "eligible", eligibility_checked_at: new Date().toISOString(),
    token_digest: createDigestOnlyToken(), verification_token_digest: createDigestOnlyToken(), offer_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    contact_name: input.contactName, requested_company_website: input.companyWebsite, requested_job_title: input.title, requested_city: input.city, requested_state: input.state,
    requested_country: input.country, requested_employment_type: input.employmentType, requested_description: input.description, requested_application_url: input.applicationUrl,
  }).select("id").single();
  if (invitation.error) return NextResponse.json({ error: "We could not process your request. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "We received your Free First Job request. Verify your email to continue." }, { status: 201 });
}

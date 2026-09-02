import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";
import {
  buildPromotionalUrl,
  createPromotionalBearerToken,
  normalizePromotionalContactEmail,
  parseFutureOfferExpiration,
} from "../../../../lib/promotionalInvitations";

const LIST_FIELDS = "id,contact_email,company_id,issued_at,offer_expires_at,email_verified_at,redeemed_at,redeemed_job_id,revoked_at,revoked_reason,companies(name)";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });

  const [invitationsResult, companiesResult] = await Promise.all([
    db.from("promotional_invitations").select(LIST_FIELDS).order("issued_at", { ascending: false }),
    db.from("companies").select("id,name").order("name"),
  ]);
  if (invitationsResult.error) return NextResponse.json({ error: invitationsResult.error.message }, { status: 500 });
  if (companiesResult.error) return NextResponse.json({ error: companiesResult.error.message }, { status: 500 });
  return NextResponse.json({ invitations: invitationsResult.data ?? [], companies: companiesResult.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.company_id ?? "").trim();
  const contactEmail = normalizePromotionalContactEmail(body.contact_email);
  const expiration = parseFutureOfferExpiration(body.offer_expires_at);
  if (!contactEmail) return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
  if (!expiration) return NextResponse.json({ error: "Offer expiration must be a future date and time." }, { status: 400 });
  if (!companyId) return NextResponse.json({ error: "Select a company." }, { status: 400 });

  const db = getSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  const company = await db.from("companies").select("id,name").eq("id", companyId).maybeSingle();
  if (company.error) return NextResponse.json({ error: company.error.message }, { status: 500 });
  if (!company.data) return NextResponse.json({ error: "The selected company does not exist." }, { status: 400 });

  // Generate the bearer secret only after validation. It is returned once and never persisted or logged.
  const token = createPromotionalBearerToken();
  const inserted = await db.from("promotional_invitations").insert({
    company_id: company.data.id,
    contact_email: contactEmail,
    offer_expires_at: expiration.toISOString(),
    token_digest: token.databaseDigest,
  }).select(LIST_FIELDS).single();
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  return NextResponse.json({ invitation: inserted.data, promotional_url: buildPromotionalUrl(token.rawToken) }, { status: 201 });
}

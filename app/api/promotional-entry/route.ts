import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../lib/supabaseAdmin";
import { createDigestOnlyToken, digestClientIp, getClientIp, getPromotionalEntryPepper, validatePromotionalEntry } from "../../../lib/promotionalEntry";
import { createVerificationTokenMaterial, dispatchPromotionalVerificationEmail, PROMOTIONAL_VERIFICATION_DAYS } from "../../../lib/promotionalVerification";

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
  const admission = await db.rpc("admit_promotional_entry_attempt", { p_ip_digest: ipDigest, p_contact_email: input.contactEmail });
  if (admission.error) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  if (admission.data !== true) return NextResponse.json({ error: "We could not accept another request right now. Please try again later." }, { status: 429 });

  const verification = createVerificationTokenMaterial();
  if (!verification) return NextResponse.json({ error: "This form is temporarily unavailable. Please try again later." }, { status: 503 });
  const invitation = await db.rpc("create_public_promotional_request", {
    p_company_name: input.companyName, p_company_website: input.companyWebsite,
    p_contact_name: input.contactName, p_contact_email: input.contactEmail,
    p_job_title: input.title, p_city: input.city, p_state: input.state, p_country: input.country,
    p_employment_type: input.employmentType, p_description: input.description, p_application_url: input.applicationUrl,
    p_token_digest: createDigestOnlyToken(), p_verification_token_digest: verification.digest,
    p_verification_expires_at: new Date(Date.now() + PROMOTIONAL_VERIFICATION_DAYS * 86400000).toISOString(),
    p_token_ciphertext: verification.ciphertext, p_token_iv: verification.iv, p_token_auth_tag: verification.authTag,
  });
  if (invitation.error) return NextResponse.json({ error: "We could not process your request. Please try again." }, { status: 500 });
  if (!invitation.data) return NextResponse.json({ error: "This Free First Job offer is not available for this request." }, { status: 409 });
  const delivery = await dispatchPromotionalVerificationEmail(db, invitation.data);
  if (!delivery.ok) console.error("Promotional verification email queued for retry", { invitationId: invitation.data });
  return NextResponse.json({ ok: true, message: "We received your Free First Job request. Verify your email to continue." }, { status: 201 });
}

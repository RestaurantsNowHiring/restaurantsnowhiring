import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../../../lib/supabaseAdmin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason ?? "Revoked by RNH Admin").trim();
  if (!reason) return NextResponse.json({ error: "A revocation reason is required." }, { status: 400 });
  const db = getSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  const existing = await db.from("promotional_invitations").select("id,redeemed_at,revoked_at").eq("id", id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
  if (!existing.data) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (existing.data.revoked_at) return NextResponse.json({ error: "Invitation is already revoked." }, { status: 409 });
  if (existing.data.redeemed_at) return NextResponse.json({ error: "A redeemed invitation cannot be revoked." }, { status: 409 });
  const result = await db.from("promotional_invitations").update({ revoked_at: new Date().toISOString(), revoked_reason: reason }).eq("id", id).is("revoked_at", null).is("redeemed_at", null).select("id,revoked_at,revoked_reason").single();
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 409 }) : NextResponse.json({ invitation: result.data });
}

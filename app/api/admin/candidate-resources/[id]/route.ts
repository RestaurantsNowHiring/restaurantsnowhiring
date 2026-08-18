import { NextResponse } from "next/server";
import { normalizeCandidateResourceInput, validateCandidateResourceInput } from "../../../../../lib/candidateResources";
import { requireAdminApi } from "../../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";
const fields = "id,title,category,resource_type,url,source,description,thumbnail_url,sort_order,active,created_at,updated_at";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const input = normalizeCandidateResourceInput(await request.json().catch(() => null) ?? {}); const validation = validateCandidateResourceInput(input);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured on the server." }, { status: 500 });
  const { id } = await params; const { data, error } = await db.from("candidate_resources").update(input).eq("id", id).select(fields).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return data ? NextResponse.json({ resource: data }) : NextResponse.json({ error: "Resource not found." }, { status: 404 });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured on the server." }, { status: 500 });
  const { id } = await params; const { error, count } = await db.from("candidate_resources").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Resource not found." }, { status: 404 });
}

import { NextResponse } from "next/server";
import { normalizeCandidateResourceInput, validateCandidateResourceInput } from "../../../../lib/candidateResources";
import { requireAdminApi } from "../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../lib/supabaseAdmin";

const fields = "id,title,category,resource_type,url,source,description,thumbnail_url,sort_order,active,created_at,updated_at";
export async function GET() {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured on the server." }, { status: 500 });
  const { data, error } = await db.from("candidate_resources").select(fields).order("sort_order").order("title");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ resources: data ?? [] });
}
export async function POST(request: Request) {
  const auth = await requireAdminApi(); if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null); const input = normalizeCandidateResourceInput(body ?? {}); const validation = validateCandidateResourceInput(input);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  const db = getSupabaseAdminClient(); if (!db) return NextResponse.json({ error: "Supabase service role is not configured on the server." }, { status: 500 });
  const { data, error } = await db.from("candidate_resources").insert(input).select(fields).single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ resource: data }, { status: 201 });
}

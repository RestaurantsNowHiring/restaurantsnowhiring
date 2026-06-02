import { NextResponse } from "next/server";
import { requirePrimaryBlogAdminApi } from "../../../../../lib/adminBlogAuth";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";
import { normalizeBlogPostInput, validateBlogPostInput } from "../../../../../lib/blogPosts";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePrimaryBlogAdminApi();
  if (!admin.ok) return admin.response;

  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  const input = normalizeBlogPostInput(body ?? {});
  const validationError = validateBlogPostInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured on the server." },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update({ ...input, status: "draft" })
    .eq("id", id)
    .select("id,title,slug,category,excerpt,content,status,meta_title,meta_description,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not update blog draft." },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Blog draft not found." }, { status: 404 });
  }

  return NextResponse.json({ post: data });
}

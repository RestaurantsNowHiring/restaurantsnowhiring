import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../../lib/requireAdminApi";
import { getSupabaseAdminClient } from "../../../../../lib/supabaseAdmin";
import { nextReviewDate } from "../../../../../lib/sourcedJobs";

export async function PATCH(request: Request, { params }: { params: Promise<{id:string}> }) {
  const auth=await requireAdminApi(); if(!auth.ok)return auth.response;
  const {id}=await params; const body=await request.json().catch(()=>({}));
  const action=String(body.action||""); const now=new Date().toISOString();
  const updates: Record<string, unknown> = action === "verify" ? { last_verified_at:now, review_due_at:nextReviewDate(), status:"active", active:true }
    : action === "expire" ? { status:"expired", active:false }
    : action === "retire" ? { status:"retired", active:false, retired_at:now, retired_reason:String(body.reason||"manual") }
    : action === "remove" ? { status:"removed", active:false } : {};
  if(!Object.keys(updates).length)return NextResponse.json({error:"Invalid action."},{status:400});
  const db=getSupabaseAdminClient(); if(!db)return NextResponse.json({error:"Supabase service role is not configured."},{status:500});
  const {data,error}=await db.from("jobs").update(updates).eq("id",id).eq("source_type","rnh_sourced").select("id,status,active,last_verified_at,review_due_at,retired_at,retired_reason").maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:500}); if(!data)return NextResponse.json({error:"Sourced job not found."},{status:404}); return NextResponse.json({job:data});
}

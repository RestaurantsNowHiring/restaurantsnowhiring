import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
export async function POST(request:Request){
  const body=await request.json().catch(()=>({}));
  if(!["job_view","apply_click"].includes(body.eventType)||typeof body.sessionId!=="string")return NextResponse.json({error:"Invalid event."},{status:400});
  const {error}=await supabase.rpc("record_job_event",{p_job_id:body.jobId,p_event_type:body.eventType,p_session_id:body.sessionId});
  return error?NextResponse.json({error:"Event was not recorded."},{status:400}):new NextResponse(null,{status:204});
}

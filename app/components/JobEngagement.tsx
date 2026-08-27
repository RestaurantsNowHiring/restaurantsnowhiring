"use client";
import { useEffect } from "react";

function sessionId() {
  const key="rnh_anonymous_session"; let value=sessionStorage.getItem(key);
  if(!value){value=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem(key,value);} return value;
}
async function record(jobId:string,eventType:"job_view"|"apply_click"){
  await fetch("/api/job-events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId,eventType,sessionId:sessionId()}),keepalive:true});
}
export default function JobEngagement({jobId,applyUrl}:{jobId:string;applyUrl?:string|null}){
  useEffect(()=>{void record(jobId,"job_view");},[jobId]);
  if(!applyUrl)return null;
  return <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={(event)=>{
    event.preventDefault(); const target=applyUrl; void record(jobId,"apply_click").finally(()=>window.open(target,"_blank","noopener,noreferrer"));
  }} style={{display:"inline-flex",backgroundColor:"#35806e",color:"white",padding:"13px 20px",fontWeight:900,borderRadius:12,textDecoration:"none",margin:"10px 0 18px"}}>APPLY ON COMPANY SITE</a>;
}

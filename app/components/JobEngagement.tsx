"use client";
import { useEffect } from "react";

function sessionId() {
  const key="rnh_anonymous_session"; let value=sessionStorage.getItem(key);
  if(!value){value=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem(key,value);} return value;
}
async function record(jobId:string,eventType:"job_view"|"apply_click"){
  await fetch("/api/job-events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId,eventType,sessionId:sessionId()}),keepalive:true});
}
export default function JobEngagement({jobId,applyUrl,companyName}:{jobId:string;applyUrl?:string|null;companyName?:string}){
  useEffect(()=>{void record(jobId,"job_view");},[jobId]);
  if(!applyUrl)return null;
  const employer = companyName?.trim() || "the company";
  return <section aria-labelledby="external-application-heading" style={{marginTop:18,padding:"24px",border:"1px solid rgba(53,128,110,.22)",borderRadius:16,backgroundColor:"#fff",boxShadow:"0 10px 26px rgba(0,0,0,.06)"}}>
    <div style={{color:"#35806e",fontSize:12,fontWeight:900,letterSpacing:1.1}}>READY TO APPLY?</div>
    <h2 id="external-application-heading" style={{margin:"7px 0 8px",color:"rgba(0,0,0,.82)",fontSize:25,lineHeight:1.2}}>Apply directly with {employer}</h2>
    <p style={{margin:"0 0 17px",maxWidth:720,color:"rgba(0,0,0,.64)",fontSize:15,fontWeight:650,lineHeight:1.65}}>Continue to {employer}&apos;s official careers site to view the complete opportunity and submit your application.</p>
    <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={(event)=>{
      event.preventDefault(); const target=applyUrl; void record(jobId,"apply_click").finally(()=>window.open(target,"_blank","noopener,noreferrer"));
    }} style={{display:"inline-flex",alignItems:"center",backgroundColor:"#35806e",color:"white",padding:"13px 20px",fontWeight:900,borderRadius:11,textDecoration:"none",boxShadow:"0 8px 18px rgba(53,128,110,.2)"}}>APPLY ON COMPANY SITE →</a>
    <p style={{margin:"18px 0 0",paddingTop:14,borderTop:"1px solid rgba(0,0,0,.08)",color:"rgba(0,0,0,.54)",fontSize:12,lineHeight:1.6}}>This opportunity was identified by Restaurants NOW HIRING from publicly available employer career information. Restaurants NOW HIRING is not representing the employer in the hiring process.</p>
  </section>;
}

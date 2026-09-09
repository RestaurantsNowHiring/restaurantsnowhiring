import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { buildBrandedEmailHtml, buildBrandedEmailText } from "./emailTemplates";

export const PROMOTIONAL_VERIFICATION_SUBJECT = "Verify Your Free Job Post | RestaurantsNowHiring.com";
export const PROMOTIONAL_VERIFICATION_DAYS = 7;
const PRODUCTION_SITE_URL = "https://www.restaurantsnowhiring.com";

type VercelEnvironment = NodeJS.ProcessEnv & {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
};

export function getPromotionalVerificationBaseUrl(environment: VercelEnvironment = process.env) {
  if (environment.VERCEL_ENV !== "preview") return PRODUCTION_SITE_URL;

  const deploymentHostname = environment.VERCEL_URL?.trim();
  if (!deploymentHostname) return null;

  try {
    const deploymentUrl = new URL(`https://${deploymentHostname}`);
    if (
      deploymentUrl.protocol !== "https:" ||
      deploymentUrl.username ||
      deploymentUrl.password ||
      deploymentUrl.port ||
      deploymentUrl.pathname !== "/" ||
      deploymentUrl.search ||
      deploymentUrl.hash ||
      !deploymentUrl.hostname.endsWith(".vercel.app")
    ) return null;

    return deploymentUrl.origin;
  } catch {
    return null;
  }
}

export function buildPromotionalVerificationUrl(token: string, environment: VercelEnvironment = process.env) {
  const baseUrl = getPromotionalVerificationBaseUrl(environment);
  return baseUrl ? `${baseUrl}/verify-promotional/${encodeURIComponent(token)}` : null;
}

function encryptionKey(environment = process.env) { const value=environment.PROMOTIONAL_VERIFICATION_TOKEN_KEY?.trim(); if(!value)return null; const decoded=Buffer.from(value,"base64"); return decoded.length===32?decoded:null; }
export function createVerificationTokenMaterial(environment=process.env,random=randomBytes){const key=encryptionKey(environment);if(!key)return null;const rawToken=random(32).toString("base64url"),iv=random(12),cipher=createCipheriv("aes-256-gcm",key,iv),ciphertext=Buffer.concat([cipher.update(rawToken,"utf8"),cipher.final()]);return{rawToken,digest:`\\x${createHash("sha256").update(rawToken).digest("hex")}`,ciphertext:`\\x${ciphertext.toString("hex")}`,iv:`\\x${iv.toString("hex")}`,authTag:`\\x${cipher.getAuthTag().toString("hex")}`};}
function bytea(value:string){return Buffer.from(value.replace(/^\\x/,""),"hex");}
export function decryptVerificationToken(ciphertext:string,iv:string,tag:string,environment=process.env){const key=encryptionKey(environment);if(!key)return null;try{const decipher=createDecipheriv("aes-256-gcm",key,bytea(iv));decipher.setAuthTag(bytea(tag));return Buffer.concat([decipher.update(bytea(ciphertext)),decipher.final()]).toString("utf8");}catch{return null;}}
export function digestVerificationToken(token:string){return`\\x${createHash("sha256").update(token,"utf8").digest("hex")}`;}
type Db={rpc(name:string,args?:Record<string,unknown>):PromiseLike<{data:unknown;error:{message?:string}|null}>};
type Claim={delivery_id:string;recipient_email:string;token_ciphertext:string;token_iv:string;token_auth_tag:string;company_name:string;job_title:string};
export async function dispatchPromotionalVerificationEmail(db:Db,invitationId?:string){const claimed=await db.rpc("claim_promotional_verification_delivery",{p_invitation_id:invitationId??null});const row=(Array.isArray(claimed.data)?claimed.data[0]:null)as Claim|undefined;if(claimed.error||!row)return{ok:!claimed.error,sent:false}as const;const token=decryptVerificationToken(row.token_ciphertext,row.token_iv,row.token_auth_tag),apiKey=process.env.RESEND_API_KEY,link=token?buildPromotionalVerificationUrl(token):null;if(!apiKey||!link){await db.rpc("fail_promotional_verification_delivery",{p_delivery_id:row.delivery_id,p_error:!apiKey?"missing_resend_api_key":token?"invalid_verification_base_url":"token_decryption_failed"});return{ok:false,sent:false}as const;}
 const email={eyebrow:"Free First Job",title:"Verify your email to submit your Free First Job for review.",intro:"Verification submits your job for Admin review. It does not make the job live or approved.",bodyHtml:"<p>No account or credit card is required. If approved, your job will run free for 30 days. This verification link expires in 7 days.</p>",contextRows:[{label:"Restaurant / company",value:row.company_name},{label:"Requested job",value:row.job_title}],cta:{label:"VERIFY EMAIL & SUBMIT JOB",href:link},footerNote:"If you did not request this job post, you can safely ignore this email."};
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":`promotional-verification-${row.delivery_id}`},body:JSON.stringify({from:process.env.PROMOTIONAL_EMAIL_FROM??process.env.CONTACT_NOTIFICATION_FROM??"Restaurants Now Hiring <notifications@restaurantsnowhiring.com>",to:row.recipient_email,subject:PROMOTIONAL_VERIFICATION_SUBJECT,text:buildBrandedEmailText(email),html:buildBrandedEmailHtml(email)})});if(!response.ok){await db.rpc("fail_promotional_verification_delivery",{p_delivery_id:row.delivery_id,p_error:`resend_${response.status}`});return{ok:false,sent:false}as const;}const body=await response.json().catch(()=>({}))as{id?:string};await db.rpc("complete_promotional_verification_delivery",{p_delivery_id:row.delivery_id,p_provider_message_id:body.id??`accepted-${row.delivery_id}`});return{ok:true,sent:true}as const;}

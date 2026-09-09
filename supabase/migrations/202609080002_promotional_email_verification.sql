-- Phase 4: retry-safe verification delivery and atomic pending-job redemption.
alter table public.promotional_invitations add column verification_expires_at timestamptz;
update public.promotional_invitations set verification_expires_at=offer_expires_at where verification_token_digest is not null;
alter table public.promotional_invitations add constraint promotional_verification_expiry_check check (verification_expires_at is null or verification_expires_at > issued_at);
alter table public.promotional_email_deliveries add column token_ciphertext bytea, add column token_iv bytea,
  add column token_auth_tag bytea, add column claimed_at timestamptz, add column next_attempt_at timestamptz not null default now(),
  add constraint promotional_verification_ciphertext_check check (email_type <> 'verification' or
    (token_ciphertext is not null and token_iv is not null and token_auth_tag is not null and octet_length(token_iv)=12 and octet_length(token_auth_tag)=16)) not valid;
drop index public.promotional_email_dispatch_idx;
create index promotional_email_dispatch_idx on public.promotional_email_deliveries(next_attempt_at,created_at) where state in ('pending','failed','sending');

drop function public.create_public_promotional_request(text,text,text,text,text,text,text,text,text,text,text,bytea,bytea);
create function public.create_public_promotional_request(
  p_company_name text,p_company_website text,p_contact_name text,p_contact_email text,p_job_title text,p_city text,p_state text,p_country text,
  p_employment_type text,p_description text,p_application_url text,p_token_digest bytea,p_verification_token_digest bytea,
  p_verification_expires_at timestamptz,p_token_ciphertext bytea,p_token_iv bytea,p_token_auth_tag bytea
) returns uuid language plpgsql security definer set search_path=public as $$
declare company_id uuid; invitation_id uuid; location_identity text;
begin
  if p_verification_expires_at<=now() then raise exception 'invalid verification expiration'; end if;
  location_identity:=public.promotional_location_identity(p_company_name,p_city,p_state,p_country);
  perform pg_advisory_xact_lock(hashtextextended(location_identity,73));
  if exists(select 1 from public.promotional_invitations where location_identity_key=location_identity and
    (redeemed_job_id is not null or (entry_source='public_request' and revoked_at is null and offer_expires_at>now()))) then return null; end if;
  company_id:=public.resolve_promotional_company(p_company_name,p_company_website);
  insert into public.promotional_invitations(company_id,contact_email,entry_source,eligibility_status,eligibility_checked_at,token_digest,
    verification_token_digest,verification_expires_at,offer_expires_at,contact_name,requested_company_website,requested_job_title,
    requested_city,requested_state,requested_country,requested_employment_type,requested_description,requested_application_url)
  values(company_id,p_contact_email,'public_request','eligible',now(),p_token_digest,p_verification_token_digest,p_verification_expires_at,
    p_verification_expires_at,p_contact_name,p_company_website,p_job_title,p_city,p_state,p_country,p_employment_type,p_description,p_application_url)
  returning id into invitation_id;
  insert into public.promotional_email_deliveries(promotional_invitation_id,email_type,recipient_email,token_ciphertext,token_iv,token_auth_tag)
    values(invitation_id,'verification',p_contact_email,p_token_ciphertext,p_token_iv,p_token_auth_tag);
  return invitation_id;
exception when unique_violation or exclusion_violation then
  if exists(select 1 from public.promotional_invitations where location_identity_key=location_identity and
    (redeemed_job_id is not null or (entry_source='public_request' and revoked_at is null and offer_expires_at>now()))) then return null; end if;
  raise;
end $$;

create function public.claim_promotional_verification_delivery(p_invitation_id uuid default null)
returns table(delivery_id uuid,invitation_id uuid,recipient_email text,token_ciphertext bytea,token_iv bytea,token_auth_tag bytea,company_name text,job_title text)
language plpgsql security definer set search_path=public as $$ begin return query
with candidate as (select d.id from public.promotional_email_deliveries d where d.email_type='verification'
  and (p_invitation_id is null or d.promotional_invitation_id=p_invitation_id) and d.state in ('pending','failed','sending')
  and d.next_attempt_at<=now() and (d.state<>'sending' or d.claimed_at<now()-interval '10 minutes') order by d.created_at for update skip locked limit 1),
claimed as (update public.promotional_email_deliveries d set state='sending',claimed_at=now(),updated_at=now() from candidate where d.id=candidate.id returning d.*)
select d.id,d.promotional_invitation_id,d.recipient_email,d.token_ciphertext,d.token_iv,d.token_auth_tag,c.name,i.requested_job_title
from claimed d join public.promotional_invitations i on i.id=d.promotional_invitation_id join public.companies c on c.id=i.company_id; end $$;

create function public.complete_promotional_verification_delivery(p_delivery_id uuid,p_provider_message_id text) returns boolean
language plpgsql security definer set search_path=public as $$ declare changed integer; begin
update public.promotional_email_deliveries set state='sent',provider_message_id=p_provider_message_id,sent_at=now(),last_error=null,claimed_at=null,updated_at=now()
where id=p_delivery_id and state='sending'; get diagnostics changed=row_count; return changed=1; end $$;
create function public.fail_promotional_verification_delivery(p_delivery_id uuid,p_error text) returns boolean
language plpgsql security definer set search_path=public as $$ declare changed integer; begin
update public.promotional_email_deliveries set state='failed',retry_count=retry_count+1,last_error=left(p_error,1000),claimed_at=null,
next_attempt_at=now()+least(interval '6 hours',interval '5 minutes'*power(2,least(retry_count,6))),updated_at=now()
where id=p_delivery_id and state='sending'; get diagnostics changed=row_count; return changed=1; end $$;

create function public.redeem_public_promotional_verification(p_token_digest bytea)
returns table(outcome text,job_id uuid) language plpgsql security definer set search_path=public as $$
declare invitation public.promotional_invitations%rowtype; new_job_id uuid; restaurant_name text;
begin
 select * into invitation from public.promotional_invitations where verification_token_digest=p_token_digest for update;
 if not found then return query select 'invalid'::text,null::uuid; return; end if;
 if invitation.redeemed_job_id is not null then return query select 'already_used'::text,invitation.redeemed_job_id; return; end if;
 if invitation.revoked_at is not null or invitation.eligibility_status<>'eligible' then return query select 'unavailable'::text,null::uuid; return; end if;
 if invitation.verification_expires_at is null or invitation.verification_expires_at<=now() or invitation.offer_expires_at<=now()
 then return query select 'expired'::text,null::uuid; return; end if;
 perform pg_advisory_xact_lock(hashtextextended(invitation.location_identity_key,73));
 if exists(select 1 from public.promotional_invitations i where i.location_identity_key=invitation.location_identity_key and i.id<>invitation.id and i.redeemed_job_id is not null)
 then update public.promotional_invitations set eligibility_status='ineligible',eligibility_reason='location_redeemed',updated_at=now() where id=invitation.id;
 return query select 'unavailable'::text,null::uuid; return; end if;
 update public.promotional_invitations set email_verified_at=coalesce(email_verified_at,now()),updated_at=now() where id=invitation.id;
 select name into strict restaurant_name from public.companies where id=invitation.company_id;
 insert into public.jobs(company_id,restaurant_name,title,role_category,city,state,country,employment_type,description,company_website,how_to_apply,
 external_apply_url,apply_email,employer_email,source_type,promotional_invitation_id,active,status,approved_at,expires_at)
 values(invitation.company_id,restaurant_name,invitation.requested_job_title,invitation.requested_job_title,invitation.requested_city,
 invitation.requested_state,invitation.requested_country,invitation.requested_employment_type,invitation.requested_description,
 invitation.requested_company_website,invitation.requested_application_url,invitation.requested_application_url,invitation.contact_email,
 invitation.contact_email,'outreach_free',invitation.id,false,'pending',null,null) returning id into new_job_id;
 update public.promotional_invitations set redeemed_at=now(),redeemed_job_id=new_job_id,updated_at=now() where id=invitation.id;
 return query select 'created'::text,new_job_id;
end $$;

revoke all on function public.create_public_promotional_request(text,text,text,text,text,text,text,text,text,text,text,bytea,bytea,timestamptz,bytea,bytea,bytea) from public,anon,authenticated;
revoke all on function public.claim_promotional_verification_delivery(uuid) from public,anon,authenticated;
revoke all on function public.complete_promotional_verification_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.fail_promotional_verification_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.redeem_public_promotional_verification(bytea) from public,anon,authenticated;
grant execute on function public.create_public_promotional_request(text,text,text,text,text,text,text,text,text,text,text,bytea,bytea,timestamptz,bytea,bytea,bytea) to service_role;
grant execute on function public.claim_promotional_verification_delivery(uuid) to service_role;
grant execute on function public.complete_promotional_verification_delivery(uuid,text) to service_role;
grant execute on function public.fail_promotional_verification_delivery(uuid,text) to service_role;
grant execute on function public.redeem_public_promotional_verification(bytea) to service_role;

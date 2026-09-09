-- Phase 1 foundation for the Free First Job offer. No offer issuance or expiry automation is installed.
create extension if not exists pgcrypto;
create table public.promotional_invitations (
  id uuid primary key default gen_random_uuid(),
  token_digest bytea not null unique check (octet_length(token_digest) = 32),
  verification_token_digest bytea unique check (verification_token_digest is null or octet_length(verification_token_digest) = 32),
  contact_email text not null check (btrim(contact_email) <> '' and contact_email = lower(btrim(contact_email))),
  company_id uuid not null references public.companies(id) on delete restrict,
  issued_at timestamptz not null default now(), offer_expires_at timestamptz not null,
  email_verified_at timestamptz, redeemed_at timestamptz, redeemed_job_id uuid,
  revoked_at timestamptz, revoked_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint promotional_invitations_expiry_check check (offer_expires_at > issued_at),
  constraint promotional_invitations_verification_check check (email_verified_at is null or (verification_token_digest is not null and email_verified_at >= issued_at)),
  constraint promotional_invitations_redemption_check check ((redeemed_at is null and redeemed_job_id is null) or (redeemed_at is not null and redeemed_job_id is not null and email_verified_at is not null and revoked_at is null)),
  constraint promotional_invitations_revocation_check check ((revoked_at is null and revoked_reason is null) or (revoked_at is not null and btrim(coalesce(revoked_reason, '')) <> ''))
);
alter table public.jobs drop constraint if exists jobs_source_type_check;
alter table public.jobs add constraint jobs_source_type_check check (source_type in ('employer', 'rnh_sourced', 'outreach_free'));
alter table public.jobs add column promotional_invitation_id uuid references public.promotional_invitations(id) on delete restrict;
alter table public.jobs add constraint jobs_promotional_invitation_source_check check ((source_type = 'outreach_free') = (promotional_invitation_id is not null));
create unique index jobs_promotional_invitation_unique_idx on public.jobs (promotional_invitation_id) where promotional_invitation_id is not null;
alter table public.promotional_invitations add constraint promotional_invitations_redeemed_job_fk foreign key (redeemed_job_id) references public.jobs(id) on delete restrict;
alter table public.promotional_invitations add constraint promotional_invitations_redeemed_job_unique unique (redeemed_job_id);

create or replace function public.enforce_promotional_job_invitation_link() returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_type = 'outreach_free' and not exists (select 1 from public.promotional_invitations i where i.id = new.promotional_invitation_id and (i.redeemed_job_id is null or i.redeemed_job_id = new.id))
  then raise exception 'promotional invitation is already redeemed by another job'; end if;
  return new;
end $$;
create trigger jobs_promotional_invitation_link before insert or update of source_type, promotional_invitation_id on public.jobs for each row execute function public.enforce_promotional_job_invitation_link();

alter table public.job_events drop constraint if exists job_events_source_type_check;
alter table public.job_events add constraint job_events_source_type_check check (source_type in ('employer', 'rnh_sourced', 'outreach_free'));
create table public.promotional_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  promotional_invitation_id uuid not null references public.promotional_invitations(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete restrict,
  email_type text not null check (email_type in ('verification', 'expiration_results')),
  recipient_email text not null check (btrim(recipient_email) <> '' and recipient_email = lower(btrim(recipient_email))),
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed')),
  retry_count integer not null default 0 check (retry_count >= 0), provider_message_id text, sent_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint promotional_email_delivery_target_check check ((email_type = 'verification' and job_id is null) or (email_type = 'expiration_results' and job_id is not null)),
  constraint promotional_email_delivery_sent_check check ((state = 'sent' and sent_at is not null and provider_message_id is not null) or (state <> 'sent' and sent_at is null))
);
create unique index promotional_email_verification_unique_idx on public.promotional_email_deliveries (promotional_invitation_id, email_type) where email_type = 'verification';
create unique index promotional_email_job_type_unique_idx on public.promotional_email_deliveries (job_id, email_type) where job_id is not null;
create index promotional_email_dispatch_idx on public.promotional_email_deliveries (state, created_at) where state in ('pending', 'failed');
alter table public.promotional_invitations enable row level security;
alter table public.promotional_email_deliveries enable row level security;
revoke all on public.promotional_invitations, public.promotional_email_deliveries from anon, authenticated;

-- This is the immediately preceding production definition from
-- 202608060001_auto_renew_job_ads.sql with exactly one eligibility predicate
-- added: source_type must be employer. ATS imports use employer ownership.
create or replace function public.renew_expired_job_ads()
returns table (renewed_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
  set expires_at = expires_at
    + ((floor(extract(epoch from (now() - expires_at)) / 2592000)::integer + 1) * interval '30 days')
  where source_type = 'employer'
    and status = 'active'
    and active = true
    and approved_at is not null
    and expires_at is not null
    and expires_at <= now();

  get diagnostics renewed_count = row_count;
  return next;
end;
$$;

revoke all on function public.renew_expired_job_ads() from public;
revoke all on function public.renew_expired_job_ads() from anon;
revoke all on function public.renew_expired_job_ads() from authenticated;
comment on column public.jobs.source_type is 'Listing ownership: employer (manual or ATS), admin-curated RNH sourced, or invitation-backed outreach free.';
comment on column public.promotional_invitations.token_digest is 'SHA-256 digest of the invitation bearer token; plaintext is never stored.';
comment on column public.promotional_invitations.verification_token_digest is 'SHA-256 digest of the email-verification bearer token; plaintext is never stored.';

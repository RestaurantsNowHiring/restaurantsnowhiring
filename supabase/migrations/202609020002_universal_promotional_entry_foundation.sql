-- Server-only foundation for the universal /post-free eligibility entry point.
-- This migration does not add a public submission API or create any jobs.
alter table public.promotional_invitations
  add column entry_source text not null default 'admin_invitation'
    check (entry_source in ('admin_invitation', 'public_request')),
  add column eligibility_status text not null default 'pending'
    check (eligibility_status in ('pending', 'eligible', 'ineligible')),
  add column eligibility_checked_at timestamptz,
  add column eligibility_reason text,
  add constraint promotional_invitation_eligibility_check check (
    (eligibility_status = 'pending' and eligibility_checked_at is null)
    or (eligibility_status in ('eligible', 'ineligible') and eligibility_checked_at is not null)
  );

-- The redeemed identity is the durable promotion boundary. Multiple outreach
-- invitations may exist, but only one may ever redeem for either identity.
create unique index promotional_redeemed_contact_unique_idx
  on public.promotional_invitations (contact_email)
  where redeemed_job_id is not null;
create unique index promotional_redeemed_company_unique_idx
  on public.promotional_invitations (company_id)
  where redeemed_job_id is not null;

create table public.promotional_entry_attempts (
  id bigint generated always as identity primary key,
  ip_digest bytea not null check (octet_length(ip_digest) = 32),
  contact_email text not null check (
    btrim(contact_email) <> '' and contact_email = lower(btrim(contact_email))
  ),
  outcome text not null check (outcome in ('allowed', 'rate_limited', 'rejected')),
  attempted_at timestamptz not null default now()
);
create index promotional_entry_attempts_ip_idx
  on public.promotional_entry_attempts (ip_digest, attempted_at desc);
create index promotional_entry_attempts_email_idx
  on public.promotional_entry_attempts (contact_email, attempted_at desc);
alter table public.promotional_entry_attempts enable row level security;
revoke all on public.promotional_entry_attempts from anon, authenticated;

create or replace function public.enforce_promotional_job_invitation_link()
returns trigger language plpgsql set search_path = public as $$
declare invitation public.promotional_invitations%rowtype;
begin
  if new.source_type <> 'outreach_free' then return new; end if;

  select * into invitation from public.promotional_invitations
    where id = new.promotional_invitation_id
    for update;
  if not found or invitation.revoked_at is not null
    or invitation.offer_expires_at <= now()
    or invitation.email_verified_at is null
    or invitation.eligibility_status <> 'eligible'
    or (invitation.redeemed_job_id is not null and invitation.redeemed_job_id <> new.id)
  then raise exception 'promotional invitation is not eligible for redemption'; end if;

  -- Serialize by both identities so separate invitations cannot race two jobs
  -- through the cross-table duplicate check.
  perform pg_advisory_xact_lock(hashtextextended(invitation.contact_email, 0));
  perform pg_advisory_xact_lock(hashtextextended(invitation.company_id::text, 0));
  if exists (
    select 1 from public.jobs existing_job
    join public.promotional_invitations existing_invitation
      on existing_invitation.id = existing_job.promotional_invitation_id
    where existing_job.id is distinct from new.id
      and (existing_invitation.contact_email = invitation.contact_email
        or existing_invitation.company_id = invitation.company_id)
  ) then raise exception 'promotional identity already has a job'; end if;

  -- A public submission can only create a reviewable draft. Publication is a
  -- separate Admin action and cannot be selected by the submission request.
  if tg_op = 'INSERT' and (
    new.active is distinct from false
    or coalesce(new.status, '') <> 'pending'
    or new.approved_at is not null
  ) then raise exception 'promotional jobs must begin pending Admin approval'; end if;
  return new;
end $$;

comment on table public.promotional_entry_attempts is
  'Server-only hashed-IP/email attempt ledger for promotional entry rate limiting; apply retention cleanup in the submission phase.';

-- Free First Job eligibility belongs to an exact, normalized restaurant location.
-- Email remains an abuse/rate-limit identity only, never an eligibility identity.
create or replace function public.normalize_promotional_location_component(value text)
returns text language sql immutable strict set search_path = public as $$
  select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'))
$$;

create or replace function public.promotional_location_identity(
  company_name text, city text, state_province text, country text
) returns text language sql immutable strict set search_path = public as $$
  select public.normalize_promotional_location_component(company_name) || chr(31)
    || public.normalize_promotional_location_component(city) || chr(31)
    || public.normalize_promotional_location_component(state_province) || chr(31)
    || case public.normalize_promotional_location_component(country)
      when 'us' then 'united states' when 'usa' then 'united states'
      when 'united states of america' then 'united states'
      when 'ca' then 'canada' else public.normalize_promotional_location_component(country)
    end
$$;

alter table public.promotional_invitations add column location_identity_key text;

create or replace function public.set_promotional_invitation_location_identity()
returns trigger language plpgsql set search_path = public as $$
declare company_name text;
begin
  if new.entry_source = 'public_request' then
    select name into strict company_name from public.companies where id = new.company_id;
    new.location_identity_key := public.promotional_location_identity(
      company_name, new.requested_city, new.requested_state, new.requested_country
    );
  end if;
  return new;
end $$;

create trigger promotional_invitations_set_location_identity
before insert or update of company_id, entry_source, requested_city, requested_state, requested_country
on public.promotional_invitations for each row
execute function public.set_promotional_invitation_location_identity();

update public.promotional_invitations invitation
set location_identity_key = public.promotional_location_identity(
  company.name, invitation.requested_city, invitation.requested_state, invitation.requested_country
)
from public.companies company
where company.id = invitation.company_id and invitation.entry_source = 'public_request';

update public.promotional_invitations invitation
set location_identity_key = public.promotional_location_identity(company.name, job.city, job.state, job.country)
from public.jobs job join public.companies company on company.id = job.company_id
where invitation.redeemed_job_id = job.id and invitation.location_identity_key is null;

do $$
declare collisions text;
begin
  select string_agg(location_identity_key, ', ' order by location_identity_key) into collisions
  from (
    select location_identity_key from public.promotional_invitations
    where location_identity_key is not null and (redeemed_job_id is not null or revoked_at is null)
    group by location_identity_key having count(*) > 1
  ) duplicate_locations;
  if collisions is not null then
    raise exception 'Cannot enforce promotional location uniqueness: duplicate locations require manual review: %', collisions;
  end if;
end $$;

drop index public.promotional_redeemed_contact_unique_idx;
drop index public.promotional_redeemed_company_unique_idx;
create unique index promotional_active_location_unique_idx
  on public.promotional_invitations (location_identity_key)
  where entry_source = 'public_request' and revoked_at is null and location_identity_key is not null;
create unique index promotional_redeemed_location_unique_idx
  on public.promotional_invitations (location_identity_key)
  where redeemed_job_id is not null and location_identity_key is not null;

create or replace function public.create_public_promotional_request(
  p_company_name text, p_company_website text, p_contact_name text, p_contact_email text,
  p_job_title text, p_city text, p_state text, p_country text, p_employment_type text,
  p_description text, p_application_url text, p_token_digest bytea, p_verification_token_digest bytea
) returns uuid language plpgsql security definer set search_path = public as $$
declare company_id uuid; invitation_id uuid; location_identity text;
begin
  location_identity := public.promotional_location_identity(p_company_name, p_city, p_state, p_country);
  perform pg_advisory_xact_lock(hashtextextended(location_identity, 73));
  if exists (select 1 from public.promotional_invitations
    where location_identity_key = location_identity
      and (redeemed_job_id is not null or (entry_source = 'public_request' and revoked_at is null)))
  then return null; end if;

  company_id := public.resolve_promotional_company(p_company_name, p_company_website);
  insert into public.promotional_invitations (
    company_id, contact_email, entry_source, eligibility_status, eligibility_checked_at,
    token_digest, verification_token_digest, offer_expires_at, contact_name,
    requested_company_website, requested_job_title, requested_city, requested_state,
    requested_country, requested_employment_type, requested_description, requested_application_url
  ) values (
    company_id, p_contact_email, 'public_request', 'eligible', now(),
    p_token_digest, p_verification_token_digest, now() + interval '7 days', p_contact_name,
    p_company_website, p_job_title, p_city, p_state, p_country, p_employment_type,
    p_description, p_application_url
  ) returning id into invitation_id;
  return invitation_id;
exception when unique_violation then
  if exists (select 1 from public.promotional_invitations where location_identity_key = location_identity)
  then return null; end if;
  raise;
end $$;

create or replace function public.enforce_promotional_job_invitation_link()
returns trigger language plpgsql set search_path = public as $$
declare invitation public.promotional_invitations%rowtype; location_identity text; company_name text;
begin
  if new.source_type <> 'outreach_free' then return new; end if;
  select * into invitation from public.promotional_invitations where id = new.promotional_invitation_id for update;
  if not found or invitation.revoked_at is not null or invitation.offer_expires_at <= now()
    or invitation.email_verified_at is null or invitation.eligibility_status <> 'eligible'
    or (invitation.redeemed_job_id is not null and invitation.redeemed_job_id <> new.id)
  then raise exception 'promotional invitation is not eligible for redemption'; end if;

  select name into strict company_name from public.companies where id = invitation.company_id;
  location_identity := coalesce(invitation.location_identity_key,
    public.promotional_location_identity(company_name, new.city, new.state, new.country));
  perform pg_advisory_xact_lock(hashtextextended(location_identity, 73));
  if exists (
    select 1 from public.jobs existing_job
    join public.promotional_invitations existing
      on existing.id = existing_job.promotional_invitation_id
    where existing_job.id is distinct from new.id and existing.id <> invitation.id
      and existing.location_identity_key = location_identity
  )
  then raise exception 'promotional location already has a job'; end if;
  if invitation.location_identity_key is null then
    update public.promotional_invitations set location_identity_key = location_identity where id = invitation.id;
  end if;

  if tg_op = 'INSERT' and (new.active is distinct from false or coalesce(new.status, '') <> 'pending' or new.approved_at is not null)
  then raise exception 'promotional jobs must begin pending Admin approval'; end if;
  return new;
end $$;

comment on column public.promotional_invitations.location_identity_key is
  'Server-derived normalized company + city + state/province + country promotion identity.';
revoke all on function public.normalize_promotional_location_component(text) from public, anon, authenticated;
revoke all on function public.promotional_location_identity(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_public_promotional_request(text, text, text, text, text, text, text, text, text, text, text, bytea, bytea) from public, anon, authenticated;
grant execute on function public.create_public_promotional_request(text, text, text, text, text, text, text, text, text, text, text, bytea, bytea) to service_role;

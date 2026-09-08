-- Correct the active-request guard without rewriting the already-issued location migration.
-- Non-overlapping validity windows permit a new request after expiration; redemption remains permanent.
create extension if not exists btree_gist;

drop index public.promotional_active_location_unique_idx;
alter table public.promotional_invitations
  add constraint promotional_active_location_exclusion
  exclude using gist (
    location_identity_key with =,
    tstzrange(issued_at, offer_expires_at, '[)') with &&
  ) where (entry_source = 'public_request' and revoked_at is null and location_identity_key is not null);

create or replace function public.set_promotional_invitation_location_identity()
returns trigger language plpgsql set search_path = public as $$
declare company_name text;
begin
  if new.entry_source = 'public_request' then
    select name into strict company_name from public.companies where id = new.company_id;
    new.location_identity_key := public.promotional_location_identity(
      company_name, new.requested_city, new.requested_state, new.requested_country
    );
    if tg_op = 'INSERT' then
      perform pg_advisory_xact_lock(hashtextextended(new.location_identity_key, 73));
      if exists (
        select 1 from public.promotional_invitations existing
        where existing.location_identity_key = new.location_identity_key
          and (existing.redeemed_job_id is not null or (
            existing.entry_source = 'public_request' and existing.revoked_at is null
            and existing.offer_expires_at > now()
          ))
      ) then
        raise exception using errcode = '23505', message = 'promotional location is unavailable';
      end if;
    end if;
  end if;
  return new;
end $$;

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
      and (redeemed_job_id is not null or (entry_source = 'public_request' and revoked_at is null
        and offer_expires_at > now())))
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
exception when unique_violation or exclusion_violation then
  if exists (select 1 from public.promotional_invitations where location_identity_key = location_identity
    and (redeemed_job_id is not null or (entry_source = 'public_request' and revoked_at is null
      and offer_expires_at > now())))
  then return null; end if;
  raise;
end $$;

revoke all on function public.create_public_promotional_request(text, text, text, text, text, text, text, text, text, text, text, bytea, bytea) from public, anon, authenticated;
grant execute on function public.create_public_promotional_request(text, text, text, text, text, text, text, text, text, text, text, bytea, bytea) to service_role;

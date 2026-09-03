alter table public.companies add column identity_key text;
update public.companies set identity_key = lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) where identity_key is null;
do $$
declare collisions text;
begin
  select string_agg(identity_key, ', ' order by identity_key) into collisions
  from (select identity_key from public.companies group by identity_key having count(*) > 1) duplicates;
  if collisions is not null then
    raise exception 'Cannot add companies identity uniqueness: normalized duplicate identities require manual review: %', collisions;
  end if;
end $$;
alter table public.companies alter column identity_key set not null;
create unique index companies_identity_key_unique_idx on public.companies (identity_key);

alter table public.promotional_invitations
  add column contact_name text,
  add column requested_company_website text,
  add column requested_job_title text,
  add column requested_city text,
  add column requested_state text,
  add column requested_country text check (requested_country is null or requested_country in ('United States', 'Canada')),
  add column requested_employment_type text,
  add column requested_description text,
  add column requested_application_url text,
  add constraint promotional_public_request_fields_check check (entry_source <> 'public_request' or (
    btrim(coalesce(contact_name, '')) <> '' and requested_company_website ~* '^https?://'
    and btrim(coalesce(requested_job_title, '')) <> '' and btrim(coalesce(requested_city, '')) <> ''
    and btrim(coalesce(requested_state, '')) <> '' and requested_country is not null
    and btrim(coalesce(requested_employment_type, '')) <> '' and btrim(coalesce(requested_description, '')) <> ''
    and requested_application_url ~* '^https?://'
  ));

comment on column public.companies.identity_key is 'Server-normalized exact company identity; clients may not select or write it.';

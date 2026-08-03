-- The first version of this table did not record which employer store was
-- selected. Those rows cannot be safely trusted, so discard them before making
-- the store relationship mandatory. This feature has not yet been released.
delete from public.employer_ats_location_mappings;

drop index if exists public.employer_ats_location_mappings_identity_idx;

alter table public.employer_ats_location_mappings
  add column if not exists employer_store_id uuid,
  add column if not exists ats_location_key text;

update public.employer_ats_location_mappings
set ats_provider = lower(btrim(ats_provider)),
    ats_location_key = regexp_replace(btrim(ats_location_value), '\s+', ' ', 'g');

alter table public.employer_ats_location_mappings
  alter column employer_store_id set not null,
  alter column ats_location_key set not null,
  add constraint employer_ats_location_mappings_store_fkey
    foreign key (employer_store_id) references public.employer_stores(id) on delete cascade,
  add constraint employer_ats_location_mappings_provider_normalized
    check (ats_provider = lower(btrim(ats_provider)) and ats_provider <> ''),
  add constraint employer_ats_location_mappings_location_key_normalized
    check (ats_location_key = regexp_replace(btrim(ats_location_value), '\s+', ' ', 'g'));

create unique index employer_ats_location_mappings_identity_idx
  on public.employer_ats_location_mappings
  (employer_account_id, ats_provider, ats_location_key);

drop trigger if exists employer_ats_location_mappings_touch_updated_at
  on public.employer_ats_location_mappings;
create trigger employer_ats_location_mappings_touch_updated_at
before update on public.employer_ats_location_mappings
for each row execute function public.touch_updated_at();

-- Intentionally no policies: browser clients cannot access this service-managed
-- table, while the service role used by ATS import bypasses RLS.

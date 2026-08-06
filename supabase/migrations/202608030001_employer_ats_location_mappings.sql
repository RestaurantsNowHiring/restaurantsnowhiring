create table if not exists public.employer_ats_location_mappings (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid not null references public.employer_accounts(id) on delete cascade,
  ats_provider text not null,
  ats_location_value text not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_ats_location_mappings_location_not_blank check (btrim(ats_location_value) <> ''),
  constraint employer_ats_location_mappings_city_not_blank check (btrim(city) <> ''),
  constraint employer_ats_location_mappings_state_length check (char_length(state) = 2)
);

create unique index if not exists employer_ats_location_mappings_identity_idx
  on public.employer_ats_location_mappings (employer_account_id, ats_provider, ats_location_value);

alter table public.employer_ats_location_mappings enable row level security;

-- Employer profile/account settings storage for /employer-dashboard/profile.
-- Run this in the Supabase SQL editor before enabling profile edits in production.

create table if not exists public.employer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_email text,
  company_name text,
  contact_name text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  support_email text,
  first_name text,
  last_name text,
  job_title text,
  jobs_open text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employer_profiles enable row level security;

create policy "Employers can view their own profile"
  on public.employer_profiles
  for select
  using (auth.uid() = user_id);

create policy "Employers can insert their own safe profile"
  on public.employer_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Employers can update their own safe profile"
  on public.employer_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_employer_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_employer_profiles_updated_at on public.employer_profiles;
create trigger set_employer_profiles_updated_at
  before update on public.employer_profiles
  for each row
  execute function public.set_employer_profiles_updated_at();

comment on table public.employer_profiles is 'Employer-owned account settings profile. Do not store billing status, admin status, Stripe IDs, or password values here.';

-- Additive store directory and reusable job ad template support.
-- Run after employer-team-access.sql so account helper functions are available.

create extension if not exists pgcrypto;

create table if not exists public.employer_stores (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid not null references public.employer_accounts(id) on delete cascade,
  location_name text not null,
  address text,
  city text,
  state text,
  store_email text,
  ta_email text,
  gm_op_email text,
  minimum_wage text,
  pay_range text,
  default_application_url text,
  active boolean not null default true,
  is_assignable_location boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_stores_location_name_not_blank check (length(btrim(location_name)) > 0),
  constraint employer_stores_store_email_format check (store_email is null or store_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint employer_stores_ta_email_format check (ta_email is null or ta_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint employer_stores_gm_op_email_format check (gm_op_email is null or gm_op_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

create table if not exists public.employer_job_templates (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid references public.employer_accounts(id) on delete cascade,
  template_name text not null,
  job_title text not null,
  role_category text,
  employment_type text,
  schedule text,
  pay_defaults text,
  job_description text,
  benefits text,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_job_templates_template_name_not_blank check (length(btrim(template_name)) > 0),
  constraint employer_job_templates_job_title_not_blank check (length(btrim(job_title)) > 0)
);

alter table public.employer_stores
  add column if not exists is_assignable_location boolean not null default true;

update public.employer_stores
set is_assignable_location = case
  when nullif(btrim(coalesce(address, '')), '') is null
    or nullif(btrim(coalesce(city, '')), '') is null
    or nullif(btrim(coalesce(state, '')), '') is null
    then false
  else true
end;

alter table public.jobs
  add column if not exists employer_store_id uuid references public.employer_stores(id) on delete set null,
  add column if not exists employer_job_template_id uuid references public.employer_job_templates(id) on delete set null;

create index if not exists employer_stores_account_state_active_idx
on public.employer_stores (employer_account_id, state, active);

create index if not exists employer_stores_account_assignable_active_idx
on public.employer_stores (employer_account_id, active, is_assignable_location);

create index if not exists employer_stores_account_location_idx
on public.employer_stores (employer_account_id, location_name);

create index if not exists employer_job_templates_account_active_idx
on public.employer_job_templates (employer_account_id, active);

create index if not exists employer_job_templates_default_active_idx
on public.employer_job_templates (is_default, active)
where employer_account_id is null;

create index if not exists jobs_employer_store_active_idx
on public.jobs (employer_store_id, status, active);

create index if not exists jobs_employer_template_idx
on public.jobs (employer_job_template_id);

drop trigger if exists employer_stores_touch_updated_at on public.employer_stores;
create trigger employer_stores_touch_updated_at
before update on public.employer_stores
for each row execute function public.touch_updated_at();

drop trigger if exists employer_job_templates_touch_updated_at on public.employer_job_templates;
create trigger employer_job_templates_touch_updated_at
before update on public.employer_job_templates
for each row execute function public.touch_updated_at();

alter table public.employer_stores enable row level security;
alter table public.employer_job_templates enable row level security;

revoke all on public.employer_stores from public, anon;
revoke all on public.employer_job_templates from public, anon;
grant select, insert, update, delete on public.employer_stores to authenticated;
grant select, insert, update, delete on public.employer_job_templates to authenticated;

drop policy if exists "Employer members can view stores" on public.employer_stores;
create policy "Employer members can view stores"
on public.employer_stores
for select
to authenticated
using (public.is_employer_account_member(employer_account_id));

drop policy if exists "Account owners can add stores" on public.employer_stores;
create policy "Account owners can add stores"
on public.employer_stores
for insert
to authenticated
with check (public.can_manage_employer_account(employer_account_id));

drop policy if exists "Account owners can update stores" on public.employer_stores;
create policy "Account owners can update stores"
on public.employer_stores
for update
to authenticated
using (public.can_manage_employer_account(employer_account_id))
with check (public.can_manage_employer_account(employer_account_id));

drop policy if exists "Account owners can remove stores" on public.employer_stores;
create policy "Account owners can remove stores"
on public.employer_stores
for delete
to authenticated
using (public.can_manage_employer_account(employer_account_id));

drop policy if exists "Employer members can view account and default templates" on public.employer_job_templates;
drop policy if exists "Employer members can view account templates" on public.employer_job_templates;
create policy "Employer members can view account templates"
on public.employer_job_templates
for select
to authenticated
using (employer_account_id is not null and public.is_employer_account_member(employer_account_id));

drop policy if exists "Account owners can add templates" on public.employer_job_templates;
create policy "Account owners can add templates"
on public.employer_job_templates
for insert
to authenticated
with check (employer_account_id is not null and public.can_manage_employer_account(employer_account_id));

drop policy if exists "Account owners can update templates" on public.employer_job_templates;
create policy "Account owners can update templates"
on public.employer_job_templates
for update
to authenticated
using (employer_account_id is not null and public.can_manage_employer_account(employer_account_id))
with check (employer_account_id is not null and public.can_manage_employer_account(employer_account_id));

drop policy if exists "Account owners can remove templates" on public.employer_job_templates;
create policy "Account owners can remove templates"
on public.employer_job_templates
for delete
to authenticated
using (employer_account_id is not null and public.can_manage_employer_account(employer_account_id));

delete from public.employer_job_templates
where employer_account_id is null
  and template_name = 'Great Service Representative / Cashier';

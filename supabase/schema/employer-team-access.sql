-- Multi-user employer accounts, role-based team access, and candidate notification routing.
-- Run after the existing employer profile, billing, jobs, and candidate submission schema.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'employer_user_role') then
    create type public.employer_user_role as enum ('account_owner', 'hiring_manager', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'candidate_notification_routing') then
    create type public.candidate_notification_routing as enum ('account_owner', 'job_poster', 'company_support', 'custom_job_email');
  end if;
end $$;

create table if not exists public.employer_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  account_name text,
  restaurant_brand_name text,
  company_name text,
  support_email text,
  default_candidate_notification_routing public.candidate_notification_routing not null default 'job_poster',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_accounts_owner_email_not_blank check (length(btrim(owner_email)) > 0),
  constraint employer_accounts_support_email_format check (support_email is null or support_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

drop index if exists employer_accounts_owner_user_unique;

create index if not exists employer_accounts_owner_user_idx
on public.employer_accounts (owner_user_id);

create table if not exists public.employer_team_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.employer_accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role public.employer_user_role not null default 'viewer',
  status text not null default 'active',
  can_manage_notification_routing boolean not null default false,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_team_members_status_allowed check (status in ('invited', 'active', 'disabled')),
  constraint employer_team_members_email_format check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

create unique index if not exists employer_team_members_account_email_unique
on public.employer_team_members (account_id, email);

create unique index if not exists employer_team_members_account_user_unique
on public.employer_team_members (account_id, user_id)
where user_id is not null;

alter table public.employer_accounts
  add column if not exists account_name text,
  add column if not exists restaurant_brand_name text;

alter table public.employer_profiles
  add column if not exists employer_account_id uuid references public.employer_accounts(id) on delete cascade;

alter table public.employer_billing
  add column if not exists employer_account_id uuid references public.employer_accounts(id) on delete cascade;

alter table public.jobs
  add column if not exists employer_account_id uuid references public.employer_accounts(id) on delete set null,
  add column if not exists posted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists posted_by_email text,
  add column if not exists candidate_notification_email text,
  add column if not exists candidate_notification_emails text[],
  add column if not exists candidate_notification_routing public.candidate_notification_routing not null default 'job_poster';

alter table public.candidate_submissions
  add column if not exists employer_account_id uuid references public.employer_accounts(id) on delete set null;

create index if not exists jobs_employer_account_created_at_idx
on public.jobs (employer_account_id, created_at desc);

create index if not exists candidate_submissions_employer_account_created_at_idx
on public.candidate_submissions (employer_account_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employer_accounts_touch_updated_at on public.employer_accounts;
create trigger employer_accounts_touch_updated_at
before update on public.employer_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists employer_team_members_touch_updated_at on public.employer_team_members;
create trigger employer_team_members_touch_updated_at
before update on public.employer_team_members
for each row execute function public.touch_updated_at();

-- Backfill path: every existing single-employer auth user/job owner becomes an Account Owner.
insert into public.employer_accounts (owner_user_id, owner_email, account_name, restaurant_brand_name, company_name, support_email)
select distinct on (source.owner_user_id)
  source.owner_user_id,
  source.owner_email,
  source.company_name,
  source.company_name,
  source.company_name,
  source.support_email
from (
  select
    profile.user_id as owner_user_id,
    coalesce(nullif(profile.login_email, ''), auth_user.email) as owner_email,
    profile.company_name,
    profile.support_email
  from public.employer_profiles profile
  join auth.users auth_user on auth_user.id = profile.user_id
  where coalesce(nullif(profile.login_email, ''), auth_user.email) is not null

  union all

  select
    job.employer_user_id as owner_user_id,
    coalesce(nullif(job.employer_email, ''), auth_user.email) as owner_email,
    max(job.restaurant_name) as company_name,
    max(job.apply_email) as support_email
  from public.jobs job
  join auth.users auth_user on auth_user.id = job.employer_user_id
  where job.employer_user_id is not null
  group by job.employer_user_id, coalesce(nullif(job.employer_email, ''), auth_user.email)
) source
where source.owner_user_id is not null
  and source.owner_email is not null
  and not exists (
    select 1
    from public.employer_team_members existing_member
    where existing_member.user_id = source.owner_user_id
      and existing_member.role = 'account_owner'
      and existing_member.status = 'active'
  );

update public.employer_accounts
set
  account_name = coalesce(account_name, company_name),
  restaurant_brand_name = coalesce(restaurant_brand_name, company_name)
where account_name is null
   or restaurant_brand_name is null;

insert into public.employer_team_members (account_id, user_id, email, role, status, can_manage_notification_routing)
select account.id, account.owner_user_id, lower(account.owner_email), 'account_owner', 'active', true
from public.employer_accounts account
on conflict (account_id, email) do update
set user_id = excluded.user_id, role = 'account_owner', status = 'active', can_manage_notification_routing = true, updated_at = now();

update public.employer_profiles profile
set employer_account_id = account.id
from public.employer_accounts account
where profile.user_id = account.owner_user_id
  and profile.employer_account_id is null;

update public.employer_billing billing
set employer_account_id = account.id
from public.employer_accounts account
where billing.user_id = account.owner_user_id
  and billing.employer_account_id is null;

update public.jobs job
set
  employer_account_id = account.id,
  posted_by_user_id = coalesce(job.posted_by_user_id, job.employer_user_id),
  posted_by_email = coalesce(job.posted_by_email, job.employer_email),
  candidate_notification_email = coalesce(job.candidate_notification_email, job.apply_email),
  candidate_notification_emails = coalesce(
    job.candidate_notification_emails,
    case
      when nullif(trim(coalesce(job.candidate_notification_email, job.apply_email, '')), '') is null then null
      else array[lower(trim(coalesce(job.candidate_notification_email, job.apply_email)))]
    end
  ),
  candidate_notification_routing = coalesce(job.candidate_notification_routing, 'job_poster')
from public.employer_accounts account
where job.employer_user_id = account.owner_user_id
  and job.employer_account_id is null;


update public.jobs job
set candidate_notification_emails = array[lower(trim(job.candidate_notification_email))]
where job.candidate_notification_emails is null
  and nullif(trim(coalesce(job.candidate_notification_email, '')), '') is not null;

update public.candidate_submissions submission
set employer_account_id = job.employer_account_id
from public.jobs job
where submission.job_id = job.id
  and submission.employer_account_id is null;

create or replace function public.employer_account_role(account_id_input uuid)
returns public.employer_user_role
language sql
stable
security definer
set search_path = public
as $$
  select member.role
  from public.employer_team_members member
  where member.account_id = account_id_input
    and member.status = 'active'
    and (
      member.user_id = auth.uid()
      or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  order by case member.role when 'account_owner' then 1 when 'hiring_manager' then 2 else 3 end
  limit 1;
$$;

create or replace function public.is_employer_account_member(account_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.employer_account_role(account_id_input) is not null;
$$;

create or replace function public.can_manage_employer_jobs(account_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.employer_account_role(account_id_input) in ('account_owner', 'hiring_manager');
$$;

create or replace function public.can_manage_employer_account(account_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.employer_account_role(account_id_input) = 'account_owner';
$$;

create or replace function public.can_manage_candidate_notification_routing(account_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employer_team_members member
    where member.account_id = account_id_input
      and member.status = 'active'
      and (
        member.user_id = auth.uid()
        or lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and (member.role = 'account_owner' or member.can_manage_notification_routing)
  );
$$;

alter table public.employer_accounts enable row level security;
alter table public.employer_team_members enable row level security;

revoke all on public.employer_accounts from public, anon;
revoke all on public.employer_team_members from public, anon;
grant select on public.employer_accounts to authenticated;
grant select, insert, update, delete on public.employer_team_members to authenticated;

drop policy if exists "Employer account members can view account" on public.employer_accounts;
create policy "Employer account members can view account"
on public.employer_accounts
for select
to authenticated
using (public.is_employer_account_member(id));

drop policy if exists "Account owners can update employer account" on public.employer_accounts;
create policy "Account owners can update employer account"
on public.employer_accounts
for update
to authenticated
using (public.can_manage_employer_account(id))
with check (public.can_manage_employer_account(id));

drop policy if exists "Account owners can view team members" on public.employer_team_members;
create policy "Account owners can view team members"
on public.employer_team_members
for select
to authenticated
using (public.can_manage_employer_account(account_id));

drop policy if exists "Account owners can add team members" on public.employer_team_members;
create policy "Account owners can add team members"
on public.employer_team_members
for insert
to authenticated
with check (public.can_manage_employer_account(account_id));

drop policy if exists "Account owners can update team members" on public.employer_team_members;
create policy "Account owners can update team members"
on public.employer_team_members
for update
to authenticated
using (public.can_manage_employer_account(account_id))
with check (public.can_manage_employer_account(account_id));

drop policy if exists "Account owners can remove team members" on public.employer_team_members;
create policy "Account owners can remove team members"
on public.employer_team_members
for delete
to authenticated
using (public.can_manage_employer_account(account_id));

-- Replace single-user job policies with account-aware policies while preserving legacy owner/email fallback.
drop policy if exists "Employers can read their own jobs" on public.jobs;
create policy "Employers can read their own jobs"
on public.jobs
for select
to authenticated
using (
  public.is_employer_account_member(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Employers can insert their own jobs" on public.jobs;
create policy "Employers can insert their own jobs"
on public.jobs
for insert
to authenticated
with check (
  public.can_manage_employer_jobs(employer_account_id)
  or employer_user_id = auth.uid()
);

drop policy if exists "Employers can pause and resume their own jobs" on public.jobs;
create policy "Employers can pause and resume their own jobs"
on public.jobs
for update
to authenticated
using (
  public.can_manage_employer_jobs(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.can_manage_employer_jobs(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Employers can delete their own jobs" on public.jobs;
create policy "Employers can delete their own jobs"
on public.jobs
for delete
to authenticated
using (
  public.can_manage_employer_jobs(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

-- Account-aware profile and billing read/write rules.
drop policy if exists "Employers can view their own profile" on public.employer_profiles;
create policy "Employers can view their own profile"
on public.employer_profiles
for select
to authenticated
using (user_id = auth.uid() or public.is_employer_account_member(employer_account_id));

drop policy if exists "Employers can insert their own safe profile" on public.employer_profiles;
create policy "Employers can insert their own safe profile"
on public.employer_profiles
for insert
to authenticated
with check (user_id = auth.uid() or public.can_manage_employer_account(employer_account_id));

drop policy if exists "Employers can update their own safe profile" on public.employer_profiles;
create policy "Employers can update their own safe profile"
on public.employer_profiles
for update
to authenticated
using (public.can_manage_employer_account(employer_account_id) or (employer_account_id is null and user_id = auth.uid()))
with check (public.can_manage_employer_account(employer_account_id) or (employer_account_id is null and user_id = auth.uid()));

drop policy if exists "Employers can read their own billing" on public.employer_billing;
create policy "Employers can read their own billing"
on public.employer_billing
for select
to authenticated
using (user_id = auth.uid() or public.can_manage_employer_account(employer_account_id));

-- Account-aware candidate visibility/status updates. Public inserts continue through the server API/service role.
drop policy if exists "Employers can read candidates for owned jobs" on public.candidate_submissions;
create policy "Employers can read candidates for owned jobs"
on public.candidate_submissions
for select
to authenticated
using (
  public.is_employer_account_member(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1 from public.jobs job
    where job.id = candidate_submissions.job_id
      and public.is_employer_account_member(job.employer_account_id)
  )
  or public.current_user_is_admin()
);

drop policy if exists "Employers can update status for owned job candidates" on public.candidate_submissions;
create policy "Employers can update status for owned job candidates"
on public.candidate_submissions
for update
to authenticated
using (
  public.is_employer_account_member(employer_account_id)
  or employer_user_id = auth.uid()
  or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (
    select 1 from public.jobs job
    where job.id = candidate_submissions.job_id
      and public.is_employer_account_member(job.employer_account_id)
  )
  or public.current_user_is_admin()
)
with check (
  status in ('new', 'reviewed', 'contacted', 'archived')
  and (
    public.is_employer_account_member(employer_account_id)
    or employer_user_id = auth.uid()
    or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from public.jobs job
      where job.id = candidate_submissions.job_id
        and public.is_employer_account_member(job.employer_account_id)
    )
    or public.current_user_is_admin()
  )
);

comment on table public.employer_accounts is 'Company-level employer account. Billing, profile, jobs, users, and notification defaults attach here.';
comment on table public.employer_team_members is 'Role-based users/invites for employer account access.';
comment on column public.jobs.candidate_notification_email is 'Legacy comma-separated per-job/location email list for candidate submission notifications.';
comment on column public.jobs.candidate_notification_emails is 'Normalized per-job/location email array for candidate submission notifications.';
comment on column public.jobs.candidate_notification_routing is 'Controls whether candidate emails use owner, poster, company support, or custom job email.';

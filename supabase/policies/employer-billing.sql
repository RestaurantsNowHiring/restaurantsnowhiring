-- Stripe subscription billing support for Restaurants Now Hiring.
--
-- Apply in the Supabase SQL Editor before enabling Stripe Checkout in production.
-- The app writes this table from server-side routes with SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.employer_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_status text not null default 'not_started',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employer_billing_customer_idx
on public.employer_billing (stripe_customer_id);

create index if not exists employer_billing_subscription_idx
on public.employer_billing (stripe_subscription_id);

alter table public.employer_billing enable row level security;

revoke all on public.employer_billing from public;
revoke all on public.employer_billing from anon;
revoke all on public.employer_billing from authenticated;

drop policy if exists "Employers can read their own billing" on public.employer_billing;
create policy "Employers can read their own billing"
on public.employer_billing
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on public.employer_billing to authenticated;

create or replace function public.touch_employer_billing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employer_billing_touch_updated_at on public.employer_billing;
create trigger employer_billing_touch_updated_at
before update on public.employer_billing
for each row
execute function public.touch_employer_billing_updated_at();

create or replace function public.employer_has_active_billing(employer_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employer_billing billing
    where billing.user_id = employer_id
      and (
        billing.billing_status in ('active', 'trialing')
        or billing.trial_ends_at > now()
      )
  );
$$;

revoke all on function public.employer_has_active_billing(uuid) from public;
revoke all on function public.employer_has_active_billing(uuid) from anon;
revoke all on function public.employer_has_active_billing(uuid) from authenticated;

create or replace function public.enforce_employer_billing_for_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employer_user_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' or (new.status = 'active' and new.active = true) then
    if not public.employer_has_active_billing(new.employer_user_id) then
      raise exception 'Employer billing must be active before posting or activating jobs.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_enforce_employer_billing on public.jobs;
create trigger jobs_enforce_employer_billing
before insert or update of active, status on public.jobs
for each row
execute function public.enforce_employer_billing_for_jobs();

-- Job ad automatic renewal for Restaurants Now Hiring.
--
-- Renewal rule:
-- - Active approved jobs renew for 30 days when they reach expires_at.
-- - Advance from the existing expires_at until the result is in the future.
-- - Preserve lifecycle, ownership, billing, and ATS fields.
-- - Public visibility remains status = 'active' and active = true.
--
-- The old five-day, one-day, and auto-pause emails are no longer sent.
-- Apply in the Supabase SQL Editor, then call /api/cron/pause-expired-jobs
-- from the existing external scheduler with CRON_SECRET.

alter table public.jobs
add column if not exists approved_at timestamptz,
add column if not exists expires_at timestamptz;

update public.jobs
set expires_at = approved_at + interval '30 days'
where approved_at is not null
  and expires_at is null;

create index if not exists jobs_expiration_lookup_idx
on public.jobs (status, active, expires_at);

create table if not exists public.job_expiration_email_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reminder_type text not null,
  sent_at timestamptz not null default now(),
  constraint job_expiration_email_events_type_check check (
    reminder_type in ('five_day', 'one_day', 'auto_paused')
  ),
  constraint job_expiration_email_events_job_type_unique unique (job_id, reminder_type)
);

create index if not exists job_expiration_email_events_job_idx
on public.job_expiration_email_events (job_id, reminder_type);

alter table public.job_expiration_email_events enable row level security;

revoke all on public.job_expiration_email_events from public;
revoke all on public.job_expiration_email_events from anon;
revoke all on public.job_expiration_email_events from authenticated;

create or replace function public.renew_expired_job_ads()
returns table (renewed_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
  set expires_at = expires_at
    + ((floor(extract(epoch from (now() - expires_at)) / 2592000)::integer + 1) * interval '30 days')
  where status = 'active'
    and active = true
    and approved_at is not null
    and expires_at is not null
    and expires_at <= now();

  get diagnostics renewed_count = row_count;
  return next;
end;
$$;

revoke all on function public.renew_expired_job_ads() from public;
revoke all on function public.renew_expired_job_ads() from anon;
revoke all on function public.renew_expired_job_ads() from authenticated;
drop function if exists public.pause_expired_job_ads();

-- Optional Supabase scheduled run. Requires the pg_cron extension to be enabled.
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule(
--   'renew-expired-job-ads-daily',
--   '15 8 * * *',
--   $$select public.renew_expired_job_ads();$$
-- );

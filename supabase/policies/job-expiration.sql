-- Job ad expiration for Restaurants Now Hiring.
--
-- Expiration rule:
-- - Active approved jobs pause at expires_at.
-- - Expiration is based on jobs.expires_at.
-- - Do not delete jobs, charge employers, or renew listings.
-- - Public visibility remains status = 'active' and active = true.
--
-- Reminder rule:
-- - Send employer emails 5 days before expiration, 1 day before expiration,
--   and immediately after auto-pause.
-- - public.job_expiration_email_events prevents duplicate reminders.
--
-- Apply in the Supabase SQL Editor. Then either:
-- 1) call public.pause_expired_job_ads() from Supabase pg_cron and schedule
--    /api/cron/pause-expired-jobs for reminder emails, or
-- 2) call /api/cron/pause-expired-jobs from an external scheduler with CRON_SECRET
--    to run reminders and the existing pause function together.

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

create or replace function public.pause_expired_job_ads()
returns table (paused_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
  set
    active = false,
    status = 'paused'
  where status = 'active'
    and active = true
    and expires_at is not null
    and expires_at <= now();

  get diagnostics paused_count = row_count;
  return next;
end;
$$;

revoke all on function public.pause_expired_job_ads() from public;
revoke all on function public.pause_expired_job_ads() from anon;
revoke all on function public.pause_expired_job_ads() from authenticated;

-- Optional Supabase scheduled run. Requires the pg_cron extension to be enabled.
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule(
--   'pause-expired-job-ads-daily',
--   '15 8 * * *',
--   $$select public.pause_expired_job_ads();$$
-- );

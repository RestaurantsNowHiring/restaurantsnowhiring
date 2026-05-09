-- Job ad expiration for Restaurants Now Hiring.
--
-- Expiration rule:
-- - Jobs pause after 30 days.
-- - Prefer approved_at when it is set.
-- - Fall back to created_at when approved_at is null.
-- - Do not delete jobs, charge employers, or renew listings.
-- - Public visibility remains status = 'active' and active = true.
--
-- Apply in the Supabase SQL Editor. Then either:
-- 1) call public.pause_expired_job_ads() from Supabase pg_cron, or
-- 2) call /api/cron/pause-expired-jobs from an external scheduler with CRON_SECRET.

alter table public.jobs
add column if not exists approved_at timestamptz;

create index if not exists jobs_expiration_lookup_idx
on public.jobs (status, active, approved_at, created_at);

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
    and coalesce(approved_at, created_at) <= now() - interval '30 days';

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

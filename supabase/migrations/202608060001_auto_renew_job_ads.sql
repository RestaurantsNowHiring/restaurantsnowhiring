-- Replace expiration auto-pause with idempotent 30-day renewal.
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

-- Retire the old mutation so no database scheduler can continue auto-pausing jobs.
drop function if exists public.pause_expired_job_ads();

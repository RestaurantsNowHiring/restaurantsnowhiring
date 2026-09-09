-- Phase 5: durably archive promotional jobs after their one-time 30-day run.
-- Query-time visibility also enforces expires_at so cron timing cannot extend it.
create or replace function public.expire_outreach_free_job_ads()
returns table (expired_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
  set active = false,
      status = 'archived'
  where source_type = 'outreach_free'
    and status = 'active'
    and active = true
    and approved_at is not null
    and expires_at is not null
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return next;
end;
$$;

revoke all on function public.expire_outreach_free_job_ads() from public;
revoke all on function public.expire_outreach_free_job_ads() from anon;
revoke all on function public.expire_outreach_free_job_ads() from authenticated;

-- Add dedicated job listing expiration timestamp and update expiration RPC.
alter table public.jobs
add column if not exists expires_at timestamptz;

update public.jobs
set expires_at = approved_at + interval '30 days'
where approved_at is not null
  and expires_at is null;

create index if not exists jobs_expires_at_idx
on public.jobs (expires_at);

create index if not exists jobs_expiration_lookup_idx
on public.jobs (status, active, expires_at);

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

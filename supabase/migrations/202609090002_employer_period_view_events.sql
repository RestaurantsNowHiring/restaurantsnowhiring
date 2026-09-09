-- Employer view deduplication is scoped to the current paid advertising period.
-- Historical events remain immutable and available for lifetime analytics.
drop index if exists public.job_events_unique_session_view_idx;

create unique index job_events_unique_session_view_non_employer_idx
on public.job_events (job_id, session_id)
where event_type = 'job_view' and source_type <> 'employer';

create or replace function public.record_job_event(p_job_id uuid, p_event_type text, p_session_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  j public.jobs%rowtype;
  period_start timestamptz;
begin
  if p_event_type not in ('job_view','apply_click') or length(p_session_id) not between 16 and 128 then raise exception 'invalid event'; end if;
  select * into j from public.jobs where id = p_job_id and active = true and coalesce(status, 'active') = 'active' for update;
  if not found then raise exception 'job unavailable'; end if;

  if p_event_type = 'job_view' and j.source_type = 'employer' then
    -- ATS imports retain their existing lifetime session deduplication behavior.
    if j.ats_provider is null and j.expires_at is not null then
      period_start := greatest(j.expires_at - interval '30 days', j.approved_at);
      if exists (select 1 from public.job_events e where e.job_id = j.id and e.event_type = 'job_view' and e.session_id = p_session_id and e.created_at >= period_start) then return; end if;
    elsif exists (select 1 from public.job_events e where e.job_id = j.id and e.event_type = 'job_view' and e.session_id = p_session_id) then
      return;
    end if;
  end if;

  insert into public.job_events(job_id, company_id, source_type, event_type, session_id)
  values (j.id, j.company_id, j.source_type, p_event_type, p_session_id)
  on conflict (job_id, session_id) where event_type = 'job_view' and source_type <> 'employer' do nothing;
end $$;

grant execute on function public.record_job_event(uuid,text,text) to anon, authenticated;

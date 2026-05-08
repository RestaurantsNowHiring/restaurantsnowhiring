-- Employer dashboard Pause/Resume RLS support.
--
-- Apply this in the Supabase SQL editor if authenticated Pause/Resume updates
-- return no rows after the dashboard ownership check passes.
--
-- Security intent:
-- - only signed-in users can use these policies
-- - employers can read/update only jobs linked to their own auth user id
-- - MVP fallback permits matching the signed-in user's JWT email when older rows
--   have employer_email but not employer_user_id
-- - the app update path only writes status and active for Pause/Resume

alter table public.jobs enable row level security;

drop policy if exists "Employers can read their own jobs" on public.jobs;
create policy "Employers can read their own jobs"
on public.jobs
for select
to authenticated
using (
  employer_user_id = (select auth.uid())
  or (
    employer_email is not null
    and lower(employer_email) = lower((select auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Employers can pause and resume their own jobs" on public.jobs;
create policy "Employers can pause and resume their own jobs"
on public.jobs
for update
to authenticated
using (
  employer_user_id = (select auth.uid())
  or (
    employer_email is not null
    and lower(employer_email) = lower((select auth.jwt() ->> 'email'))
  )
)
with check (
  employer_user_id = (select auth.uid())
  or (
    employer_email is not null
    and lower(employer_email) = lower((select auth.jwt() ->> 'email'))
  )
);

-- Optional hardening if authenticated users should not update any other jobs
-- columns through separate flows:
-- revoke update on public.jobs from authenticated;
-- grant update (active, status) on public.jobs to authenticated;

-- Candidate interest/submission storage for public job detail pages.
-- Run this in the Supabase SQL Editor, then ensure the Next.js server has
-- SUPABASE_SERVICE_ROLE_KEY configured. Public browser clients should not write
-- this table or storage bucket directly; /api/jobs/[id]/candidate-submissions
-- performs validation, private resume upload, row insert, and email notification.

create extension if not exists pgcrypto;

create table if not exists public.candidate_submissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  employer_user_id uuid references auth.users(id) on delete set null,
  employer_email text,
  candidate_name text not null,
  candidate_email text not null,
  candidate_phone text not null,
  message text,
  resume_path text,
  resume_filename text,
  resume_mime_type text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint candidate_submissions_name_not_blank check (length(btrim(candidate_name)) > 0),
  constraint candidate_submissions_email_not_blank check (length(btrim(candidate_email)) > 0),
  constraint candidate_submissions_phone_not_blank check (length(btrim(candidate_phone)) > 0),
  constraint candidate_submissions_status_allowed check (status in ('new', 'reviewed', 'contacted', 'archived')),
  constraint candidate_submissions_resume_mime_allowed check (
    resume_mime_type is null
    or resume_mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

create index if not exists candidate_submissions_job_created_at_idx
on public.candidate_submissions (job_id, created_at desc);

create index if not exists candidate_submissions_employer_user_created_at_idx
on public.candidate_submissions (employer_user_id, created_at desc);

create index if not exists candidate_submissions_employer_email_created_at_idx
on public.candidate_submissions (lower(employer_email), created_at desc);

alter table public.candidate_submissions enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users admin_user
    where lower(admin_user.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or lower(coalesce(auth.jwt() ->> 'email', '')) = 'team@restaurantsnowhiring.com';
$$;

create policy "Employers can read candidates for owned jobs"
  on public.candidate_submissions
  for select
  using (
    employer_user_id = auth.uid()
    or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1
      from public.jobs job
      where job.id = candidate_submissions.job_id
        and (
          job.employer_user_id = auth.uid()
          or lower(coalesce(job.employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
    or public.current_user_is_admin()
  );

create policy "Employers can update status for owned job candidates"
  on public.candidate_submissions
  for update
  using (
    employer_user_id = auth.uid()
    or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1
      from public.jobs job
      where job.id = candidate_submissions.job_id
        and (
          job.employer_user_id = auth.uid()
          or lower(coalesce(job.employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
    or public.current_user_is_admin()
  )
  with check (
    status in ('new', 'reviewed', 'contacted', 'archived')
    and (
      employer_user_id = auth.uid()
      or lower(coalesce(employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or exists (
        select 1
        from public.jobs job
        where job.id = candidate_submissions.job_id
          and (
            job.employer_user_id = auth.uid()
            or lower(coalesce(job.employer_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
      or public.current_user_is_admin()
    )
  );

-- Public candidate submissions are accepted through the server API using the
-- service role key, so no anon INSERT policy is added here. This keeps direct
-- database abuse and service-role leakage out of browser code.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-resumes',
  'candidate-resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Resume files remain private. The app uploads with SUPABASE_SERVICE_ROLE_KEY
-- and creates short-lived signed URLs only after employer/admin authorization.
-- No public storage read policy is required for candidate-resumes.

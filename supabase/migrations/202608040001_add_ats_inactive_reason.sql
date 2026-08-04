alter table public.jobs
  add column if not exists ats_inactive_reason text null;

alter table public.jobs
  add constraint jobs_ats_inactive_reason_check
  check (
    ats_inactive_reason is null
    or ats_inactive_reason in (
      'closed_in_ats',
      'employer_deactivated',
      'admin_rejected',
      'connection_unavailable',
      'review_required'
    )
  );

comment on column public.jobs.ats_inactive_reason is
  'Durable reason an ATS-imported job is inactive; NULL for existing and manual jobs.';

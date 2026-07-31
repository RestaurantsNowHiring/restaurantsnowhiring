-- Add ATS provenance and durable provider identity to jobs.
alter table public.jobs
  add column if not exists source_type text not null default 'manual',
  add column if not exists ats_provider text,
  add column if not exists ats_external_job_id text,
  add column if not exists ats_source_url text,
  add column if not exists ats_apply_url text,
  add column if not exists ats_last_synced_at timestamptz,
  add column if not exists ats_remote_updated_at timestamptz;

alter table public.jobs
  add constraint jobs_source_type_check
  check (source_type in ('manual', 'ats'));

alter table public.jobs
  add constraint jobs_ats_identity_check
  check (
    source_type <> 'ats'
    or (
      employer_account_id is not null
      and ats_provider is not null
      and btrim(ats_provider) <> ''
      and ats_external_job_id is not null
      and btrim(ats_external_job_id) <> ''
      and ats_source_url is not null
      and btrim(ats_source_url) <> ''
    )
  );

create unique index jobs_ats_identity_unique_idx
on public.jobs (employer_account_id, ats_provider, ats_external_job_id)
where source_type = 'ats';

comment on column public.jobs.source_type is 'Identifies whether a job was created manually or imported from an ATS.';
comment on column public.jobs.ats_provider is 'Provider key for an ATS-imported job.';
comment on column public.jobs.ats_external_job_id is 'Stable provider-side identifier for an ATS-imported job.';
comment on column public.jobs.ats_source_url is 'Provider source URL for an ATS-imported job.';
comment on column public.jobs.ats_apply_url is 'External application destination for an ATS-imported job.';
comment on column public.jobs.ats_last_synced_at is 'Time RNH last successfully processed the job from its ATS.';
comment on column public.jobs.ats_remote_updated_at is 'Provider-reported time the ATS job was last updated.';

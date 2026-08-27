-- Additive support for admin-curated jobs, anonymous engagement, and verified company claims.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  website text,
  employer_account_id uuid references public.employer_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists companies_name_lower_idx on public.companies (lower(btrim(name)));
alter table public.companies drop constraint if exists companies_name_key;
alter table public.companies add constraint companies_name_key unique (name);

alter table public.jobs drop constraint if exists jobs_source_type_check;
update public.jobs set source_type = 'employer' where source_type in ('manual', 'ats') or source_type is null;
alter table public.jobs alter column source_type set default 'employer';
alter table public.jobs
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists source_url text,
  add column if not exists external_apply_url text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists review_due_at timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists retired_reason text;
alter table public.jobs add constraint jobs_source_type_check check (source_type in ('employer', 'rnh_sourced'));
alter table public.jobs add constraint jobs_sourced_requirements_check check (
  source_type <> 'rnh_sourced' or (
    employer_user_id is null and employer_account_id is null and company_id is not null
    and source_url ~* '^https?://' and external_apply_url ~* '^https?://'
  )
);
create index if not exists jobs_sourced_review_idx on public.jobs (review_due_at) where source_type = 'rnh_sourced';

-- ATS is an employer ingestion method, not a public listing ownership type.
drop index if exists jobs_ats_identity_unique_idx;
create unique index jobs_ats_identity_unique_idx on public.jobs (employer_account_id, ats_provider, ats_external_job_id)
where ats_provider is not null;
alter table public.jobs drop constraint if exists jobs_ats_identity_check;
alter table public.jobs add constraint jobs_ats_identity_check check (
  ats_provider is null or (source_type = 'employer' and employer_account_id is not null
    and btrim(ats_provider) <> '' and btrim(coalesce(ats_external_job_id, '')) <> ''
    and btrim(coalesce(ats_source_url, '')) <> '')
);

create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  source_type text not null check (source_type in ('employer', 'rnh_sourced')),
  event_type text not null check (event_type in ('job_view', 'apply_click')),
  session_id text not null check (length(session_id) between 16 and 128),
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_created_idx on public.job_events (job_id, created_at desc);
create index if not exists job_events_company_created_idx on public.job_events (company_id, created_at desc);
create unique index if not exists job_events_unique_session_view_idx on public.job_events (job_id, session_id)
where event_type = 'job_view';

create table if not exists public.company_claims (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
  employer_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(), verified_at timestamptz,
  unique (company_id, employer_user_id)
);

create or replace function public.record_job_event(p_job_id uuid, p_event_type text, p_session_id text)
returns void language plpgsql security definer set search_path = public as $$
declare j public.jobs%rowtype;
begin
  if p_event_type not in ('job_view','apply_click') or length(p_session_id) not between 16 and 128 then raise exception 'invalid event'; end if;
  select * into j from public.jobs where id = p_job_id and active = true and coalesce(status, 'active') = 'active';
  if not found then raise exception 'job unavailable'; end if;
  insert into public.job_events(job_id, company_id, source_type, event_type, session_id)
  values (j.id, j.company_id, j.source_type, p_event_type, p_session_id)
  on conflict (job_id, session_id) where event_type = 'job_view' do nothing;
end $$;
grant execute on function public.record_job_event(uuid,text,text) to anon, authenticated;

create or replace function public.retire_sourced_jobs_after_verified_claim() returns trigger
language plpgsql security definer set search_path = public as $$
declare account_id uuid;
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    select id into account_id from public.employer_accounts where owner_user_id = new.employer_user_id order by created_at limit 1;
    if account_id is null then raise exception 'verified claim requires an existing employer account'; end if;
    update public.companies set employer_account_id = account_id, updated_at = now() where id = new.company_id;
    new.verified_at := coalesce(new.verified_at, now());
    update public.jobs set status='retired', active=false, retired_at=now(), retired_reason='employer_claimed'
      where company_id=new.company_id and source_type='rnh_sourced' and status='active';
  end if;
  return new;
end $$;
drop trigger if exists company_claim_verified on public.company_claims;
create trigger company_claim_verified before update of status on public.company_claims for each row execute function public.retire_sourced_jobs_after_verified_claim();

alter table public.companies enable row level security; alter table public.job_events enable row level security; alter table public.company_claims enable row level security;
revoke all on public.companies, public.job_events, public.company_claims from anon, authenticated;
grant select on public.companies to anon, authenticated;
grant select, insert on public.company_claims to authenticated;
create policy "Public can read companies" on public.companies for select using (true);
create policy "Employers can request claims" on public.company_claims for insert to authenticated with check (employer_user_id=auth.uid() and status='pending' and verified_at is null);
create policy "Employers can read own claims" on public.company_claims for select to authenticated using (employer_user_id=auth.uid());

-- Prevent employer policies from mutating sourced listings. Admin writes use the service role.
drop policy if exists "Employers can pause and resume their own jobs" on public.jobs;
create policy "Employers can pause and resume their own jobs" on public.jobs for update to authenticated
using (source_type='employer' and (public.can_manage_employer_jobs(employer_account_id) or employer_user_id=auth.uid() or lower(coalesce(employer_email,''))=lower(coalesce(auth.jwt()->>'email',''))))
with check (source_type='employer' and (public.can_manage_employer_jobs(employer_account_id) or employer_user_id=auth.uid() or lower(coalesce(employer_email,''))=lower(coalesce(auth.jwt()->>'email',''))));
drop policy if exists "Employers can delete their own jobs" on public.jobs;
create policy "Employers can delete their own jobs" on public.jobs for delete to authenticated
using (source_type='employer' and (public.can_manage_employer_jobs(employer_account_id) or employer_user_id=auth.uid() or lower(coalesce(employer_email,''))=lower(coalesce(auth.jwt()->>'email',''))));

comment on column public.jobs.source_type is 'Listing ownership: employer-posted (including ATS imports) or admin-curated RNH sourced.';
comment on table public.job_events is 'Anonymous job engagement; intentionally stores no IP address or candidate PII.';

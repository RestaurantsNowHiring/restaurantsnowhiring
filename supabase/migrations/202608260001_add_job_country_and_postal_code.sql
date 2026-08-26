-- Existing job rows are United States postings; the default preserves that behavior.
alter table public.jobs
  add column if not exists country text not null default 'United States',
  add column if not exists postal_code text;

alter table public.jobs drop constraint if exists jobs_country_check;
alter table public.jobs
  add constraint jobs_country_check check (country in ('United States', 'Canada'));

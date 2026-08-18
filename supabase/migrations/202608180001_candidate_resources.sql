create table if not exists public.candidate_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  category text not null check (category in ('Resume Help', 'Interview Preparation', 'What to Wear', 'Practice Interview Questions', 'Questions to Ask Restaurants / Employers')),
  resource_type text not null check (resource_type in ('video', 'article')),
  url text check (url is null or url ~ '^https?://'),
  source text not null check (length(trim(source)) > 0),
  description text,
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^https?://'),
  sort_order integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_candidate_resource_has_url check (not active or url is not null)
);

create index if not exists candidate_resources_public_order_idx on public.candidate_resources (category, sort_order, title) where active;
create index if not exists candidate_resources_admin_filters_idx on public.candidate_resources (active, resource_type, category);

create or replace function public.set_candidate_resources_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists candidate_resources_updated_at on public.candidate_resources;
create trigger candidate_resources_updated_at before update on public.candidate_resources for each row execute function public.set_candidate_resources_updated_at();

alter table public.candidate_resources enable row level security;
drop policy if exists "Public can read published candidate resources" on public.candidate_resources;
create policy "Public can read published candidate resources" on public.candidate_resources for select to anon, authenticated using (active = true);

-- Writes intentionally have no browser-facing policy. Existing admin APIs verify the
-- admin session and then write server-side with the service role.

comment on table public.candidate_resources is 'Admin-managed job seeker videos and articles. Initial category inventory is enforced by the category constraint; source resource rows await verified titles and URLs.';

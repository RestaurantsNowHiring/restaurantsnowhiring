create table public.employer_ats_connections (
  id uuid primary key default gen_random_uuid(),
  employer_account_id uuid not null
    references public.employer_accounts(id) on delete cascade,
  provider_key text not null,
  input_url text not null,
  source_url text not null,
  source_url_key text not null,
  enabled boolean not null default true,
  connection_status text not null default 'active',
  connected_by_user_id uuid
    references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_sync_started_at timestamptz,
  last_successful_sync_at timestamptz,
  last_failed_sync_at timestamptz,
  consecutive_failure_count integer not null default 0,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_ats_connections_provider_normalized
    check (provider_key = lower(btrim(provider_key)) and provider_key <> ''),
  constraint employer_ats_connections_input_url_not_blank
    check (btrim(input_url) <> ''),
  constraint employer_ats_connections_source_url_not_blank
    check (btrim(source_url) <> ''),
  constraint employer_ats_connections_source_url_key_normalized
    check (
      source_url_key = btrim(source_url_key)
      and source_url_key <> ''
      and position('#' in source_url_key) = 0
    ),
  constraint employer_ats_connections_status_allowed
    check (connection_status in ('active', 'disconnected', 'error')),
  constraint employer_ats_connections_failure_count_nonnegative
    check (consecutive_failure_count >= 0),
  constraint employer_ats_connections_failure_code_length
    check (last_failure_code is null or char_length(last_failure_code) <= 100)
);

create unique index employer_ats_connections_identity_idx
  on public.employer_ats_connections
  (employer_account_id, provider_key, source_url_key);

create index employer_ats_connections_sync_lookup_idx
  on public.employer_ats_connections (connection_status, last_sync_started_at)
  where enabled = true and connection_status in ('active', 'error');

drop trigger if exists employer_ats_connections_touch_updated_at
  on public.employer_ats_connections;
create trigger employer_ats_connections_touch_updated_at
before update on public.employer_ats_connections
for each row execute function public.touch_updated_at();

alter table public.employer_ats_connections enable row level security;

-- Intentionally no policies: service-role server code manages connections and
-- browser clients receive no direct access through the Data API.

comment on table public.employer_ats_connections is
  'Durable employer ATS sources and their current synchronization state.';
comment on column public.employer_ats_connections.provider_key is
  'Normalized lowercase key from the application ATS provider registry.';
comment on column public.employer_ats_connections.input_url is
  'Employer-entered careers-page URL.';
comment on column public.employer_ats_connections.source_url is
  'Server-discovered provider board or source URL refreshed by synchronization.';
comment on column public.employer_ats_connections.source_url_key is
  'Application-normalized source identity: trimmed, scheme and host case-normalized, and fragment-free.';
comment on column public.employer_ats_connections.enabled is
  'Whether this connection is eligible for synchronization.';
comment on column public.employer_ats_connections.connection_status is
  'Current state: active, intentionally disconnected, or configured with an error.';
comment on column public.employer_ats_connections.last_successful_sync_at is
  'Time the most recent successful synchronization completed.';
comment on column public.employer_ats_connections.consecutive_failure_count is
  'Number of consecutive synchronization failures since the last success.';
comment on column public.employer_ats_connections.last_failure_code is
  'Bounded machine-readable failure code; never raw exception or provider content.';

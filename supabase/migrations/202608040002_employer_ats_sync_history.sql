create table public.employer_ats_sync_history (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.employer_ats_connections(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz null,
  status text not null,
  completed integer not null default 0,
  updated integer not null default 0,
  closed integer not null default 0,
  reopened integer not null default 0,
  new_available integer not null default 0,
  needs_review integer not null default 0,
  failed integer not null default 0,
  warning_message text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint employer_ats_sync_history_status_allowed
    check (status in ('running', 'completed', 'completed_with_warning', 'failed')),
  constraint employer_ats_sync_history_counts_nonnegative
    check (
      completed >= 0 and updated >= 0 and closed >= 0 and reopened >= 0
      and new_available >= 0 and needs_review >= 0 and failed >= 0
    )
);

create index employer_ats_sync_history_connection_started_idx
  on public.employer_ats_sync_history (connection_id, started_at desc);

drop trigger if exists employer_ats_sync_history_touch_updated_at
  on public.employer_ats_sync_history;
create trigger employer_ats_sync_history_touch_updated_at
before update on public.employer_ats_sync_history
for each row execute function public.touch_updated_at();

alter table public.employer_ats_sync_history enable row level security;

-- Intentionally no policies: service-role server code writes history and browser
-- clients receive history only through permission-checked application APIs.

comment on table public.employer_ats_sync_history is
  'Employer-facing ATS synchronization run history with safe summary counts only.';
comment on column public.employer_ats_sync_history.warning_message is
  'Safe employer-facing warning text only; never provider payloads, URLs, stack traces, raw exceptions, or failure codes.';

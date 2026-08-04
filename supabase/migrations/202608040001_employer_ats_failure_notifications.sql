alter table public.employer_ats_connections
  add column failure_notification_sent_at timestamptz;

comment on column public.employer_ats_connections.failure_notification_sent_at is
  'Time an account owner email was sent for the current ATS synchronization failure streak; cleared after a successful sync.';

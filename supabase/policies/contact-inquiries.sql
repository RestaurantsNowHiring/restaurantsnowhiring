-- Contact inquiry storage for Restaurants Now Hiring.
-- Run this in the Supabase SQL Editor if public.contact_inquiries does not exist.
-- The Next.js API stores contact submissions with SUPABASE_SERVICE_ROLE_KEY.
-- Admin reads happen through /api/admin/contact-inquiries after admin auth.

create extension if not exists pgcrypto;

create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now(),
  status text not null default 'new',
  is_read boolean not null default false,
  constraint contact_inquiries_name_not_blank check (length(btrim(name)) > 0),
  constraint contact_inquiries_email_not_blank check (length(btrim(email)) > 0),
  constraint contact_inquiries_subject_not_blank check (length(btrim(subject)) > 0),
  constraint contact_inquiries_message_not_blank check (length(btrim(message)) > 0)
);

create index if not exists contact_inquiries_created_at_idx
on public.contact_inquiries (created_at desc);

alter table public.contact_inquiries enable row level security;

-- No browser/client policies are required. Server routes use the service role key,
-- which bypasses RLS, so API keys remain server-side only.

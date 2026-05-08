-- Admin management for Restaurants Now Hiring.
-- Run this in Supabase SQL Editor or with:
--   supabase db push
-- if you use the Supabase CLI with this file included in your database changes.

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now(),
  created_by_email text,
  constraint admin_users_email_normalized check (email = lower(btrim(email))),
  constraint admin_users_created_by_email_normalized check (
    created_by_email is null or created_by_email = lower(btrim(created_by_email))
  )
);

create or replace function public.normalize_admin_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));

  if new.created_by_email is not null then
    new.created_by_email := lower(btrim(new.created_by_email));
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_admin_user_email on public.admin_users;
create trigger normalize_admin_user_email
before insert or update on public.admin_users
for each row
execute function public.normalize_admin_user_email();

alter table public.admin_users enable row level security;

create or replace function public.is_admin_user(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = lower(btrim(check_email))
  );
$$;

revoke all on function public.is_admin_user(text) from public;
grant execute on function public.is_admin_user(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert on public.admin_users to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin_user(auth.jwt() ->> 'email'));

drop policy if exists "Admins can insert admin users" on public.admin_users;
create policy "Admins can insert admin users"
on public.admin_users
for insert
to authenticated
with check (
  public.is_admin_user(auth.jwt() ->> 'email')
  and email = lower(btrim(email))
);

-- Forward-only hardening for the already-deployed Phase 3 public entry schema.
create or replace function public.normalize_company_identity(company_name text)
returns text language sql immutable strict parallel safe
set search_path = public
as $$ select lower(regexp_replace(btrim(company_name), '\s+', ' ', 'g')) $$;

create or replace function public.set_company_identity_key()
returns trigger language plpgsql set search_path = public as $$
begin
  new.identity_key := public.normalize_company_identity(new.name);
  return new;
end $$;

drop trigger if exists companies_set_identity_key on public.companies;
create trigger companies_set_identity_key
before insert or update of name, identity_key on public.companies
for each row execute function public.set_company_identity_key();

-- All matching and creation uses the same database canonicalizer as the trigger.
create or replace function public.resolve_promotional_company(p_name text, p_website text)
returns uuid language plpgsql security definer set search_path = public as $$
declare company_identity text; resolved_id uuid;
begin
  company_identity := public.normalize_company_identity(p_name);
  if company_identity = '' then raise exception 'company name is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company_identity, 31));
  select id into resolved_id from public.companies where identity_key = company_identity;
  if resolved_id is null then
    insert into public.companies(name, website) values (btrim(p_name), p_website) returning id into resolved_id;
  end if;
  return resolved_id;
end $$;

-- Serialize separately by both identities. Rate-limited attempts do not append
-- rows, so a caller cannot grow the ledger without bound after reaching a cap.
create or replace function public.admit_promotional_entry_attempt(
  p_ip_digest bytea, p_contact_email text
) returns boolean language plpgsql security definer set search_path = public as $$
declare ip_count integer; email_count integer;
begin
  if octet_length(p_ip_digest) <> 32 or p_contact_email <> lower(btrim(p_contact_email)) then
    raise exception 'invalid promotional entry identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(encode(p_ip_digest, 'hex'), 41));
  perform pg_advisory_xact_lock(hashtextextended(p_contact_email, 42));
  select count(*) into ip_count from public.promotional_entry_attempts
    where ip_digest = p_ip_digest and attempted_at >= now() - interval '1 hour';
  select count(*) into email_count from public.promotional_entry_attempts
    where contact_email = p_contact_email and attempted_at >= now() - interval '1 hour';
  if ip_count >= 5 or email_count >= 3 then return false; end if;
  insert into public.promotional_entry_attempts(ip_digest, contact_email, outcome)
    values (p_ip_digest, p_contact_email, 'allowed');
  return true;
end $$;

create or replace function public.cleanup_promotional_entry_attempts()
returns bigint language plpgsql security definer set search_path = public as $$
declare removed bigint;
begin
  delete from public.promotional_entry_attempts where attempted_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.normalize_company_identity(text) from public, anon, authenticated;
revoke all on function public.resolve_promotional_company(text, text) from public, anon, authenticated;
revoke all on function public.admit_promotional_entry_attempt(bytea, text) from public, anon, authenticated;
revoke all on function public.cleanup_promotional_entry_attempts() from public, anon, authenticated;
grant execute on function public.resolve_promotional_company(text, text) to service_role;
grant execute on function public.admit_promotional_entry_attempt(bytea, text) to service_role;
grant execute on function public.cleanup_promotional_entry_attempts() to service_role;

import { createClient } from "@supabase/supabase-js";

const ADMIN_SESSION_COOKIE = "admin_session";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function parseAdminAllowlist(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminAllowlist() {
  return parseAdminAllowlist(process.env.ADMIN_ALLOWLIST_EMAILS);
}

export function isEmailInAdminAllowlist(email: string | undefined | null) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getAdminAllowlist().includes(normalized);
}

export async function getAdminUserFromAccessToken(accessToken: string) {
  const config = getSupabaseConfig();
  if (!config) {
    return { ok: false as const, code: "missing_supabase_env" as const };
  }

  const supabase = createClient(config.url, config.anonKey);
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return { ok: false as const, code: "invalid_session" as const };
  }

  const email = data.user.email?.trim().toLowerCase() ?? null;
  if (!email) {
    return { ok: false as const, code: "no_email" as const };
  }

  if (!isEmailInAdminAllowlist(email)) {
    return { ok: false as const, code: "not_admin" as const, email };
  }

  return { ok: true as const, email, userId: data.user.id };
}

export { ADMIN_SESSION_COOKIE };

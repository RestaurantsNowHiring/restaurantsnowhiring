import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "./supabaseAdmin";

const ADMIN_SESSION_COOKIE = "admin_session";
const PRIMARY_BOOTSTRAP_ADMIN_EMAIL = "team@restaurantsnowhiring.com";

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
    .map((email) => normalizeAdminEmail(email))
    .filter(Boolean) as string[];
}

export function normalizeAdminEmail(email: string | undefined | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function getAdminAllowlist() {
  return Array.from(
    new Set([
      PRIMARY_BOOTSTRAP_ADMIN_EMAIL,
      ...parseAdminAllowlist(process.env.ADMIN_ALLOWLIST_EMAILS),
    ]),
  );
}

export function isEmailInAdminAllowlist(email: string | undefined | null) {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return false;
  return getAdminAllowlist().includes(normalized);
}

export async function isEmailInAdminUsers(email: string | undefined | null) {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return false;

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) return false;

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) return false;
  return data?.email === normalized;
}

export async function isAdminEmail(email: string | undefined | null) {
  if (isEmailInAdminAllowlist(email)) return true;
  return isEmailInAdminUsers(email);
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

  const email = normalizeAdminEmail(data.user.email);
  if (!email) {
    return { ok: false as const, code: "no_email" as const };
  }

  if (!(await isAdminEmail(email))) {
    return { ok: false as const, code: "not_admin" as const, email };
  }

  return { ok: true as const, email, userId: data.user.id };
}

export { ADMIN_SESSION_COOKIE };

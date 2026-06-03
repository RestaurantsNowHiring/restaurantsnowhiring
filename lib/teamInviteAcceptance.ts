import { supabase } from "./supabase";

type InviteAcceptanceResult = {
  acceptedCount: number;
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

function isMissingAuthUserIdColumnError(error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) {
  if (!error) return false;
  const errorText = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    errorText.includes("auth_user_id") ||
    (errorText.includes("column") && errorText.includes("does not exist"))
  );
}

async function acceptPendingTeamInvitesWithClientUpdate(user: { id: string; email?: string | null }) {
  const normalizedEmail = normalizeEmail(user.email);
  if (!normalizedEmail) return 0;

  const now = new Date().toISOString();
  const updatePayload = {
    user_id: user.id,
    auth_user_id: user.id,
    status: "active",
    invite_accepted_at: now,
    updated_at: now,
  };

  const runUpdate = (payload: Record<string, string>) => supabase
    .from("employer_team_members")
    .update(payload)
    .ilike("email", normalizedEmail)
    .in("status", ["invited", "pending"])
    .select("id");

  let { data, error } = await runUpdate(updatePayload);

  if (isMissingAuthUserIdColumnError(error)) {
    const fallbackPayload = { ...updatePayload } as Record<string, string>;
    delete fallbackPayload.auth_user_id;
    ({ data, error } = await runUpdate(fallbackPayload));
  }

  if (error) throw error;
  return data?.length ?? 0;
}

export async function acceptPendingTeamInvitesForCurrentUser(): Promise<InviteAcceptanceResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user?.id || !user.email) {
    if (userError) console.error("Could not load auth user before accepting team invites", { error: userError });
    return { acceptedCount: 0 };
  }

  try {
    const { data, error } = await supabase.rpc("accept_pending_team_invites_for_current_user");
    if (!error) {
      return { acceptedCount: typeof data === "number" ? data : 0 };
    }

    console.error("Team invite acceptance RPC failed; trying client update fallback", { error });
  } catch (error) {
    console.error("Team invite acceptance RPC threw; trying client update fallback", { error });
  }

  try {
    const acceptedCount = await acceptPendingTeamInvitesWithClientUpdate(user);
    return { acceptedCount };
  } catch (error) {
    console.error("Team invite acceptance failed", { error, userId: user.id, email: normalizeEmail(user.email) });
    return { acceptedCount: 0 };
  }
}

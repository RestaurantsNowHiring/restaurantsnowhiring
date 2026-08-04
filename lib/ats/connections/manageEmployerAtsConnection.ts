import "server-only";

import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { previewJobImport } from "../import/previewJobImport";
import { normalizeAtsSourceUrl } from "./registerEmployerAtsConnection";

export type AtsConnectionAction = "disable" | "enable" | "disconnect";
export type AtsConnectionActionResult =
  | { status: "updated" }
  | { status: "not-found" }
  | { status: "failed"; message: string };
export type AtsConnectionUpdateSourceResult = AtsConnectionActionResult | { status: "validation-failed"; message: string };

type DbResult<T> = { data: T | null; error: unknown | null };
type ActionDatabase = {
  updateOwnedConnection(connectionId: string, employerAccountId: string, payload: Record<string, unknown>): Promise<DbResult<{ id: string }>>;
};
type UpdateSourceDatabase = ActionDatabase;
export type AtsConnectionManagementDependencies = {
  database?: ActionDatabase | null;
  now?: () => Date;
};
export type AtsConnectionUpdateSourceDependencies = AtsConnectionManagementDependencies & {
  previewJobImport?: typeof previewJobImport;
};

const SAFE_ACTION_FAILURE = "The ATS connection could not be updated.";
const SAFE_VALIDATION_FAILURE = "Enter a valid supported careers page URL.";

function defaultDatabase(): ActionDatabase | null {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  return {
    async updateOwnedConnection(connectionId, employerAccountId, payload) {
      return await client
        .from("employer_ats_connections")
        .update(payload)
        .eq("id", connectionId)
        .eq("employer_account_id", employerAccountId)
        .select("id")
        .maybeSingle() as DbResult<{ id: string }>;
    },
  };
}

function getDatabase(database: ActionDatabase | null | undefined) {
  return database === undefined ? defaultDatabase() : database;
}

export async function updateEmployerAtsConnectionState(
  input: { connectionId: string; employerAccountId: string; action: AtsConnectionAction },
  dependencies: AtsConnectionManagementDependencies = {},
): Promise<AtsConnectionActionResult> {
  const database = getDatabase(dependencies.database);
  if (!database) return { status: "failed", message: SAFE_ACTION_FAILURE };
  const now = dependencies.now ?? (() => new Date());
  const payload = input.action === "disable"
    ? { enabled: false }
    : input.action === "enable"
      ? { enabled: true }
      : { enabled: false, connection_status: "disconnected", disconnected_at: now().toISOString() };

  try {
    const result = await database.updateOwnedConnection(input.connectionId, input.employerAccountId, payload);
    if (result.error) return { status: "failed", message: SAFE_ACTION_FAILURE };
    if (!result.data?.id) return { status: "not-found" };
    return { status: "updated" };
  } catch {
    return { status: "failed", message: SAFE_ACTION_FAILURE };
  }
}

export async function updateEmployerAtsConnectionSource(
  input: { connectionId: string; employerAccountId: string; careersPageUrl: string },
  dependencies: AtsConnectionUpdateSourceDependencies = {},
): Promise<AtsConnectionUpdateSourceResult> {
  const inputUrl = input.careersPageUrl.trim();
  const preview = dependencies.previewJobImport ?? previewJobImport;
  let discovered: Awaited<ReturnType<typeof previewJobImport>>;
  try {
    discovered = await preview(inputUrl);
  } catch {
    return { status: "validation-failed", message: SAFE_VALIDATION_FAILURE };
  }
  if (discovered.status !== "ready") return { status: "validation-failed", message: SAFE_VALIDATION_FAILURE };
  const sourceUrlKey = normalizeAtsSourceUrl(discovered.sourceUrl);
  if (!sourceUrlKey) return { status: "validation-failed", message: SAFE_VALIDATION_FAILURE };

  const database = getDatabase(dependencies.database as UpdateSourceDatabase | null | undefined);
  if (!database) return { status: "failed", message: SAFE_ACTION_FAILURE };
  try {
    const result = await database.updateOwnedConnection(input.connectionId, input.employerAccountId, {
      input_url: inputUrl,
      source_url: discovered.sourceUrl.trim(),
      source_url_key: sourceUrlKey,
      enabled: true,
      connection_status: "active",
      disconnected_at: null,
    });
    if (result.error) return { status: "failed", message: SAFE_ACTION_FAILURE };
    if (!result.data?.id) return { status: "not-found" };
    return { status: "updated" };
  } catch {
    return { status: "failed", message: SAFE_ACTION_FAILURE };
  }
}

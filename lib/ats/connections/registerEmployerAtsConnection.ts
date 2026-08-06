import "server-only";

import { getSupabaseAdminClient } from "../../supabaseAdmin";
import { getAtsProvider } from "../providers/registry";
import type { AtsProviderKey } from "../types";

const MAX_PROVIDER_KEY_LENGTH = 128;
const SAFE_FAILURE_MESSAGE = "The ATS connection could not be enabled.";

export type RegisterEmployerAtsConnectionInput = {
  employerAccountId: string;
  connectedByUserId: string;
  inputUrl: string;
  providerKey: string;
  sourceUrl: string;
};

export type RegisterEmployerAtsConnectionResult =
  | { status: "connected"; connectionId: string }
  | { status: "failed"; message: string };

type ConnectionDependencies = {
  getSupabaseAdminClient: typeof getSupabaseAdminClient;
  getAtsProvider: typeof getAtsProvider;
};

const defaultDependencies: ConnectionDependencies = {
  getSupabaseAdminClient,
  getAtsProvider,
};

function parseCredentialFreeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** Produces the exact, deterministic source identity stored in source_url_key. */
export function normalizeAtsSourceUrl(value: string): string | null {
  const url = parseCredentialFreeHttpUrl(value);
  if (!url) return null;

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.hash = "";
  return url.toString();
}

/**
 * Race-safe registration uses the table's exact unique identity as an upsert
 * conflict target. It returns `connected`, rather than guessing whether the
 * atomic operation inserted or updated a row.
 */
export async function registerEmployerAtsConnection(
  input: RegisterEmployerAtsConnectionInput,
  dependencies: ConnectionDependencies = defaultDependencies,
): Promise<RegisterEmployerAtsConnectionResult> {
  const inputUrl = input.inputUrl.trim();
  const sourceUrl = input.sourceUrl.trim();
  const providerKey = input.providerKey.trim().toLowerCase();
  const sourceUrlKey = normalizeAtsSourceUrl(sourceUrl);

  if (!input.employerAccountId || !input.connectedByUserId ||
      !parseCredentialFreeHttpUrl(inputUrl) || !sourceUrlKey ||
      !providerKey || providerKey.length > MAX_PROVIDER_KEY_LENGTH ||
      !dependencies.getAtsProvider(providerKey as AtsProviderKey)) {
    return { status: "failed", message: SAFE_FAILURE_MESSAGE };
  }

  try {
    const database = dependencies.getSupabaseAdminClient();
    if (!database) return { status: "failed", message: SAFE_FAILURE_MESSAGE };

    const accountResult = await database
      .from("employer_accounts")
      .select("id")
      .eq("id", input.employerAccountId)
      .maybeSingle();
    if (accountResult.error || !accountResult.data) {
      return { status: "failed", message: SAFE_FAILURE_MESSAGE };
    }

    const connectionResult = await database
      .from("employer_ats_connections")
      .upsert({
        employer_account_id: input.employerAccountId,
        provider_key: providerKey,
        input_url: inputUrl,
        source_url: sourceUrl,
        source_url_key: sourceUrlKey,
        enabled: true,
        connection_status: "active",
        connected_by_user_id: input.connectedByUserId,
        disconnected_at: null,
        consecutive_failure_count: 0,
        last_failure_code: null,
      }, {
        onConflict: "employer_account_id,provider_key,source_url_key",
      })
      .select("id")
      .single();

    if (connectionResult.error || !connectionResult.data?.id) {
      return { status: "failed", message: SAFE_FAILURE_MESSAGE };
    }
    return { status: "connected", connectionId: connectionResult.data.id };
  } catch {
    return { status: "failed", message: SAFE_FAILURE_MESSAGE };
  }
}

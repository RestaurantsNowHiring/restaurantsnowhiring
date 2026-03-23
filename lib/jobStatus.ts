export type PersistedJobStatus = "active" | "paused" | "pending" | "draft" | "archived";

export function normalizePersistedStatus(status: string | null | undefined): PersistedJobStatus | null {
  if (!status) return null;

  const normalized = status.trim().toLowerCase();
  if (
    normalized === "active" ||
    normalized === "paused" ||
    normalized === "pending" ||
    normalized === "draft" ||
    normalized === "archived"
  ) {
    return normalized;
  }

  return null;
}

export function isPubliclyVisibleJob(status: string | null | undefined, active: boolean): boolean {
  const normalized = normalizePersistedStatus(status);

  // Public jobs page shows only jobs that are explicitly active and currently enabled.
  if (normalized) return normalized === "active";

  return active;
}

export function dashboardStatusForJob(status: string | null | undefined, active: boolean): "Active" | "Pending" | "Draft" | "Paused" {
  const normalized = normalizePersistedStatus(status);

  if (normalized === "active") return "Active";
  if (normalized === "paused") return "Paused";
  if (normalized === "draft") return "Draft";
  if (normalized === "pending") return "Pending";
  if (normalized === "archived") return "Draft";

  return active ? "Active" : "Pending";
}

export function isMissingStatusColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;

  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST204" || message.includes("status") && message.includes("column");
}

export function isMissingViewsColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;

  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST204" || message.includes("views") && message.includes("column");
}

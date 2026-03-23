export type PersistedJobStatus = "active" | "paused" | "pending" | "draft" | "archived" | "rejected";

type DashboardStatus = "Active" | "Pending" | "Draft" | "Paused";

export function normalizePersistedStatus(status: string | null | undefined): PersistedJobStatus | null {
  if (!status) return null;

  const normalized = status.trim().toLowerCase();
  if (
    normalized === "active" ||
    normalized === "paused" ||
    normalized === "pending" ||
    normalized === "draft" ||
    normalized === "archived" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return null;
}

export function isPubliclyVisibleJob(status: string | null | undefined, active: boolean): boolean {
  const normalized = normalizePersistedStatus(status);

  // Canonical model:
  // - public only when approved + active (status=active and active=true)
  // - all other explicit statuses are private
  if (normalized) return normalized === "active" && active;

  // Backward compatibility when older environments do not have status yet.
  return active;
}

export function dashboardStatusForJob(status: string | null | undefined, active: boolean): DashboardStatus {
  const normalized = normalizePersistedStatus(status);

  if (normalized === "active") return active ? "Active" : "Paused";
  if (normalized === "paused") return "Paused";
  if (normalized === "pending") return "Pending";
  if (normalized === "draft") return "Draft";
  if (normalized === "archived" || normalized === "rejected") return "Draft";

  return active ? "Active" : "Pending";
}

export function canEmployerPauseResume(status: string | null | undefined): boolean {
  const normalized = normalizePersistedStatus(status);
  if (!normalized) return true;

  return normalized === "active" || normalized === "paused";
}

export function getEmployerPauseResumeUpdate(status: string | null | undefined, active: boolean): {
  nextActive: boolean;
  nextStatus: PersistedJobStatus;
} {
  const normalized = normalizePersistedStatus(status);

  if (normalized === "paused") {
    return { nextActive: true, nextStatus: "active" };
  }

  if (normalized === "active") {
    return { nextActive: false, nextStatus: "paused" };
  }

  // Legacy fallback where status may be missing.
  return active
    ? { nextActive: false, nextStatus: "paused" }
    : { nextActive: true, nextStatus: "active" };
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

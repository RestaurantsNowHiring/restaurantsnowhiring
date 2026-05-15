export type PersistedJobStatus = "active" | "paused" | "pending" | "draft" | "archived" | "rejected";

type DashboardStatus = "Active" | "Pending" | "Draft" | "Paused" | "Rejected";

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
  if (normalized === "rejected") return "Rejected";
  if (normalized === "archived") return "Draft";

  return active ? "Active" : "Pending";
}

export type AdminReadableStatus = "Active" | "Pending" | "Paused" | "Rejected";
export type AdminJobFilter = "pending" | "approved" | "paused" | "rejected";

export function adminReadableStatusForJob(status: string | null | undefined, active: boolean): AdminReadableStatus {
  const normalized = normalizePersistedStatus(status);

  if (normalized === "active") return active ? "Active" : "Paused";
  if (normalized === "paused") return "Paused";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "pending" || normalized === "draft" || normalized === "archived") return "Pending";

  // Legacy fallback where status may be missing.
  return active ? "Active" : "Pending";
}

export function adminFilterForJob(status: string | null | undefined, active: boolean): AdminJobFilter {
  const readable = adminReadableStatusForJob(status, active);
  if (readable === "Active") return "approved";
  if (readable === "Paused") return "paused";
  if (readable === "Rejected") return "rejected";
  return "pending";
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

function isMissingColumnError(error: { code?: string; message?: string } | null, column: string): boolean {
  if (!error) return false;

  const message = (error.message ?? "").toLowerCase();
  if (!message.includes(column.toLowerCase())) return false;

  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    message.includes(`could not find the '${column}' column`) ||
    message.includes(`column "${column}" does not exist`) ||
    message.includes(`jobs.${column} does not exist`)
  );
}

export function isMissingStatusColumnError(error: { code?: string; message?: string } | null): boolean {
  return isMissingColumnError(error, "status");
}

export function isMissingViewsColumnError(error: { code?: string; message?: string } | null): boolean {
  return isMissingColumnError(error, "views");
}

export function isMissingApprovedAtColumnError(error: { code?: string; message?: string } | null): boolean {
  return isMissingColumnError(error, "approved_at");
}

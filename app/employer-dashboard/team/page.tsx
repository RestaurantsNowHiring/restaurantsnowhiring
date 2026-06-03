"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";
type AccountStatusFilter = "all" | "active" | "invited";
type RoutingFilter = "all" | "enabled" | "disabled";

type EmployerAccess = {
  role: EmployerRole;
  canManageTeam: boolean;
};

type TeamMember = {
  id: string;
  email: string;
  location_name: string | null;
  user_id: string | null;
  role: EmployerRole;
  status: string;
  can_manage_notification_routing: boolean;
  created_at: string;
  updated_at: string;
};

const ROLE_LABELS: Record<EmployerRole, string> = {
  account_owner: "Account Owner",
  hiring_manager: "Hiring Manager",
  viewer: "Viewer",
};

const ROLE_HELP: Record<EmployerRole, string> = {
  account_owner: "Full access to company profile, billing, jobs, candidates, team, and notification routing.",
  hiring_manager: "Can post and manage jobs and candidates, but cannot access billing, company profile, or team settings.",
  viewer: "Can view the dashboard, jobs, and candidates, and update candidate statuses only.",
};

const LOCATION_NAME_EXAMPLES = [
  "MISSION BBQ Columbia, MD",
  "MISSION BBQ Ellicott City, MD",
  "MISSION BBQ Annapolis, MD",
];

const JOINED_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const STATE_PATTERN = /(?:,|\s)([A-Z]{2})(?:\s|$)/;

function getAccountStatus(member: TeamMember) {
  return member.user_id ? "Active" : "Invitation Pending";
}

function getTeamMemberDisplayName(member: TeamMember) {
  return member.location_name?.trim() || member.email;
}

function getJoinedDisplay(member: TeamMember) {
  if (!member.user_id) return "-";

  const joinedDate = new Date(member.updated_at);
  if (Number.isNaN(joinedDate.getTime())) return "-";

  return JOINED_DATE_FORMATTER.format(joinedDate);
}

function getMemberState(member: TeamMember) {
  const match = member.location_name?.toUpperCase().match(STATE_PATTERN);
  return match?.[1] ?? "";
}

export default function TeamAccessPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [access, setAccess] = useState<EmployerAccess | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EmployerRole>("viewer");
  const [canRouteNotifications, setCanRouteNotifications] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState<"all" | EmployerRole>("all");
  const [routingFilter, setRoutingFilter] = useState<RoutingFilter>("all");
  const [busy, setBusy] = useState(false);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadTeam = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/team")}`);
      return;
    }

    const [meResponse, teamResponse] = await Promise.all([
      fetch("/api/employer/me", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/employer/team", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const mePayload = (await meResponse.json().catch(() => null)) as { employer?: EmployerAccess; error?: string } | null;
    setAccess(mePayload?.employer ?? null);

    if (!teamResponse.ok) {
      const payload = (await teamResponse.json().catch(() => null)) as { error?: string } | null;
      setMessage(payload?.error || "Only Account Owners can manage team access.");
      setMembers([]);
      setAuthStatus("allowed");
      return;
    }

    const teamPayload = (await teamResponse.json()) as { members?: TeamMember[] };
    setMembers(teamPayload.members ?? []);
    setAuthStatus("allowed");
  }, [getAccessToken, router]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const token = await getAccessToken();
    if (!token) {
      setBusy(false);
      setMessage("Please sign in again before managing team access.");
      return;
    }

    const response = await fetch("/api/employer/team", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, can_manage_notification_routing: canRouteNotifications }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; inviteEmailWarning?: string | null } | null;

    if (!response.ok) {
      setMessage(payload?.error || "Could not save team user.");
      setBusy(false);
      return;
    }

    setEmail("");
    setRole("viewer");
    setCanRouteNotifications(false);
    setMessage(payload?.inviteEmailWarning || "Team access saved and invitation email sent.");
    setBusy(false);
    await loadTeam();
  }

  async function updateMember(
    member: TeamMember,
    nextRole: EmployerRole,
    nextCanRoute = member.can_manage_notification_routing,
    nextLocationName = member.location_name,
  ) {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/employer/team", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, role: nextRole, can_manage_notification_routing: nextCanRoute, location_name: nextLocationName }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not update team user.");
      return;
    }
    setEditingMemberId(null);
    setEditingLocationName("");
    await loadTeam();
  }

  function startEditingLocation(member: TeamMember) {
    setEditingMemberId(member.id);
    setEditingLocationName(member.location_name ?? "");
    setMessage(null);
  }

  async function saveLocationName(member: TeamMember) {
    await updateMember(member, member.role, member.can_manage_notification_routing, editingLocationName);
  }

  function cancelEditingLocation() {
    setEditingMemberId(null);
    setEditingLocationName("");
  }

  async function resendInvite(member: TeamMember) {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/employer/team/${encodeURIComponent(member.id)}/invite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not resend the invitation email.");
      return;
    }
    setMessage(`Invitation email resent to ${member.email}.`);
  }

  async function removeMember(member: TeamMember) {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/employer/team?id=${encodeURIComponent(member.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not remove team user.");
      return;
    }
    await loadTeam();
  }

  const canManage = Boolean(access?.canManageTeam);
  const isSuccessMessage = Boolean(message && !message.startsWith("Warning:") && (message.includes("saved") || message.includes("sent") || message.includes("resent")));

  const uniqueStates = useMemo(() => Array.from(new Set(members.map(getMemberState).filter(Boolean))).sort(), [members]);
  const uniqueLocations = useMemo(() => Array.from(new Set(members.map((member) => member.location_name?.trim()).filter((location): location is string => Boolean(location)))).sort(), [members]);
  const teamSummary = useMemo(() => {
    const active = members.filter((member) => member.user_id).length;
    const pending = members.filter((member) => !member.user_id).length;
    const routingEnabled = members.filter((member) => member.can_manage_notification_routing).length;
    return {
      total: members.length,
      active,
      pending,
      routingEnabled,
      routingDisabled: members.length - routingEnabled,
    };
  }, [members]);
  const filteredMembers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      const state = getMemberState(member);
      const accountStatus = member.user_id ? "active" : "invited";
      const routingStatus = member.can_manage_notification_routing ? "enabled" : "disabled";
      const matchesSearch = !normalizedSearch || [member.location_name, state, member.email, ROLE_LABELS[member.role], getAccountStatus(member)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesSearch
        && (accountStatusFilter === "all" || accountStatusFilter === accountStatus)
        && (stateFilter === "all" || stateFilter === state)
        && (locationFilter === "all" || member.location_name === locationFilter)
        && (roleFilter === "all" || member.role === roleFilter)
        && (routingFilter === "all" || routingFilter === routingStatus);
    });
  }, [accountStatusFilter, locationFilter, members, roleFilter, routingFilter, searchQuery, stateFilter]);

  if (authStatus === "loading") {
    return <main className="rn-team-page" style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading team access…</main>;
  }

  return (
    <main className="rn-team-page" style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 72, backgroundColor: homeTheme.bg }}>
      <div className="rn-team-container" style={{ maxWidth: 1080, margin: "0 auto", padding: "0 18px" }}>
        <section className="rn-team-hero" style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Users & Permissions
          </p>
          <h1 style={{ margin: "8px 0", fontSize: 38, lineHeight: 1.1, fontFamily: "var(--font-heading)", color: homeTheme.green }}>
            Team Access
          </h1>
          <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
            Invite coworkers by email and choose whether they can own the account, manage jobs, or view candidates only.
          </p>
        </section>

        {message ? (
          <div role="alert" style={{ ...homeCardStyle, marginBottom: 16, color: isSuccessMessage ? homeTheme.green : "#8a2f2f", fontWeight: 900 }}>
            {message}
          </div>
        ) : null}

        {!canManage ? (
          <section style={{ ...homeCardStyle, marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Contact your account admin</h2>
            <p style={{ color: homeTheme.muted, fontWeight: 700 }}>
              Your current role can view employer information, but only Account Owners can add users, change roles, or remove access.
            </p>
          </section>
        ) : (
          <>
            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Invite or add a user</h2>
              <form onSubmit={saveMember} style={{ display: "grid", gap: 12 }}>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Email address
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="manager@mission-bbq.com"
                    className="rn-team-input"
                    style={{ ...homeInputStyle, marginTop: 6, minHeight: 50 }}
                  />
                </label>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Access level
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as EmployerRole)}
                    className="rn-team-select"
                    style={{ ...homeInputStyle, marginTop: 6, minHeight: 50, appearance: "none" }}
                  >
                    {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => (
                      <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                    ))}
                  </select>
                  <span style={{ display: "block", marginTop: 6, color: homeTheme.muted, fontSize: 13 }}>{ROLE_HELP[role]}</span>
                </label>
                <label className="rn-team-checkbox-row" style={{ fontWeight: 800, color: homeTheme.text }}>
                  <input
                    className="rn-team-checkbox"
                    type="checkbox"
                    checked={canRouteNotifications}
                    onChange={(event) => setCanRouteNotifications(event.target.checked)}
                  />
                  <span>Allow this user to change candidate notification routing</span>
                </label>
                <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>
                  {busy ? "Saving..." : "Save Team Access"}
                </button>
              </form>
            </section>

            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <div className="rn-team-summary-grid">
                {[
                  { label: "Total team users/locations", value: teamSummary.total },
                  { label: "Active", value: teamSummary.active },
                  { label: "Invitation pending", value: teamSummary.pending },
                  { label: "Routing enabled", value: teamSummary.routingEnabled },
                  { label: "Routing disabled", value: teamSummary.routingDisabled },
                ].map((metric) => (
                  <article key={metric.label} className="rn-team-summary-card">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rn-team-panel" style={{ ...homeCardStyle, marginBottom: 16 }}>
              <div className="rn-team-table-header">
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: 6, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Current team users</h2>
                  <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Search and filter team access without changing existing actions.</p>
                </div>
              </div>

              <div className="rn-team-filter-grid">
                <label>
                  Search
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Location, email, role, status" className="rn-team-input" style={{ ...homeInputStyle, marginTop: 6 }} />
                </label>
                <label>
                  Account status
                  <select value={accountStatusFilter} onChange={(event) => setAccountStatusFilter(event.target.value as AccountStatusFilter)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="invited">Invitation pending</option>
                  </select>
                </label>
                <label>
                  State
                  <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All states</option>
                    {uniqueStates.map((state) => <option key={state} value={state}>{state}</option>)}
                  </select>
                </label>
                <label>
                  Location
                  <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All locations</option>
                    {uniqueLocations.map((location) => <option key={location} value={location}>{location}</option>)}
                  </select>
                </label>
                <label>
                  Role
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | EmployerRole)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All roles</option>
                    {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                  </select>
                </label>
                <label>
                  Candidate routing
                  <select value={routingFilter} onChange={(event) => setRoutingFilter(event.target.value as RoutingFilter)} className="rn-team-select" style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                    <option value="all">All routing</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>

              <div className="rn-team-table-wrap">
                <table className="rn-team-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>State</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Account status</th>
                      <th>Candidate routing</th>
                      <th>Joined date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.length === 0 ? (
                      <tr><td colSpan={8}>No team users match these filters.</td></tr>
                    ) : null}
                    {filteredMembers.map((member) => (
                      <tr key={member.id}>
                        <td>
                          {editingMemberId === member.id ? (
                            <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
                              <input
                                type="text"
                                value={editingLocationName}
                                onChange={(event) => setEditingLocationName(event.target.value)}
                                placeholder="MISSION BBQ Columbia, MD"
                                className="rn-team-input"
                                style={{ ...homeInputStyle, minHeight: 42 }}
                                maxLength={180}
                                disabled={busy}
                                aria-label={`Location name for ${member.email}`}
                              />
                              <span style={{ color: homeTheme.muted, fontSize: 12, fontWeight: 800 }}>Examples: {LOCATION_NAME_EXAMPLES.join("; ")}</span>
                            </div>
                          ) : (
                            <strong>{getTeamMemberDisplayName(member)}</strong>
                          )}
                        </td>
                        <td>{getMemberState(member) || "—"}</td>
                        <td>{member.email}</td>
                        <td><span className="rn-team-role-pill">{ROLE_LABELS[member.role]}</span></td>
                        <td><span className={member.user_id ? "rn-team-status-pill rn-team-status-pill--active" : "rn-team-status-pill rn-team-status-pill--pending"}>{getAccountStatus(member)}</span></td>
                        <td>{member.can_manage_notification_routing ? "Enabled" : "Disabled"}</td>
                        <td>{getJoinedDisplay(member)}</td>
                        <td>
                          <div className="rn-team-table-actions">
                            {editingMemberId === member.id ? (
                              <>
                                <button type="button" className="rn-btn-primary" style={homePrimaryButton} onClick={() => saveLocationName(member)} disabled={busy}>Save location</button>
                                <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={cancelEditingLocation} disabled={busy}>Cancel</button>
                              </>
                            ) : (
                              <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => startEditingLocation(member)} disabled={busy}>Edit</button>
                            )}
                            <select aria-label={`Change role for ${member.email}`} className="rn-team-member-select" value={member.role} onChange={(event) => updateMember(member, event.target.value as EmployerRole)} disabled={busy}>
                              {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                            </select>
                            <button type="button" className="rn-btn-secondary rn-team-resend-button" style={homeSecondaryButton} onClick={() => resendInvite(member)} disabled={busy}>Resend invite</button>
                            <button type="button" className="rn-btn-secondary rn-team-remove-button" style={homeSecondaryButton} onClick={() => removeMember(member)} disabled={busy || member.role === "account_owner"}>Remove</button>
                            <label className="rn-team-checkbox-row rn-team-table-checkbox">
                              <input className="rn-team-checkbox" type="checkbox" checked={member.can_manage_notification_routing} onChange={(event) => updateMember(member, member.role, event.target.checked)} disabled={busy || member.role === "account_owner"} />
                              <span>Routing</span>
                            </label>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">Back to Dashboard</Link>
      </div>
    </main>
  );
}

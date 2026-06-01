"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";

type EmployerAccess = {
  role: EmployerRole;
  canManageTeam: boolean;
};

type TeamMember = {
  id: string;
  email: string;
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

const JOINED_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function getAccountStatus(member: TeamMember) {
  return member.user_id ? "Active" : "Invitation Pending";
}

function getJoinedDisplay(member: TeamMember) {
  if (!member.user_id) return "-";

  const joinedDate = new Date(member.updated_at);
  if (Number.isNaN(joinedDate.getTime())) return "-";

  return JOINED_DATE_FORMATTER.format(joinedDate);
}

export default function TeamAccessPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [access, setAccess] = useState<EmployerAccess | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<EmployerRole>("viewer");
  const [canRouteNotifications, setCanRouteNotifications] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  async function updateMember(member: TeamMember, nextRole: EmployerRole, nextCanRoute = member.can_manage_notification_routing) {
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/employer/team", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, role: nextRole, can_manage_notification_routing: nextCanRoute }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not update team user.");
      return;
    }
    await loadTeam();
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

  if (authStatus === "loading") {
    return <main className="rn-team-page" style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading team access…</main>;
  }

  const canManage = Boolean(access?.canManageTeam);
  const isSuccessMessage = Boolean(message && !message.startsWith("Warning:") && (message.includes("saved") || message.includes("sent") || message.includes("resent")));

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
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Current team users</h2>
              <div className="rn-team-users-list" style={{ display: "grid", gap: 12 }}>
                {members.length === 0 ? (
                  <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>No team users have been added yet.</p>
                ) : null}
                {members.map((member) => (
                  <article key={member.id} className="rn-team-user-card" style={{ border: `1px solid ${homeTheme.border}`, borderRadius: 16, padding: 18, backgroundColor: "#fff" }}>
                    <div className="rn-team-user-card__top" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div className="rn-team-user-card__summary" aria-label={`Team member details for ${member.email}`}>
                        <div className="rn-team-user-card__field rn-team-user-card__field--email">
                          <span className="rn-team-user-card__label">Email</span>
                          <strong style={{ color: homeTheme.text }}>{member.email}</strong>
                        </div>
                        <div className="rn-team-user-card__field">
                          <span className="rn-team-user-card__label">Role</span>
                          <span className="rn-team-role-pill">{ROLE_LABELS[member.role]}</span>
                        </div>
                        <div className="rn-team-user-card__field">
                          <span className="rn-team-user-card__label">Account Status</span>
                          <span className={member.user_id ? "rn-team-status-pill rn-team-status-pill--active" : "rn-team-status-pill rn-team-status-pill--pending"}>
                            {getAccountStatus(member)}
                          </span>
                        </div>
                        <div className="rn-team-user-card__field">
                          <span className="rn-team-user-card__label">Joined</span>
                          <span className="rn-team-joined-value">{getJoinedDisplay(member)}</span>
                        </div>
                      </div>
                      <div className="rn-team-user-card__actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <select
                          aria-label={`Change role for ${member.email}`}
                          className="rn-team-member-select"
                          value={member.role}
                          onChange={(event) => updateMember(member, event.target.value as EmployerRole)}
                          disabled={busy}
                        >
                          {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                        </select>
                        <button type="button" className="rn-btn-secondary rn-team-resend-button" style={homeSecondaryButton} onClick={() => resendInvite(member)} disabled={busy}>
                          Resend invite
                        </button>
                        <button type="button" className="rn-btn-secondary rn-team-remove-button" style={homeSecondaryButton} onClick={() => removeMember(member)} disabled={busy || member.role === "account_owner"}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <label className="rn-team-checkbox-row rn-team-card-checkbox" style={{ fontWeight: 800, color: homeTheme.text }}>
                      <input
                        className="rn-team-checkbox"
                        type="checkbox"
                        checked={member.can_manage_notification_routing}
                        onChange={(event) => updateMember(member, member.role, event.target.checked)}
                        disabled={busy || member.role === "account_owner"}
                      />
                      <span>Can change candidate notification routing</span>
                    </label>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">Back to Dashboard</Link>
      </div>
    </main>
  );
}

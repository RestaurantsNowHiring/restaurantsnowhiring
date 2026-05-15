"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setMessage(payload?.error || "Could not save team user.");
      setBusy(false);
      return;
    }

    setEmail("");
    setRole("viewer");
    setCanRouteNotifications(false);
    setMessage("Team access saved.");
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
    return <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading team access…</main>;
  }

  const canManage = Boolean(access?.canManageTeam);

  return (
    <main style={{ minHeight: "100vh", paddingTop: 82, paddingBottom: 64, backgroundColor: homeTheme.bg }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
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
          <div role="alert" style={{ ...homeCardStyle, marginBottom: 16, color: message.includes("saved") ? homeTheme.green : "#8a2f2f", fontWeight: 900 }}>
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
            <section style={{ ...homeCardStyle, marginBottom: 16 }}>
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
                    style={{ width: "100%", marginTop: 6, minHeight: 50, borderRadius: 12, border: `1px solid ${homeTheme.border}`, padding: "0 14px", fontWeight: 800 }}
                  />
                </label>
                <label style={{ fontWeight: 900, color: homeTheme.text }}>
                  Access level
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as EmployerRole)}
                    style={{ width: "100%", marginTop: 6, minHeight: 50, borderRadius: 12, border: `1px solid ${homeTheme.border}`, padding: "0 14px", fontWeight: 800 }}
                  >
                    {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => (
                      <option key={option} value={option}>{ROLE_LABELS[option]}</option>
                    ))}
                  </select>
                  <span style={{ display: "block", marginTop: 6, color: homeTheme.muted, fontSize: 13 }}>{ROLE_HELP[role]}</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, color: homeTheme.text }}>
                  <input type="checkbox" checked={canRouteNotifications} onChange={(event) => setCanRouteNotifications(event.target.checked)} />
                  Allow this user to change candidate notification routing
                </label>
                <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>
                  {busy ? "Saving..." : "Save Team Access"}
                </button>
              </form>
            </section>

            <section style={{ ...homeCardStyle, marginBottom: 16 }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Current team users</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {members.map((member) => (
                  <article key={member.id} style={{ border: `1px solid ${homeTheme.border}`, borderRadius: 14, padding: 14, backgroundColor: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <strong style={{ color: homeTheme.text }}>{member.email}</strong>
                        <p style={{ margin: "4px 0 0", color: homeTheme.muted, fontWeight: 700 }}>{member.user_id ? "Matched login user" : "Invited by email; access applies after signup with this email"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <select value={member.role} onChange={(event) => updateMember(member, event.target.value as EmployerRole)} disabled={busy}>
                          {(Object.keys(ROLE_LABELS) as EmployerRole[]).map((option) => <option key={option} value={option}>{ROLE_LABELS[option]}</option>)}
                        </select>
                        <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => removeMember(member)} disabled={busy || member.role === "account_owner"}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontWeight: 800, color: homeTheme.text }}>
                      <input
                        type="checkbox"
                        checked={member.can_manage_notification_routing}
                        onChange={(event) => updateMember(member, member.role, event.target.checked)}
                        disabled={busy || member.role === "account_owner"}
                      />
                      Can change candidate notification routing
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

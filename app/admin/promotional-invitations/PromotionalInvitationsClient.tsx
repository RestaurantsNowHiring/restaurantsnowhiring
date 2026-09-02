"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./promotionalInvitations.module.css";

type Company = { id: string; name: string };
type Invitation = {
  id: string; contact_email: string; issued_at: string; offer_expires_at: string;
  email_verified_at: string | null; redeemed_at: string | null; redeemed_job_id: string | null;
  revoked_at: string | null; revoked_reason: string | null; companies: { name: string } | Array<{ name: string }> | null;
};

function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)) : "—"; }
function companyName(invitation: Invitation) { return Array.isArray(invitation.companies) ? invitation.companies[0]?.name : invitation.companies?.name; }
function defaultExpiration() { const value = new Date(); value.setUTCDate(value.getUTCDate() + 30); return value.toISOString().slice(0, 10); }

export default function PromotionalInvitationsClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [message, setMessage] = useState("");
  const [issuedUrl, setIssuedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/promotional-invitations");
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setCompanies(body.companies ?? []); setInvitations(body.invitations ?? []); }
    else setMessage(body.error ?? "Could not load promotional invitations.");
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function issue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setIssuedUrl("");
    const form = event.currentTarget;
    const response = await fetch("/api/admin/promotional-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setIssuedUrl(body.promotional_url); setMessage("Invitation issued. Copy this URL now; it cannot be recovered later."); form.reset(); await load(); }
    else setMessage(body.error ?? "Could not issue invitation.");
    setSaving(false);
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this invitation? It cannot be restored.")) return;
    const response = await fetch(`/api/admin/promotional-invitations/${id}/revoke`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Revoked by RNH Admin" }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Invitation revoked." : body.error ?? "Could not revoke invitation.");
    if (response.ok) await load();
  }

  return <main className={styles.page}>
    <header><Link href="/admin" className={styles.back}>← Admin</Link><h1>Promotional Invitations</h1><p>Issue secure Free First Job invitations. Issuing an invitation does not create or publish a job.</p></header>
    {message && <div className={styles.notice} role="status">{message}</div>}
    {issuedUrl && <section className={styles.secret}><strong>One-time promotional URL</strong><div><input readOnly value={issuedUrl} aria-label="One-time promotional URL" /><button type="button" onClick={() => void navigator.clipboard.writeText(issuedUrl)}>Copy URL</button></div><small>Store it safely now. For security, the URL will disappear when you leave or issue another invitation.</small></section>}
    <form className={styles.card} onSubmit={issue}>
      <h2>Issue an invitation</h2><div className={styles.fields}>
        <label><span>Company</span><select name="company_id" required defaultValue=""><option value="" disabled>Select an existing company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>Contact email</span><input name="contact_email" type="email" required autoComplete="email" /></label>
        <label><span>Offer expiration date</span><input name="offer_expires_at" type="date" required defaultValue={defaultExpiration()} min={new Date().toISOString().slice(0, 10)} /></label>
      </div><button className={styles.primary} type="submit" disabled={saving}>{saving ? "Issuing…" : "Issue invitation"}</button>
    </form>
    <section className={styles.card}><h2>Existing invitations</h2><div className={styles.tableWrap}><table><thead><tr>{["Company", "Contact", "Issued", "Expires", "Verified", "Redemption", "Revoked", "Associated job", "Action"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{invitations.map((item) => <tr key={item.id}><td><strong>{companyName(item) ?? "Unknown"}</strong></td><td>{item.contact_email}</td><td>{date(item.issued_at)}</td><td>{date(item.offer_expires_at)}</td><td>{item.email_verified_at ? date(item.email_verified_at) : "Not verified"}</td><td>{item.redeemed_at ? date(item.redeemed_at) : "Unused"}</td><td>{item.revoked_at ? <><span>Revoked {date(item.revoked_at)}</span><small>{item.revoked_reason}</small></> : "No"}</td><td>{item.redeemed_job_id ?? "—"}</td><td>{!item.revoked_at && !item.redeemed_at ? <button type="button" onClick={() => void revoke(item.id)}>Revoke</button> : "—"}</td></tr>)}</tbody></table>{invitations.length === 0 && <p className={styles.empty}>No promotional invitations have been issued.</p>}</div></section>
  </main>;
}

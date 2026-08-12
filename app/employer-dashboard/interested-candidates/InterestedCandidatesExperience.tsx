"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { homeTheme } from "../../styles/homepageDesignSystem";

export type CandidateSubmission = {
  id: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  message: string | null;
  resume_filename: string | null;
  status: "new" | "reviewed" | "contacted" | "archived" | string;
  created_at: string;
  job_title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  role_category: string | null;
};

const STATUS_OPTIONS = ["new", "reviewed", "contacted", "archived"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];
type StatusFilter = "all" | StatusOption;
type JobLevelFilter = "all" | "hourly_store" | "salaried_manager" | "general_manager" | "area_director" | "regional_director" | "other";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" }, { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" }, { value: "contacted", label: "Contacted" },
  { value: "archived", label: "Archived" },
];
const JOB_LEVELS: Array<{ value: JobLevelFilter; label: string }> = [
  { value: "all", label: "All levels" }, { value: "hourly_store", label: "Hourly / Store role" },
  { value: "salaried_manager", label: "Salaried Manager" }, { value: "general_manager", label: "General Manager" },
  { value: "area_director", label: "Area Director" }, { value: "regional_director", label: "Regional Director" },
  { value: "other", label: "Other" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function formatStatus(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function locationLabel(candidate: CandidateSubmission) {
  const cityState = [candidate.city, candidate.state].map((part) => part?.trim()).filter(Boolean).join(", ");
  return [candidate.restaurant_name?.trim(), cityState].filter(Boolean).join(" — ") || "Unlisted location";
}
function jobLevel(candidate: CandidateSubmission): JobLevelFilter {
  const role = `${candidate.job_title ?? ""} ${candidate.role_category ?? ""}`.toLowerCase();
  if (/\bregional\s+director\b/.test(role)) return "regional_director";
  if (/\barea\s+director\b/.test(role)) return "area_director";
  if (/\bgeneral\s+manager\b/.test(role)) return "general_manager";
  if (/\b(salaried|manager|management|assistant\s+manager|shift\s+lead|shift\s+leader|supervisor)\b/.test(role)) return "salaried_manager";
  if (/\b(hourly|store|crew|team\s+member|cashier|server|host|hostess|cook|line\s+cook|prep|grill|dishwasher|bartender|barista|service|representative)\b/.test(role)) return "hourly_store";
  return "other";
}
function statusStyle(status: string): React.CSSProperties {
  const themes: Record<StatusOption, { bg: string; text: string; border: string; shadow: string }> = {
    new: { bg: "rgba(53,128,110,0.12)", text: "#1d5b4d", border: "rgba(53,128,110,0.28)", shadow: "rgba(53,128,110,0.12)" },
    reviewed: { bg: "rgba(30,137,153,0.12)", text: "#11606d", border: "rgba(30,137,153,0.28)", shadow: "rgba(30,137,153,0.12)" },
    contacted: { bg: "rgba(227,160,8,0.15)", text: "#7a5600", border: "rgba(227,160,8,0.32)", shadow: "rgba(227,160,8,0.14)" },
    archived: { bg: "rgba(101,115,126,0.13)", text: "#46525c", border: "rgba(101,115,126,0.26)", shadow: "rgba(101,115,126,0.12)" },
  };
  const theme = themes[status as StatusOption] ?? themes.archived;
  return { backgroundColor: theme.bg, borderColor: theme.border, boxShadow: `0 8px 18px ${theme.shadow}`, color: theme.text };
}

type Props = { candidates: CandidateSubmission[]; canUpdateStatuses: boolean; accountId: string | null };

export default function InterestedCandidatesExperience({ candidates: initialCandidates, canUpdateStatuses, accountId }: Props) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<JobLevelFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = useMemo(() => Array.from(new Set(candidates.map((item) => item.job_title.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [candidates]);
  const locations = useMemo(() => Array.from(new Set(candidates.map(locationLabel))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [candidates]);
  const activeRole = roleFilter === "all" || roles.includes(roleFilter) ? roleFilter : "all";
  const activeLocation = locationFilter === "all" || locations.includes(locationFilter) ? locationFilter : "all";
  const baseFiltered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const location = locationLabel(candidate);
      const searchable = [candidate.candidate_name, candidate.candidate_email, candidate.candidate_phone, candidate.job_title, candidate.role_category, candidate.restaurant_name, candidate.city, candidate.state, location].map((value) => (value ?? "").trim().toLowerCase()).join(" ");
      return (!query || searchable.includes(query)) && (activeRole === "all" || candidate.job_title.trim() === activeRole) && (activeLocation === "all" || location === activeLocation) && (levelFilter === "all" || jobLevel(candidate) === levelFilter);
    });
  }, [activeLocation, activeRole, candidates, levelFilter, search]);
  const counts = useMemo(() => STATUS_OPTIONS.reduce((result, status) => ({ ...result, [status]: baseFiltered.filter((candidate) => candidate.status === status).length }), { all: baseFiltered.length } as Record<StatusFilter, number>), [baseFiltered]);
  const visible = useMemo(() => statusFilter === "all" ? baseFiltered : baseFiltered.filter((candidate) => candidate.status === statusFilter), [baseFiltered, statusFilter]);

  async function headers(contentType = false) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again before continuing.");
    return { Authorization: `Bearer ${token}`, ...(contentType ? { "Content-Type": "application/json" } : {}), ...(accountId ? { "X-Employer-Account-Id": accountId } : {}) };
  }
  async function updateStatus(id: string, status: string) {
    if (busyId) return;
    setBusyId(id); setError(null);
    try {
      const response = await fetch("/api/employer/candidate-submissions", { method: "PATCH", headers: await headers(true), body: JSON.stringify({ id, status }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Could not update candidate status.");
      setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, status } : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update candidate status."); }
    finally { setBusyId(null); }
  }
  async function openResume(id: string) {
    setBusyId(id); setError(null);
    try {
      const response = await fetch(`/api/employer/candidate-submissions/${encodeURIComponent(id)}/resume`, { headers: await headers() });
      const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error || "Could not create a secure resume link.");
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a secure resume link."); }
    finally { setBusyId(null); }
  }

  return <section className="rn-candidates">
    <div className="rn-candidate-title-row"><h2>Interested Candidates</h2><span>{candidates.length} total</span><span className="new">{counts.new} new</span></div>
    <p>Candidate submissions from your public job ad pages, newest first.</p>
    {error ? <div role="alert" className="rn-candidate-error">{error}</div> : null}
    {candidates.length ? <>
      <div className="rn-candidate-filter-controls" aria-label="Filter interested candidates">
        <label><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone, job, or location" aria-label="Search interested candidates" /></label>
        <label><span>Job Role</span><select value={activeRole} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter interested candidates by job role"><option value="all">All job roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label><span>Location</span><select value={activeLocation} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter interested candidates by location"><option value="all">All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
        <label><span>Job Level</span><select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as JobLevelFilter)} aria-label="Filter interested candidates by job level">{JOB_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <div className="rn-candidate-filter-summary" role="status">Showing {visible.length} of {candidates.length} access-allowed candidates{levelFilter !== "all" ? ` • ${JOB_LEVELS.find((item) => item.value === levelFilter)?.label}` : ""}</div>
      <div className="rn-candidate-filters" aria-label="Filter interested candidates by status">{STATUS_FILTERS.map((filter) => <button type="button" className={statusFilter === filter.value ? "active" : ""} key={filter.value} onClick={() => setStatusFilter(filter.value)} aria-pressed={statusFilter === filter.value}><span>{filter.label}</span><strong>{counts[filter.value]}</strong></button>)}</div>
    </> : null}
    {!candidates.length ? <div className="rn-candidate-empty">No interested candidates yet. When job seekers send their information, they will appear here.</div> : !visible.length ? <div className="rn-candidate-empty">No candidates match the selected search, job role, location, job level, and status filters.</div> : <div className="rn-candidate-list">{visible.map((candidate) => <article className="rn-candidate-card" id={`candidate-${candidate.id}`} key={candidate.id}>
      <div className="rn-candidate-card-header"><div><h3>{candidate.candidate_name}</h3><p>{candidate.job_title} • {[candidate.restaurant_name, [candidate.city, candidate.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") || "Restaurant job"}</p><p>Submitted {formatDate(candidate.created_at)}</p></div>
        <label className="rn-candidate-status-label"><span>Status</span><span className="rn-candidate-status-control" style={statusStyle(candidate.status)}><i aria-hidden="true" /><select value={candidate.status} onChange={(event) => updateStatus(candidate.id, event.target.value)} disabled={!canUpdateStatuses || busyId === candidate.id} aria-label={`Update ${candidate.candidate_name}'s status`}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></span></label>
      </div>
      <div className="rn-candidate-contact-grid"><div><span>Email</span><a href={`mailto:${candidate.candidate_email}`}>{candidate.candidate_email}</a></div><div><span>Phone</span><a href={`tel:${candidate.candidate_phone}`}>{candidate.candidate_phone}</a></div><div><span>Resume</span>{candidate.resume_filename ? <button type="button" onClick={() => openResume(candidate.id)} disabled={busyId === candidate.id}>{busyId === candidate.id ? "Opening..." : candidate.resume_filename}</button> : "—"}</div></div>
      {candidate.message ? <p className="rn-candidate-message">{candidate.message}</p> : null}
    </article>)}</div>}
    <style jsx>{`
      .rn-candidates{min-width:0}.rn-candidate-title-row{align-items:center;display:flex;flex-wrap:wrap;gap:10px}.rn-candidate-title-row h2{color:${homeTheme.text};font-family:var(--font-heading);font-size:26px;line-height:1.2;margin:0}.rn-candidate-title-row span{background:rgba(31,79,68,.1);border:1px solid rgba(31,79,68,.16);border-radius:999px;color:${homeTheme.green};font:900 12px var(--font-body);padding:6px 10px}.rn-candidate-title-row .new{background:rgba(227,160,8,.13);border-color:rgba(227,160,8,.24);color:#7a5600}.rn-candidates>p{color:${homeTheme.muted};font:600 16px var(--font-body);margin:6px 0 0}.rn-candidate-error{background:rgba(173,67,67,.08);border:1px solid rgba(173,67,67,.28);border-radius:14px;color:#8a2f2f;font:800 14px var(--font-body);margin-top:16px;padding:12px 14px}
      .rn-candidate-filter-controls{align-items:end;display:grid;gap:12px;grid-template-columns:minmax(260px,1.4fr) repeat(3,minmax(170px,1fr));margin:18px 0 10px}.rn-candidate-filter-controls label{color:${homeTheme.muted};display:grid;font:900 12px var(--font-body);gap:7px;letter-spacing:.35px;text-transform:uppercase}.rn-candidate-filter-controls input,.rn-candidate-filter-controls select{appearance:none;background:#fffffff0;border:1px solid ${homeTheme.border};border-radius:14px;color:${homeTheme.text};font:800 14px var(--font-body);min-height:46px;min-width:0;outline:0;padding:0 14px;text-transform:none;width:100%}.rn-candidate-filter-controls input:focus,.rn-candidate-filter-controls select:focus{border-color:rgba(31,79,68,.34);box-shadow:0 0 0 3px rgba(31,79,68,.12)}.rn-candidate-filter-summary{color:${homeTheme.muted};font:900 13px var(--font-body);margin:0 0 12px}.rn-candidate-filters{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 16px}.rn-candidate-filters button{align-items:center;background:#fffaf2d1;border:1px solid ${homeTheme.border};border-radius:999px;color:${homeTheme.text};cursor:pointer;display:inline-flex;font:900 14px var(--font-body);gap:8px;min-height:42px;padding:9px 13px}.rn-candidate-filters button.active{background:${homeTheme.green};border-color:${homeTheme.green};color:#fffaf2}.rn-candidate-filters strong{background:#fff;border-radius:999px;font-size:12px;min-width:28px;padding:3px 8px}.rn-candidate-filters .active strong{background:#ffffff2e}
      .rn-candidate-empty{background:#ffffffa6;border:1px dashed ${homeTheme.border};border-radius:14px;color:${homeTheme.muted};font:700 14px var(--font-body);padding:18px}.rn-candidate-list{display:grid;gap:12px}.rn-candidate-card{background:#ffffffe6;border:1px solid ${homeTheme.border};border-radius:16px;min-width:0;padding:16px}.rn-candidate-card-header{align-items:flex-start;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between}.rn-candidate-card h3{color:${homeTheme.green};font:700 24px/1.1 var(--font-heading);margin:0 0 5px}.rn-candidate-card p{color:${homeTheme.muted};font:700 14px var(--font-body);margin:4px 0 0;overflow-wrap:anywhere}.rn-candidate-status-label{color:${homeTheme.muted};display:grid;font:900 12px var(--font-body);gap:7px;min-width:176px;text-transform:uppercase}.rn-candidate-status-control{align-items:center;border:1px solid;border-radius:999px;display:grid;grid-template-columns:auto minmax(0,1fr);overflow:hidden;padding-left:12px}.rn-candidate-status-control i{background:currentColor;border-radius:999px;height:8px;width:8px}.rn-candidate-status-control select{appearance:none;background:transparent;border:0;color:currentColor;font:900 14px var(--font-body);min-height:40px;outline:0;padding:8px 14px 8px 9px;width:100%}.rn-candidate-contact-grid{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:14px}.rn-candidate-contact-grid>div{background:#fffaf2b8;border:1px solid #00000014;border-radius:12px;color:${homeTheme.text};font:800 14px var(--font-body);min-width:0;overflow-wrap:anywhere;padding:12px}.rn-candidate-contact-grid span{color:${homeTheme.muted};display:block;font-size:11px;font-weight:900;letter-spacing:.35px;margin-bottom:5px;text-transform:uppercase}.rn-candidate-contact-grid a,.rn-candidate-contact-grid button{background:transparent;border:0;color:${homeTheme.green};font:900 14px var(--font-body);overflow-wrap:anywhere;padding:0;text-align:left;text-decoration:underline;text-underline-offset:3px}.rn-candidate-message{border-left:4px solid ${homeTheme.green};margin-top:14px!important;padding-left:12px;white-space:pre-wrap}
      @media(max-width:760px){.rn-candidate-filter-controls,.rn-candidate-card-header{display:grid;grid-template-columns:1fr}.rn-candidate-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.rn-candidate-filters button,.rn-candidate-status-label{min-width:0;width:100%}.rn-candidate-contact-grid{grid-template-columns:1fr}}@media(max-width:460px){.rn-candidate-filters{grid-template-columns:1fr}.rn-candidate-card{padding:14px}}
    `}</style>
  </section>;
}

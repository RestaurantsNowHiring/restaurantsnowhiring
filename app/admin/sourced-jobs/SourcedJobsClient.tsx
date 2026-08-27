"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EMPLOYMENT_OPTIONS, STATE_OPTIONS } from "../../../lib/jobFormOptions";
import styles from "./sourcedJobs.module.css";

type Job = { id: string; restaurant_name: string; title: string; city: string; state: string; status: string; last_verified_at: string | null; review_due_at: string | null };
type JobAnalytics = { id: string; title: string; views: number; uniqueViewers: number; applyClicks: number };
type Analytics = { companyId: string; companyName: string; activeSourcedJobs: number; totalJobViews: number; uniqueViewers: number; applyClicks: number; applyClickRate: number; readyForOutreach: boolean; jobs: JobAnalytics[] };
type Filter = "all" | "review" | "active" | "expired" | "retired";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" }, { value: "review", label: "Needs Review" },
  { value: "active", label: "Active" }, { value: "expired", label: "Expired" },
  { value: "retired", label: "Retired" },
];

function needsReview(job: Job) {
  return job.status === "active" && Boolean(job.review_due_at) && new Date(job.review_due_at as string) <= new Date();
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
}

export default function SourcedJobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/sourced-jobs");
    const body = await response.json();
    if (response.ok) { setJobs(body.jobs ?? []); setAnalytics(body.analytics ?? []); }
    else setMessage(body.error ?? "Could not load sourced jobs.");
  }, []);
  // The initial API response seeds this client-only admin workspace.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filterCounts = useMemo(() => ({
    all: jobs.length, review: jobs.filter(needsReview).length,
    active: jobs.filter((job) => job.status === "active").length,
    expired: jobs.filter((job) => job.status === "expired").length,
    retired: jobs.filter((job) => job.status === "retired").length,
  }), [jobs]);
  const shown = useMemo(() => jobs.filter((job) => filter === "all" || (filter === "review" ? needsReview(job) : job.status === filter)), [jobs, filter]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const form = event.currentTarget;
    const response = await fetch("/api/admin/sourced-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Sourced job created and scheduled for review in 7 days." : body.error ?? "Could not create sourced job.");
    if (response.ok) { form.reset(); await load(); }
    setSaving(false);
  }

  async function action(id: string, actionName: string) {
    const response = await fetch(`/api/admin/sourced-jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) });
    setMessage(response.ok ? `Job ${actionName} action completed.` : "Action failed.");
    await load();
  }

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/admin" className={styles.back}>← Admin</Link><h1>RNH Sourced Jobs</h1><p>Manually publish opportunities found on an employer&apos;s official careers site or official ATS.</p></div></header>
    {message && <div className={styles.notice} role="status">{message}</div>}

    <form onSubmit={submit} className={styles.formCard}>
      <FormSection title="Company Information">
        <Field label="Company" required><input name="companyName" required placeholder="Restaurant or company name" /></Field>
        <Field label="Company Website"><input name="companyWebsite" type="url" placeholder="https://company.com" /></Field>
      </FormSection>
      <FormSection title="Job Information">
        <Field label="Job Title" required><input name="title" required placeholder="e.g. Line Cook" /></Field>
        <Field label="City" required><input name="city" required placeholder="City" /></Field>
        <Field label="State" required><select name="state" required defaultValue=""><option value="" disabled>Select state</option>{STATE_OPTIONS.map((state) => <option key={state}>{state}</option>)}</select></Field>
        <Field label="Employment Type" required><select name="employmentType" required defaultValue=""><option value="" disabled>Select employment type</option>{[...EMPLOYMENT_OPTIONS, "Other"].map((option) => <option key={option}>{option}</option>)}</select></Field>
        <Field label="Pay / Pay Range"><input name="payRange" placeholder="e.g. $18–$22 per hour" /></Field>
      </FormSection>
      <FormSection title="Source Information">
        <Field label="Official Job Source URL" required help="The official careers or ATS page where RNH verified this opening."><input name="sourceUrl" type="url" required placeholder="https://careers.company.com/job/..." /></Field>
        <Field label="Official External Apply URL" required help="The destination opened by APPLY ON COMPANY SITE."><input name="externalApplyUrl" type="url" required placeholder="https://jobs.ats.com/apply/..." /></Field>
      </FormSection>
      <FormSection title="RNH Listing">
        <Field label="Short RNH-written Summary" required wide help="Write a short original summary. Do not copy the employer's full job description."><textarea name="summary" required rows={4} placeholder="Briefly summarize the role, key duties, and relevant qualifications." /></Field>
        <Field label="Status" required><select name="status" defaultValue="active"><option value="active">Active</option><option value="draft">Draft</option><option value="expired">Expired</option><option value="retired">Retired</option><option value="removed">Removed</option></select></Field>
      </FormSection>
      <div className={styles.formFooter}><span>Verification dates are set automatically.</span><button type="submit" disabled={saving}>{saving ? "Adding…" : "Add Sourced Job"}</button></div>
    </form>

    <section className={styles.management}>
      <div className={styles.filters} aria-label="Filter sourced jobs">{FILTERS.map(({ value, label }) => <button type="button" key={value} className={filter === value ? styles.filterActive : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} ({filterCounts[value]})</button>)}</div>
      <div className={styles.tableWrap}><table><thead><tr>{["Company", "Job", "Source", "Status", "Last Verified", "Review Due", "Actions"].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{shown.map((job) => <tr key={job.id}><td className={styles.company}>{job.restaurant_name}</td><td><strong>{job.title}</strong><small>{job.city}, {job.state}</small></td><td><span className={styles.sourceBadge}>RNH Sourced</span></td><td><span className={`${styles.statusBadge} ${styles[job.status] ?? ""}`}>{needsReview(job) ? "Needs Review" : job.status}</span></td><td>{formatDate(job.last_verified_at)}</td><td>{formatDate(job.review_due_at)}</td><td><div className={styles.actions}>{["verify", "expire", "retire", "remove"].map((name) => <button type="button" key={name} onClick={() => action(job.id, name)}>{name}</button>)}</div></td></tr>)}</tbody></table>{shown.length === 0 && <p className={styles.empty}>No sourced jobs match this filter.</p>}</div>
    </section>

    <section className={styles.analytics}><h2>Company Sourced-job Analytics</h2>{analytics.length === 0 ? <p className={styles.empty}>No sourced-job analytics yet. Analytics will appear after sourced jobs begin receiving views and Apply clicks.</p> : analytics.map((company) => <article key={company.companyId} className={styles.analyticsCard}><h3>{company.companyName} {company.readyForOutreach && <span className={styles.outreach}>Ready for Outreach</span>}</h3><div className={styles.metrics}><Metric label="Active Sourced Jobs" value={company.activeSourcedJobs} /><Metric label="Total Job Views" value={company.totalJobViews} /><Metric label="Unique Viewers" value={company.uniqueViewers} /><Metric label="Apply Clicks" value={company.applyClicks} /><Metric label="Apply Click Rate" value={`${(company.applyClickRate * 100).toFixed(1)}%`} /></div><div className={styles.tableWrap}><table><thead><tr><th>Job</th><th>Views</th><th>Unique Viewers</th><th>Apply Clicks</th></tr></thead><tbody>{company.jobs.map((job) => <tr key={job.id}><td>{job.title}</td><td>{job.views}</td><td>{job.uniqueViewers}</td><td>{job.applyClicks}</td></tr>)}</tbody></table></div></article>)}</section>
  </main>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className={styles.formSection}><legend>{title}</legend><div className={styles.grid}>{children}</div></fieldset>; }
function Field({ label, required, help, wide, children }: { label: string; required?: boolean; help?: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? styles.wide : undefined}><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}{help && <small>{help}</small>}</label>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

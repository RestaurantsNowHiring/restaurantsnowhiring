"use client";
import { FormEvent, useState } from "react";
import { CANADIAN_PROVINCE_OPTIONS, COUNTRY_OPTIONS, EMPLOYMENT_OPTIONS, STATE_OPTIONS } from "../../lib/jobFormOptions";
import styles from "./postFree.module.css";

export default function PostFreeForm() {
  const [country, setCountry] = useState("United States");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [complete, setComplete] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/promotional-entry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok) setComplete(true); else setError(result?.error || "We could not submit your request. Please try again.");
    setBusy(false);
  }
  if (complete) return <div className={styles.success} role="status"><h2>Check your email</h2><p>We received your Free First Job request. Verify your email to continue.</p></div>;
  const locations = country === "Canada" ? CANADIAN_PROVINCE_OPTIONS : STATE_OPTIONS;
  return <form className={styles.form} onSubmit={submit}>
    <fieldset><legend>Company information</legend><div className={styles.grid}>
      <label>Company / restaurant name<input name="companyName" required maxLength={160} autoComplete="organization" /></label>
      <label>Company website<input name="companyWebsite" required type="url" placeholder="https://example.com" autoComplete="url" /></label>
      <label>Contact name<input name="contactName" required maxLength={160} autoComplete="name" /></label>
      <label>Work email<input name="contactEmail" required type="email" maxLength={254} autoComplete="email" /></label>
    </div></fieldset>
    <fieldset><legend>Job information</legend><div className={styles.grid}>
      <label className={styles.wide}>Job title<input name="title" required maxLength={160} /></label>
      <label>City<input name="city" required maxLength={120} autoComplete="address-level2" /></label>
      <label>Country<select name="country" value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRY_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>State / province<select name="state" required defaultValue="" key={country}><option value="" disabled>Select one</option>{locations.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Job type<select name="employmentType" required defaultValue=""><option value="" disabled>Select one</option>{EMPLOYMENT_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className={styles.wide}>Job description<textarea name="description" required maxLength={10000} rows={9} /></label>
      <label className={styles.wide}>Official company application URL<input name="applicationUrl" required type="url" placeholder="https://example.com/careers/apply" /></label>
    </div></fieldset>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button disabled={busy} type="submit">{busy ? "Submitting…" : "Submit Free First Job request"}</button>
  </form>;
}

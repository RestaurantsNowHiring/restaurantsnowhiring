"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";

type EmployerAccess = {
  role: EmployerRole;
  accountId: string | null;
  canManageJobs: boolean;
};

type JobTemplate = {
  id: string;
  employer_account_id: string | null;
  template_name: string;
  job_title: string;
  role_category: string | null;
  employment_type: string | null;
  schedule: string | null;
  pay_defaults: string | null;
  job_description: string | null;
  benefits: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type TemplateForm = Pick<JobTemplate, "template_name" | "job_title" | "role_category" | "employment_type" | "schedule" | "pay_defaults" | "job_description" | "benefits" | "active">;

type TemplateStatusFilter = "all" | "active" | "inactive";

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  template_name: "",
  job_title: "",
  role_category: "",
  employment_type: "",
  schedule: "",
  pay_defaults: "",
  job_description: "",
  benefits: "",
  active: true,
};

const ROLE_OPTIONS = [
  "Line",
  "Prep",
  "Dish",
  "Server",
  "Cashier",
  "Host",
  "Bartender",
  "Manager",
  "Shift Lead",
  "Busser",
  "Runner",
  "Expo",
  "Barista",
  "Delivery",
  "Other",
];

const EMPLOYMENT_TYPES = ["Full time", "Part time", "Seasonal", "Temporary", "Contract", "Internship"];

function templateToForm(template: JobTemplate): TemplateForm {
  return {
    template_name: template.template_name ?? "",
    job_title: template.job_title ?? "",
    role_category: template.role_category ?? "",
    employment_type: template.employment_type ?? "",
    schedule: template.schedule ?? "",
    pay_defaults: template.pay_defaults ?? "",
    job_description: template.job_description ?? "",
    benefits: template.benefits ?? "",
    active: template.active,
  };
}

function formatText(value: string | null) {
  return value?.trim() || "—";
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export default function JobTemplatesPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [access, setAccess] = useState<EmployerAccess | null>(null);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const benefitsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const formLabelStyle = useMemo(() => ({
    display: "block",
    color: homeTheme.text,
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 900,
  }), []);

  const descriptionTextareaStyle = useMemo(() => ({
    ...homeInputStyle,
    height: "auto",
    lineHeight: 1.5,
    marginTop: 6,
    minHeight: 220,
    padding: "14px 16px",
    overflow: "hidden",
    resize: "vertical" as const,
  }), []);

  const benefitsTextareaStyle = useMemo(() => ({
    ...homeInputStyle,
    height: "auto",
    lineHeight: 1.5,
    marginTop: 6,
    minHeight: 120,
    padding: "14px 16px",
    overflow: "hidden",
    resize: "vertical" as const,
  }), []);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadTemplates = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/job-templates")}`);
      return;
    }

    const [meResponse, templatesResponse] = await Promise.all([
      fetch("/api/employer/me", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/employer/job-templates?includeInactive=true", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const mePayload = (await meResponse.json().catch(() => null)) as { employer?: EmployerAccess } | null;
    setAccess(mePayload?.employer ?? null);

    if (!templatesResponse.ok) {
      const payload = (await templatesResponse.json().catch(() => null)) as { error?: string } | null;
      setMessage(payload?.error || "Could not load job templates.");
      setTemplates([]);
      setAuthStatus("allowed");
      return;
    }

    const templatesPayload = (await templatesResponse.json()) as { templates?: JobTemplate[] };
    const nextTemplates = templatesPayload.templates ?? [];
    setTemplates(nextTemplates);
    setSelectedTemplateId((current) => current && nextTemplates.some((template) => template.id === current) ? current : nextTemplates[0]?.id ?? null);
    setAuthStatus("allowed");
  }, [getAccessToken, router]);

  useEffect(() => {
    void Promise.resolve().then(loadTemplates);
  }, [loadTemplates]);

  useEffect(() => {
    if (!isEditing) return;
    resizeTextarea(descriptionTextareaRef.current);
    resizeTextarea(benefitsTextareaRef.current);
  }, [form.benefits, form.job_description, isEditing]);

  const canManageTemplates = Boolean(access?.canManageJobs);

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? template.active : !template.active);
      const matchesSearch = !normalizedSearch || [template.template_name, template.job_title, template.role_category, template.employment_type, template.schedule, template.pay_defaults]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesSearch;
    });
  }, [search, statusFilter, templates]);

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === selectedTemplateId) ?? null, [selectedTemplateId, templates]);

  function startNewTemplate() {
    setSelectedTemplateId(null);
    setForm(EMPTY_TEMPLATE_FORM);
    setIsEditing(true);
    setMessage(null);
  }

  function startEditingTemplate(template: JobTemplate) {
    setSelectedTemplateId(template.id);
    setForm(templateToForm(template));
    setIsEditing(true);
    setMessage(null);
  }

  function cancelEditing() {
    setForm(EMPTY_TEMPLATE_FORM);
    setIsEditing(false);
  }

  function updateForm<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDescription(event: ChangeEvent<HTMLTextAreaElement>) {
    updateForm("job_description", event.target.value);
    resizeTextarea(event.currentTarget);
  }

  function updateBenefits(event: ChangeEvent<HTMLTextAreaElement>) {
    updateForm("benefits", event.target.value);
    resizeTextarea(event.currentTarget);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again before managing job templates.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const isUpdate = Boolean(selectedTemplateId && templates.some((template) => template.id === selectedTemplateId && template.employer_account_id));
    const response = await fetch("/api/employer/job-templates", {
      method: isUpdate ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...(isUpdate ? { id: selectedTemplateId } : {}), ...form }),
    });
    const payload = (await response.json().catch(() => null)) as { template?: JobTemplate; error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setMessage(payload?.error || "Could not save job template.");
      return;
    }

    setMessage("Job template saved.");
    setIsEditing(false);
    setSelectedTemplateId(payload?.template?.id ?? selectedTemplateId);
    await loadTemplates();
  }

  async function setCustomTemplateActive(template: JobTemplate, active: boolean) {
    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again before managing job templates.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/employer/job-templates", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: template.id, ...templateToForm(template), active }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setMessage(payload?.error || "Could not update template status.");
      return;
    }

    setMessage(active ? "Custom template reactivated." : "Custom template deactivated.");
    await loadTemplates();
  }

  if (authStatus === "loading") {
    return <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading job templates…</main>;
  }

  return (
    <main style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 72, backgroundColor: homeTheme.bg }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Job Templates
          </p>
          <div className="rn-template-header-row">
            <div>
              <h1 style={{ margin: "8px 0", fontSize: 38, lineHeight: 1.1, fontFamily: "var(--font-heading)", color: homeTheme.green }}>
                Template Management
              </h1>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
Create and manage reusable templates for your employer account. Active templates appear in Post a Job.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canManageTemplates ? (
                <button type="button" className="rn-btn-primary" style={homePrimaryButton} onClick={startNewTemplate}>
                  Create Template
                </button>
              ) : null}
              <Link href="/post-job" style={homeSecondaryButton} className="rn-btn-secondary">Post a Job</Link>
              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">Back to Dashboard</Link>
            </div>
          </div>
        </section>

        {message ? (
          <div role="alert" style={{ ...homeCardStyle, marginBottom: 16, color: message.includes("Could not") || message.includes("read-only") || message.includes("sign in") ? "#8a2f2f" : homeTheme.green, fontWeight: 900 }}>
            {message}
          </div>
        ) : null}

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-template-summary-grid">
            <div><strong>{templates.length}</strong><span>Total templates</span></div>
            <div><strong>{templates.filter((template) => template.active).length}</strong><span>Active templates</span></div>
            <div><strong>{templates.filter((template) => !template.active).length}</strong><span>Inactive templates</span></div>
          </div>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-template-filter-grid">
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Search templates
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, job title, role, schedule" style={{ ...homeInputStyle, marginTop: 6 }} />
            </label>
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TemplateStatusFilter)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <div className="rn-template-directory-grid">
          <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Template list</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {templates.length === 0 ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <p style={{ color: homeTheme.muted, fontWeight: 800, margin: 0 }}>No job templates yet.</p>
                  {canManageTemplates ? (
                    <button type="button" className="rn-btn-primary" style={homePrimaryButton} onClick={startNewTemplate}>
                      Create Template
                    </button>
                  ) : null}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <p style={{ color: homeTheme.muted, fontWeight: 800 }}>No templates match these filters.</p>
              ) : null}
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => { setSelectedTemplateId(template.id); setIsEditing(false); }}
                  className="rn-template-list-item"
                  style={{
                    textAlign: "left",
                    border: `1px solid ${selectedTemplateId === template.id ? "rgba(53,128,110,.45)" : homeTheme.border}`,
                    borderRadius: 16,
                    background: selectedTemplateId === template.id ? "#dfe7e3" : "#fff",
                    padding: 16,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <span className="rn-template-badge">Custom</span>
                  <strong style={{ display: "block", color: homeTheme.text, fontSize: 16, marginTop: 8 }}>{template.template_name}</strong>
                  <span style={{ display: "block", marginTop: 5, color: homeTheme.muted, fontWeight: 800 }}>{template.job_title}</span>
                  <span style={{ display: "inline-flex", marginTop: 10, color: template.active ? homeTheme.green : homeTheme.muted, fontWeight: 900, fontSize: 12, textTransform: "uppercase" }}>
                    {template.active ? "Active" : "Inactive"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
            {isEditing ? (
              <form onSubmit={saveTemplate} style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>{selectedTemplate ? "Edit custom template" : "Create custom template"}</h2>
                <div className="rn-template-form-grid">
                  <label style={formLabelStyle}>Template name<input required value={form.template_name} onChange={(event) => updateForm("template_name", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={formLabelStyle}>Job title<input required value={form.job_title} onChange={(event) => updateForm("job_title", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={formLabelStyle}>Role category<select value={form.role_category ?? ""} onChange={(event) => updateForm("role_category", event.target.value)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}><option value="">Select…</option>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
                  <label style={formLabelStyle}>Employment type<select value={form.employment_type ?? ""} onChange={(event) => updateForm("employment_type", event.target.value)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}><option value="">Select…</option>{EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                  <label style={formLabelStyle}>Schedule<input value={form.schedule ?? ""} onChange={(event) => updateForm("schedule", event.target.value)} placeholder="Flexible schedule, weekends" style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={formLabelStyle}>Pay defaults<input value={form.pay_defaults ?? ""} onChange={(event) => updateForm("pay_defaults", event.target.value)} placeholder="$14 - $18/hour" style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                </div>
                <label style={formLabelStyle}>Job description<textarea ref={descriptionTextareaRef} value={form.job_description ?? ""} onChange={updateDescription} rows={8} style={descriptionTextareaStyle} /></label>
                <label style={formLabelStyle}>Benefits<textarea ref={benefitsTextareaRef} value={form.benefits ?? ""} onChange={updateBenefits} rows={4} placeholder="401(k), Flexible schedule, Free meals" style={benefitsTextareaStyle} /></label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900, color: homeTheme.text }}>
                  <input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} />
                  Active template
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>{busy ? "Saving..." : "Save Template"}</button>
                  <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={cancelEditing} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : selectedTemplate ? (
              <div>
                <div className="rn-template-header-row">
                  <div>
                    <span className="rn-template-badge">Custom</span>
                    <p style={{ margin: "10px 0 0", color: selectedTemplate.active ? homeTheme.green : homeTheme.muted, fontWeight: 900, fontSize: 12, textTransform: "uppercase" }}>
                      {selectedTemplate.active ? "Active" : "Inactive"}
                    </p>
                    <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-heading)", color: homeTheme.text }}>{selectedTemplate.template_name}</h2>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {canManageTemplates ? <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => startEditingTemplate(selectedTemplate)}>Edit</button> : null}
                    {canManageTemplates ? (
                      <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => setCustomTemplateActive(selectedTemplate, !selectedTemplate.active)} disabled={busy}>
                        {selectedTemplate.active ? "Deactivate" : "Reactivate"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <dl className="rn-template-detail-grid">
                  <div><dt>Job title</dt><dd>{formatText(selectedTemplate.job_title)}</dd></div>
                  <div><dt>Role category</dt><dd>{formatText(selectedTemplate.role_category)}</dd></div>
                  <div><dt>Employment type</dt><dd>{formatText(selectedTemplate.employment_type)}</dd></div>
                  <div><dt>Schedule</dt><dd>{formatText(selectedTemplate.schedule)}</dd></div>
                  <div><dt>Pay defaults</dt><dd>{formatText(selectedTemplate.pay_defaults)}</dd></div>
                  <div><dt>Post a Job availability</dt><dd>{selectedTemplate.active ? "Available" : "Hidden until reactivated"}</dd></div>
                </dl>
                <div className="rn-template-long-field"><h3>Job description</h3><p>{formatText(selectedTemplate.job_description)}</p></div>
                <div className="rn-template-long-field"><h3>Benefits</h3><p>{formatText(selectedTemplate.benefits)}</p></div>
              </div>
            ) : (
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>{templates.length === 0 ? "No job templates yet." : "Select a template to view details, or create a custom template."}</p>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        .rn-template-header-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .rn-template-filter-grid,
        .rn-template-form-grid,
        .rn-template-detail-grid,
        .rn-template-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .rn-template-summary-grid div,
        .rn-template-detail-grid div,
        .rn-template-long-field {
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: #fff;
          padding: 14px;
        }
        .rn-template-summary-grid strong {
          display: block;
          color: ${homeTheme.green};
          font-size: 28px;
          font-family: var(--font-heading);
        }
        .rn-template-summary-grid span {
          display: block;
          color: ${homeTheme.muted};
          font-weight: 900;
          margin-top: 4px;
        }
        .rn-template-directory-grid {
          display: grid;
          grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.35fr);
          gap: 16px;
          align-items: start;
        }
        .rn-template-detail-grid {
          margin: 18px 0 0;
        }
        .rn-template-detail-grid dt {
          color: ${homeTheme.muted};
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .3px;
        }
        .rn-template-detail-grid dd {
          margin: 6px 0 0;
          color: ${homeTheme.text};
          font-weight: 850;
          overflow-wrap: anywhere;
        }
        .rn-template-long-field {
          margin-top: 14px;
        }
        .rn-template-long-field h3 {
          margin: 0 0 8px;
          color: ${homeTheme.text};
        }
        .rn-template-long-field p {
          margin: 0;
          color: ${homeTheme.text};
          font-weight: 750;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .rn-template-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 10px;
          color: #fff;
          background: ${homeTheme.green};
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .3px;
        }
        @media (max-width: 900px) {
          .rn-template-filter-grid,
          .rn-template-form-grid,
          .rn-template-detail-grid,
          .rn-template-summary-grid,
          .rn-template-directory-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

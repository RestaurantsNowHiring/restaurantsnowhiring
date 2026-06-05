"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { homeCardStyle, homeInputStyle, homePrimaryButton, homeSecondaryButton, homeTheme } from "../../styles/homepageDesignSystem";

type EmployerRole = "account_owner" | "hiring_manager" | "viewer";

type EmployerAccess = {
  role: EmployerRole;
  canManageTeam: boolean;
};

type Store = {
  id: string;
  employer_account_id: string;
  location_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  store_email: string | null;
  ta_email: string | null;
  gm_op_email: string | null;
  minimum_wage: string | null;
  pay_range: string | null;
  default_application_url: string | null;
  active: boolean;
  is_assignable_location: boolean;
  created_at: string;
  updated_at: string;
};

type StoreJob = { id: string; title: string; city: string | null; state: string | null };
type StoreForm = Omit<Store, "id" | "employer_account_id" | "is_assignable_location" | "created_at" | "updated_at">;

type StoreStatusFilter = "all" | "active" | "inactive";

const EMPTY_STORE_FORM: StoreForm = {
  location_name: "",
  address: "",
  city: "",
  state: "",
  store_email: "",
  ta_email: "",
  gm_op_email: "",
  minimum_wage: "",
  pay_range: "",
  default_application_url: "",
  active: true,
};

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

function storeToForm(store: Store): StoreForm {
  return {
    location_name: store.location_name ?? "",
    address: store.address ?? "",
    city: store.city ?? "",
    state: store.state ?? "",
    store_email: store.store_email ?? "",
    ta_email: store.ta_email ?? "",
    gm_op_email: store.gm_op_email ?? "",
    minimum_wage: store.minimum_wage ?? "",
    pay_range: store.pay_range ?? "",
    default_application_url: store.default_application_url ?? "",
    active: store.active,
  };
}

function formatAddress(store: Store) {
  return [store.address, [store.city, store.state].filter(Boolean).join(", ")].filter(Boolean).join(" • ") || "Address not set";
}

function formatCandidateRoutingEmails(store: Store) {
  const emails = [store.store_email, store.ta_email, store.gm_op_email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return emails.length > 0 ? emails.join(", ") : "—";
}

function employerAccountHeaders(token: string, contentType?: string) {
  const selectedEmployerAccountId = typeof window === "undefined" ? null : window.localStorage.getItem("rn-selected-employer-account-id");
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(selectedEmployerAccountId ? { "X-Employer-Account-Id": selectedEmployerAccountId } : {}),
  };
}

export default function StoreDirectoryPage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<"loading" | "allowed">("loading");
  const [access, setAccess] = useState<EmployerAccess | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeJobsByStore, setActiveJobsByStore] = useState<Record<string, StoreJob[]>>({});
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StoreStatusFilter>("all");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<StoreForm>(EMPTY_STORE_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadStores = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      router.replace(`/employer-login?next=${encodeURIComponent("/employer-dashboard/stores")}`);
      return;
    }

    const [meResponse, storesResponse] = await Promise.all([
      fetch("/api/employer/me", { headers: employerAccountHeaders(token) }),
      fetch("/api/employer/stores?assignableOnly=true", { headers: employerAccountHeaders(token) }),
    ]);

    const mePayload = (await meResponse.json().catch(() => null)) as { employer?: EmployerAccess } | null;
    setAccess(mePayload?.employer ?? null);

    if (!storesResponse.ok) {
      const payload = (await storesResponse.json().catch(() => null)) as { error?: string } | null;
      setMessage(payload?.error || "Could not load stores.");
      setStores([]);
      setAuthStatus("allowed");
      return;
    }

    const storesPayload = (await storesResponse.json()) as { stores?: Store[]; activeJobsByStore?: Record<string, StoreJob[]> };
    const nextStores = storesPayload.stores ?? [];
    setStores(nextStores);
    setActiveJobsByStore(storesPayload.activeJobsByStore ?? {});
    setSelectedStoreId((current) => current && nextStores.some((store) => store.id === current) ? current : nextStores[0]?.id ?? null);
    setAuthStatus("allowed");
  }, [getAccessToken, router]);

  useEffect(() => {
    void Promise.resolve().then(loadStores);
  }, [loadStores]);

  const uniqueStates = useMemo(() => {
    return Array.from(new Set(stores.map((store) => store.state).filter((state): state is string => Boolean(state)))).sort();
  }, [stores]);

  const filteredStores = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return stores.filter((store) => {
      if (!store.active || store.is_assignable_location !== true) return false;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? store.active : !store.active);
      const matchesState = stateFilter === "all" || store.state === stateFilter;
      const matchesSearch = !normalizedSearch || [store.location_name, store.address, store.city, store.state, store.store_email, store.ta_email, store.gm_op_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesState && matchesSearch;
    });
  }, [search, stateFilter, statusFilter, stores]);

  const selectedStore = useMemo(() => stores.find((store) => store.id === selectedStoreId) ?? null, [selectedStoreId, stores]);
  const canManageStores = Boolean(access?.canManageTeam);
  const storeFormLabelStyle = { fontWeight: 900, color: homeTheme.text };

  function startNewStore() {
    setSelectedStoreId(null);
    setForm(EMPTY_STORE_FORM);
    setIsEditing(true);
    setMessage(null);
  }

  function startEditingStore(store: Store) {
    setSelectedStoreId(store.id);
    setForm(storeToForm(store));
    setIsEditing(true);
    setMessage(null);
  }

  function cancelEditing() {
    setForm(EMPTY_STORE_FORM);
    setIsEditing(false);
  }

  function updateForm<K extends keyof StoreForm>(key: K, value: StoreForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = await getAccessToken();
    if (!token) {
      setMessage("Please sign in again before managing stores.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const isUpdate = Boolean(selectedStoreId && stores.some((store) => store.id === selectedStoreId));
    const response = await fetch("/api/employer/stores", {
      method: isUpdate ? "PATCH" : "POST",
      headers: employerAccountHeaders(token, "application/json"),
      body: JSON.stringify({ ...(isUpdate ? { id: selectedStoreId } : {}), ...form }),
    });
    const payload = (await response.json().catch(() => null)) as { store?: Store; error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setMessage(payload?.error || "Could not save store.");
      return;
    }

    setMessage("Store saved.");
    setIsEditing(false);
    setSelectedStoreId(payload?.store?.id ?? selectedStoreId);
    await loadStores();
  }

  if (authStatus === "loading") {
    return <main style={{ minHeight: "100vh", paddingTop: 100, backgroundColor: homeTheme.bg }}>Loading store directory…</main>;
  }

  return (
    <main style={{ minHeight: "100vh", paddingTop: 100, paddingBottom: 72, backgroundColor: homeTheme.bg }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p style={{ margin: 0, color: homeTheme.green, fontSize: 12, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Store Directory
          </p>
          <div className="rn-store-header-row">
            <div>
              <h1 style={{ margin: "8px 0", fontSize: 38, lineHeight: 1.1, fontFamily: "var(--font-heading)", color: homeTheme.green }}>
                Stores and Locations
              </h1>
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 700 }}>
                Manage location details, candidate routing defaults, wage guidance, and application links for job posting.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {canManageStores ? (
                <button type="button" className="rn-btn-primary" style={homePrimaryButton} onClick={startNewStore}>
                  Add Store
                </button>
              ) : null}
              <Link href="/employer-dashboard" style={homeSecondaryButton} className="rn-btn-secondary">Back to Dashboard</Link>
            </div>
          </div>
        </section>

        {message ? (
          <div role="alert" style={{ ...homeCardStyle, marginBottom: 16, color: message.includes("saved") ? homeTheme.green : "#8a2f2f", fontWeight: 900 }}>
            {message}
          </div>
        ) : null}

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <div className="rn-store-filter-grid">
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Search stores
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Location, city, state, email" style={{ ...homeInputStyle, marginTop: 6 }} />
            </label>
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              State
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                <option value="all">All states</option>
                {uniqueStates.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
            <label style={{ fontWeight: 900, color: homeTheme.text }}>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StoreStatusFilter)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </section>

        <div className="rn-store-directory-grid">
          <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>Store list</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {filteredStores.length === 0 ? <p style={{ color: homeTheme.muted, fontWeight: 800 }}>No stores match these filters.</p> : null}
              {filteredStores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => { setSelectedStoreId(store.id); setIsEditing(false); }}
                  className="rn-store-list-item"
                  style={{
                    textAlign: "left",
                    border: `1px solid ${selectedStoreId === store.id ? "rgba(53,128,110,.45)" : homeTheme.border}`,
                    borderRadius: 16,
                    background: selectedStoreId === store.id ? "#dfe7e3" : "#fff",
                    padding: 16,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <strong style={{ display: "block", color: homeTheme.text, fontSize: 16 }}>{store.location_name}</strong>
                  <span style={{ display: "block", marginTop: 5, color: homeTheme.muted, fontWeight: 800 }}>{formatAddress(store)}</span>
                  <span style={{ display: "inline-flex", marginTop: 10, color: store.active ? homeTheme.green : homeTheme.muted, fontWeight: 900, fontSize: 12, textTransform: "uppercase" }}>
                    {store.active ? "Active" : "Inactive"}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section style={{ ...homeCardStyle, boxShadow: "0 12px 26px rgba(0,0,0,.08)" }}>
            {isEditing ? (
              <form onSubmit={saveStore} style={{ display: "grid", gap: 12 }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-heading)", color: homeTheme.text }}>{selectedStore ? "Edit store" : "Add store"}</h2>
                <div className="rn-store-form-grid">
                  <label style={storeFormLabelStyle}>Store/location name<input required value={form.location_name} onChange={(event) => updateForm("location_name", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Address<input value={form.address ?? ""} onChange={(event) => updateForm("address", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>City<input value={form.city ?? ""} onChange={(event) => updateForm("city", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>State<select value={form.state ?? ""} onChange={(event) => updateForm("state", event.target.value)} style={{ ...homeInputStyle, marginTop: 6, appearance: "none" }}><option value="">Select…</option>{STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
                  <label style={storeFormLabelStyle}>Candidate routing email 1<input type="email" value={form.store_email ?? ""} onChange={(event) => updateForm("store_email", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Candidate routing email 2<input type="email" value={form.ta_email ?? ""} onChange={(event) => updateForm("ta_email", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Candidate routing email 3<input type="email" value={form.gm_op_email ?? ""} onChange={(event) => updateForm("gm_op_email", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Minimum wage<input value={form.minimum_wage ?? ""} onChange={(event) => updateForm("minimum_wage", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Pay range<input value={form.pay_range ?? ""} onChange={(event) => updateForm("pay_range", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                  <label style={storeFormLabelStyle}>Default application URL<input value={form.default_application_url ?? ""} onChange={(event) => updateForm("default_application_url", event.target.value)} style={{ ...homeInputStyle, marginTop: 6 }} /></label>
                </div>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900, color: homeTheme.text }}>
                  <input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} />
                  Active store
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="submit" className="rn-btn-primary" style={homePrimaryButton} disabled={busy}>{busy ? "Saving..." : "Save Store"}</button>
                  <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={cancelEditing} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : selectedStore ? (
              <div>
                <div className="rn-store-header-row">
                  <div>
                    <p style={{ margin: 0, color: selectedStore.active ? homeTheme.green : homeTheme.muted, fontWeight: 900, fontSize: 12, textTransform: "uppercase" }}>
                      {selectedStore.active ? "Active" : "Inactive"}
                    </p>
                    <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-heading)", color: homeTheme.text }}>{selectedStore.location_name}</h2>
                  </div>
                  {canManageStores ? <button type="button" className="rn-btn-secondary" style={homeSecondaryButton} onClick={() => startEditingStore(selectedStore)}>Edit</button> : null}
                </div>
                <dl className="rn-store-detail-grid">
                  <div><dt>Full address</dt><dd>{formatAddress(selectedStore)}</dd></div>
                  <div><dt>City/State</dt><dd>{[selectedStore.city, selectedStore.state].filter(Boolean).join(", ") || "—"}</dd></div>
                  <div><dt>Candidate routing emails</dt><dd>{formatCandidateRoutingEmails(selectedStore)}</dd></div>
                  <div><dt>Minimum wage</dt><dd>{selectedStore.minimum_wage || "—"}</dd></div>
                  <div><dt>Pay range</dt><dd>{selectedStore.pay_range || "—"}</dd></div>
                  <div><dt>Default application URL</dt><dd>{selectedStore.default_application_url || "—"}</dd></div>
                </dl>
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ margin: "0 0 10px", color: homeTheme.text }}>Active jobs for this store</h3>
                  {(activeJobsByStore[selectedStore.id] ?? []).length === 0 ? (
                    <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>No active jobs are linked to this store yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {(activeJobsByStore[selectedStore.id] ?? []).map((job) => (
                        <Link key={job.id} href={`/jobs/${job.id}`} style={{ color: homeTheme.green, fontWeight: 900 }}>
                          {job.title} {[job.city, job.state].filter(Boolean).join(", ") ? `— ${[job.city, job.state].filter(Boolean).join(", ")}` : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: homeTheme.muted, fontWeight: 800 }}>Select a store to view details, or add your first store.</p>
            )}
          </section>
        </div>
      </div>

      <style jsx>{`
        .rn-store-header-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .rn-store-filter-grid,
        .rn-store-form-grid,
        .rn-store-detail-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .rn-store-directory-grid {
          display: grid;
          grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.35fr);
          gap: 16px;
          align-items: start;
        }
        .rn-store-detail-grid {
          margin: 18px 0 0;
        }
        .rn-store-detail-grid div {
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 14px;
          background: #fff;
          padding: 14px;
        }
        .rn-store-detail-grid dt {
          color: ${homeTheme.muted};
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .3px;
        }
        .rn-store-detail-grid dd {
          margin: 6px 0 0;
          color: ${homeTheme.text};
          font-weight: 850;
          overflow-wrap: anywhere;
        }
        @media (max-width: 900px) {
          .rn-store-filter-grid,
          .rn-store-form-grid,
          .rn-store-detail-grid,
          .rn-store-directory-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

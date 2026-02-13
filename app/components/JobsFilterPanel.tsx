"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
  role_category?: string | null;

  // Quick info chips
  pay_range?: string | null;
  employment_type?: string | null;
};

type DatePostedOption = "" | "24h" | "3d" | "7d" | "14d" | "30d";
type PayOption = "" | "listed";

export default function JobsFilterPanel({
  jobs,
  initialRoleCategories = [],
}: {
  jobs: Job[];
  initialRoleCategories?: string[];
}) {
  // If we arrived from Top Roles, lock results to those categories (Line/Prep, etc.)
  const lockedRoleCategories = useMemo(() => {
    return (initialRoleCategories ?? []).map((r) => String(r).trim()).filter(Boolean);
  }, [initialRoleCategories]);

  // Inputs (Indeed-ish search row, but your styling)
  const [search, setSearch] = useState("");
  const [locationText, setLocationText] = useState(""); // city/state text input (NOT dropdown)

  // Pill filters
  const [roleCategory, setRoleCategory] = useState(""); // single select
  const [employmentType, setEmploymentType] = useState(""); // single select
  const [payFilter, setPayFilter] = useState<PayOption>(""); // "" or "listed"
  const [datePosted, setDatePosted] = useState<DatePostedOption>("");

  // Menu open/close
  const [openMenu, setOpenMenu] = useState<null | "role" | "type" | "pay" | "date">(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // If locked roles change, reset role selection to "All shown roles"
    setRoleCategory("");
  }, [lockedRoleCategories.join("|")]);

  useEffect(() => {
    // Close menus when clicking outside
    function onDocMouseDown(e: MouseEvent) {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const roleCategoryOptions = useMemo(() => {
    const fromJobs = Array.from(
      new Set(
        jobs
          .map((j) => (j.role_category ?? "").trim())
          .filter(Boolean)
      )
    ).sort();

    const base = lockedRoleCategories.length ? lockedRoleCategories : fromJobs;
    return Array.from(new Set(base)).sort();
  }, [jobs, lockedRoleCategories]);

  const employmentTypeOptions = useMemo(() => {
    return Array.from(
      new Set(
        jobs
          .map((j) => (j.employment_type ?? "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [jobs]);

  const daysForDatePosted = (opt: DatePostedOption) => {
    switch (opt) {
      case "24h":
        return 1;
      case "3d":
        return 3;
      case "7d":
        return 7;
      case "14d":
        return 14;
      case "30d":
        return 30;
      default:
        return 0;
    }
  };

  const filteredJobs = useMemo(() => {
    const s = search.trim().toLowerCase();
    const loc = locationText.trim().toLowerCase();

    const now = new Date();
    const days = daysForDatePosted(datePosted);
    const cutoff = days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;

    return jobs.filter((j) => {
      const jobRole = (j.role_category ?? "").trim();
      const jobType = (j.employment_type ?? "").trim();
      const jobPay = (j.pay_range ?? "").trim();

      // Lock to top roles if applicable
      const matchesLockedRoles =
        lockedRoleCategories.length === 0 || lockedRoleCategories.includes(jobRole);

      // Role filter (single)
      const matchesRole = !roleCategory || jobRole === roleCategory;

      // Employment type filter (single)
      const matchesType = !employmentType || jobType === employmentType;

      // Pay filter
      const matchesPay = payFilter !== "listed" || !!jobPay;

      // Date posted filter
      const matchesDate =
        !cutoff || (j.created_at ? new Date(j.created_at) >= cutoff : true);

      // Location text search (city or state or "City, ST")
      const cityState = `${j.city}, ${j.state}`.toLowerCase();
      const matchesLocationText = !loc || cityState.includes(loc) || j.city.toLowerCase().includes(loc) || j.state.toLowerCase().includes(loc);

      // Main search checks multiple fields
      const matchesSearch =
        !s ||
        j.title.toLowerCase().includes(s) ||
        j.restaurant_name.toLowerCase().includes(s) ||
        j.city.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s) ||
        jobRole.toLowerCase().includes(s) ||
        jobType.toLowerCase().includes(s);

      return (
        matchesLockedRoles &&
        matchesRole &&
        matchesType &&
        matchesPay &&
        matchesDate &&
        matchesLocationText &&
        matchesSearch
      );
    });
  }, [
    jobs,
    lockedRoleCategories,
    roleCategory,
    employmentType,
    payFilter,
    datePosted,
    search,
    locationText,
  ]);

  const clearFilters = () => {
    setSearch("");
    setLocationText("");
    setRoleCategory("");
    setEmploymentType("");
    setPayFilter("");
    setDatePosted("");
    setOpenMenu(null);
  };

  // Shared styles
  const inputStyle: React.CSSProperties = {
    height: 46,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.18)",
    backgroundColor: "#fff",
    color: "#111",
    padding: "0 14px",
    outline: "none",
    fontWeight: 600,
    fontFamily: "var(--font-body)",
    boxShadow: "0 6px 14px rgba(0,0,0,.12)",
    width: "100%",
  };

  const pillButtonStyle: React.CSSProperties = {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,.14)",
    backgroundColor: "rgba(0,0,0,0.05)",
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontWeight: 800,
    color: "rgba(0,0,0,0.78)",
    whiteSpace: "nowrap",
  };

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: 44,
    left: 0,
    minWidth: 240,
    background: "#fff",
    border: "1px solid rgba(0,0,0,.14)",
    borderRadius: 12,
    boxShadow: "0 18px 40px rgba(0,0,0,.18)",
    padding: 8,
    zIndex: 50,
  };

  const menuItemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontWeight: 700,
    color: "rgba(0,0,0,0.82)",
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,.14)",
    backgroundColor: "rgba(255,255,255,0.70)",
    color: "rgba(0,0,0,.72)",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const PillMenu = ({
    id,
    label,
    activeLabel,
    children,
    isActive,
  }: {
    id: "role" | "type" | "pay" | "date";
    label: string;
    activeLabel?: string;
    children: React.ReactNode;
    isActive?: boolean;
  }) => {
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === id ? null : id))}
          style={{
            ...pillButtonStyle,
            backgroundColor: isActive ? "rgba(53,128,110,0.14)" : pillButtonStyle.backgroundColor,
            border: isActive ? "1px solid rgba(53,128,110,0.35)" : pillButtonStyle.border,
            color: isActive ? "#2d6e5f" : pillButtonStyle.color,
          }}
        >
          <span>{activeLabel ?? label}</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>▾</span>
        </button>

        {openMenu === id && <div style={menuStyle}>{children}</div>}
      </div>
    );
  };

  return (
    <div
      ref={menuWrapRef}
      style={{
        backgroundColor: "#ece9e48f",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: "22px 22px 26px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.16)",
      }}
    >
      {/* Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: "#35806e",
            fontFamily: "var(--font-heading)",
            whiteSpace: "nowrap",
          }}
        >
          Available Jobs
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
      </div>

      {/* Locked roles note */}
      {lockedRoleCategories.length > 0 && (
        <div style={{ marginBottom: 12, color: "rgba(0,0,0,.70)", fontWeight: 800 }}>
          Showing role categories: {lockedRoleCategories.join(" + ")}
        </div>
      )}

      {/* Search row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr auto",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Job title, keywords, or company"
          style={inputStyle}
          aria-label="Search jobs"
        />

        <input
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="City or State (ex: Baltimore, MD)"
          style={inputStyle}
          aria-label="Filter by city or state"
        />

        <button
          type="button"
          onClick={clearFilters}
          style={{
            height: 46,
            padding: "0 16px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,.16)",
            backgroundColor: "rgba(0,0,0,0.05)",
            color: "rgba(0,0,0,0.75)",
            fontWeight: 900,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Clear
        </button>
      </div>

      {/* Pill filters row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <PillMenu
          id="pay"
          label="Pay"
          activeLabel={payFilter === "listed" ? "Pay: listed" : undefined}
          isActive={payFilter === "listed"}
        >
          <button style={menuItemStyle} onClick={() => { setPayFilter(""); setOpenMenu(null); }}>
            Any
          </button>
          <button
            style={menuItemStyle}
            onClick={() => { setPayFilter("listed"); setOpenMenu(null); }}
          >
            Pay listed
          </button>
        </PillMenu>

        <PillMenu
          id="type"
          label="Job type"
          activeLabel={employmentType ? `Job type: ${employmentType}` : undefined}
          isActive={!!employmentType}
        >
          <button style={menuItemStyle} onClick={() => { setEmploymentType(""); setOpenMenu(null); }}>
            Any
          </button>
          {employmentTypeOptions.map((t) => (
            <button
              key={t}
              style={menuItemStyle}
              onClick={() => { setEmploymentType(t); setOpenMenu(null); }}
            >
              {t}
            </button>
          ))}
        </PillMenu>

        <PillMenu
          id="role"
          label="Role category"
          activeLabel={roleCategory ? `Role: ${roleCategory}` : undefined}
          isActive={!!roleCategory}
        >
          <button style={menuItemStyle} onClick={() => { setRoleCategory(""); setOpenMenu(null); }}>
            {lockedRoleCategories.length ? "All shown roles" : "Any"}
          </button>
          {roleCategoryOptions.map((r) => (
            <button
              key={r}
              style={menuItemStyle}
              onClick={() => { setRoleCategory(r); setOpenMenu(null); }}
            >
              {r}
            </button>
          ))}
        </PillMenu>

        <PillMenu
          id="date"
          label="Date posted"
          activeLabel={
            datePosted
              ? `Date: ${
                  datePosted === "24h" ? "Last 24 hours" :
                  datePosted === "3d" ? "Last 3 days" :
                  datePosted === "7d" ? "Last 7 days" :
                  datePosted === "14d" ? "Last 14 days" :
                  "Last 30 days"
                }`
              : undefined
          }
          isActive={!!datePosted}
        >
          <button style={menuItemStyle} onClick={() => { setDatePosted(""); setOpenMenu(null); }}>
            Any time
          </button>
          <button style={menuItemStyle} onClick={() => { setDatePosted("24h"); setOpenMenu(null); }}>
            Last 24 hours
          </button>
          <button style={menuItemStyle} onClick={() => { setDatePosted("3d"); setOpenMenu(null); }}>
            Last 3 days
          </button>
          <button style={menuItemStyle} onClick={() => { setDatePosted("7d"); setOpenMenu(null); }}>
            Last 7 days
          </button>
          <button style={menuItemStyle} onClick={() => { setDatePosted("14d"); setOpenMenu(null); }}>
            Last 14 days
          </button>
          <button style={menuItemStyle} onClick={() => { setDatePosted("30d"); setOpenMenu(null); }}>
            Last 30 days
          </button>
        </PillMenu>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 12, color: "#35806e", fontWeight: 800 }}>
        Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
      </div>

      {/* Jobs list */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 10,
          maxHeight: "min(460px, 55vh)",
          overflowY: "auto",
          overflowX: "hidden",
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      >
        {filteredJobs.length === 0 ? (
          <div style={{ padding: 16, color: "rgba(0, 0, 0, 0.75)", fontWeight: 800 }}>
            No jobs match your filters.
          </div>
        ) : (
          filteredJobs.map((job, idx) => {
            const pay = (job.pay_range ?? "").trim();
            const type = (job.employment_type ?? "").trim();
            const cat = (job.role_category ?? "").trim();

            return (
              <div
                key={job.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "14px 14px",
                  backgroundColor:
                    idx % 2 === 0 ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.05)",
                  borderTop: idx === 0 ? "none" : "1px solid rgba(0, 0, 0, 0.18)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/jobs/${job.id}`}
                    style={{
                      display: "inline-block",
                      fontWeight: 900,
                      color: "#111",
                      fontSize: 18,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {job.title}
                  </Link>

                  <div style={{ opacity: 0.85, color: "rgba(0,0,0,.75)", marginTop: 4 }}>
                    {job.restaurant_name} — {job.city}, {job.state}
                  </div>

                  {/* Quick info chips */}
                  {(pay || type || cat) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {pay && <span style={chipStyle}>{pay}</span>}
                      {type && <span style={chipStyle}>{type}</span>}
                      {cat && <span style={chipStyle}>{cat}</span>}
                    </div>
                  )}
                </div>

                <Link
                  href={`/jobs/${job.id}`}
                  style={{
                    backgroundColor: "#35806e",
                    color: "#fef5ea",
                    padding: "10px 18px",
                    borderRadius: 10,
                    fontWeight: 800,
                    textDecoration: "none",
                    boxShadow: "0 10px 22px rgba(0,0,0,.16)",
                    whiteSpace: "nowrap",
                  }}
                >
                  View →
                </Link>
              </div>
            );
          })
        )}
      </div>

      {/* Responsive: stack the search row on smaller screens */}
      <style jsx>{`
        @media (max-width: 860px) {
          div[style*="grid-template-columns: 1.6fr 1fr auto"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

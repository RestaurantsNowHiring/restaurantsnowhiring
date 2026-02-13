"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
  role_category?: string | null;
};

export default function JobsFilterPanel({
  jobs,
  initialRoleCategories = [],
}: {
  jobs: Job[];
  initialRoleCategories?: string[];
}) {
  // If we arrived from Top Roles, lock results to those categories (Line/Prep, Cashier/Server, etc.)
  const lockedRoleCategories = useMemo(() => {
    const cleaned = (initialRoleCategories ?? []).map((r) => String(r).trim()).filter(Boolean);
    return cleaned;
  }, [initialRoleCategories]);

  const [location, setLocation] = useState("");
  const [position, setPosition] = useState("");
  const [search, setSearch] = useState("");

  // Optional: allow user to further narrow within the locked set
  const [roleCategory, setRoleCategory] = useState("");

  // If the page loads with locked roles, default the dropdown to blank (meaning “all locked roles”)
  useEffect(() => {
    setRoleCategory("");
  }, [lockedRoleCategories.join("|")]);

  const locationOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => `${j.city}, ${j.state}`))).sort();
  }, [jobs]);

  const positionOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => j.title))).sort();
  }, [jobs]);

  const roleCategoryOptions = useMemo(() => {
    const fromJobs = Array.from(new Set(jobs.map((j) => (j.role_category ?? "").trim()).filter(Boolean)));
    const base = lockedRoleCategories.length ? lockedRoleCategories : fromJobs;
    return Array.from(new Set(base)).sort();
  }, [jobs, lockedRoleCategories]);

  const filteredJobs = useMemo(() => {
    const s = search.trim().toLowerCase();

    return jobs.filter((j) => {
      const loc = `${j.city}, ${j.state}`;
      const jobRole = (j.role_category ?? "").trim();

      // ✅ hard lock if coming from top roles
      const matchesLockedRoles =
        lockedRoleCategories.length === 0 || lockedRoleCategories.includes(jobRole);

      // ✅ optional additional narrowing dropdown
      const matchesRoleCategory = !roleCategory || jobRole === roleCategory;

      const matchesLocation = !location || loc === location;
      const matchesPosition = !position || j.title === position;

      const matchesSearch =
        !s ||
        j.title.toLowerCase().includes(s) ||
        j.restaurant_name.toLowerCase().includes(s) ||
        j.city.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s) ||
        jobRole.toLowerCase().includes(s);

      return (
        matchesLockedRoles &&
        matchesRoleCategory &&
        matchesLocation &&
        matchesPosition &&
        matchesSearch
      );
    });
  }, [jobs, lockedRoleCategories, roleCategory, location, position, search]);

  const clearFilters = () => {
    setLocation("");
    setPosition("");
    setSearch("");
    setRoleCategory("");
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffffc0",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 10,
        padding: "22px 22px 18px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.89)",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Panel title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.89)" }} />
        <div
          style={{
            fontSize: 40,
            fontWeight: 900,
            letterSpacing: 1.2,
            color: "rgba(0,0,0,.89)",
            fontFamily: "var(--font-coldsmith)",
          }}
        >
          AVAILABLE JOBS
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.89)" }} />
      </div>

      {/* Locked role note */}
      {lockedRoleCategories.length > 0 && (
        <div style={{ marginBottom: 12, color: "rgba(0,0,0,.75)", fontWeight: 900 }}>
          Showing role categories: {lockedRoleCategories.join(" + ")}
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1.2fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* Role Category */}
        <select
          value={roleCategory}
          onChange={(e) => setRoleCategory(e.target.value)}
          style={{
            height: 44,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,.25)",
            backgroundColor: "rgba(255,255,255,.75)",
            color: "#111",
            padding: "0 12px",
            outline: "none",
            fontWeight: 700,
          }}
          aria-label="Filter by role category"
        >
          <option value="">
            {lockedRoleCategories.length ? "All shown roles" : "Role Category"}
          </option>
          {roleCategoryOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{
            height: 44,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,.25)",
            backgroundColor: "rgba(255,255,255,.75)",
            color: "#111",
            padding: "0 12px",
            outline: "none",
            fontWeight: 700,
          }}
          aria-label="Filter by location"
        >
          <option value="">Location</option>
          {locationOptions.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          style={{
            height: 44,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,.25)",
            backgroundColor: "rgba(255,255,255,.75)",
            color: "#111",
            padding: "0 12px",
            outline: "none",
            fontWeight: 700,
          }}
          aria-label="Filter by position"
        >
          <option value="">Position</option>
          {positionOptions.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            style={{
              flex: 1,
              height: 44,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,.25)",
              backgroundColor: "rgba(255,255,255,.75)",
              color: "#111",
              padding: "0 12px",
              outline: "none",
              fontWeight: 700,
            }}
            aria-label="Search jobs"
          />

          <button
            type="button"
            onClick={clearFilters}
            style={{
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,.25)",
              backgroundColor: "rgba(0,0,0,.10)",
              color: "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Result count */}
      <div style={{ marginBottom: 12, color: "rgba(0,0,0,.75)", fontWeight: 800 }}>
        Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
      </div>

      {/* Jobs list */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {filteredJobs.length === 0 ? (
          <div style={{ padding: 16, color: "rgba(0,0,0,.75)", fontWeight: 800 }}>
            No jobs match your filters.
          </div>
        ) : (
          filteredJobs.map((job, idx) => (
            <div
              key={job.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "14px 14px",
                backgroundColor: idx % 2 === 0 ? "rgba(0,0,0,.08)" : "rgba(0,0,0,.05)",
                borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,.10)",
              }}
            >
              <div>
                <Link
                  href={`/jobs/${job.id}`}
                  style={{
                    display: "inline-block",
                    fontWeight: 900,
                    color: "#111",
                    fontSize: 16,
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  {job.title}
                </Link>

                <div style={{ opacity: 0.85, color: "rgba(0,0,0,.75)", marginTop: 4 }}>
                  {job.restaurant_name} — {job.city}, {job.state}
                  {job.role_category ? ` • ${job.role_category}` : ""}
                </div>
              </div>

              <Link
                href={`/jobs/${job.id}`}
                style={{
                  backgroundColor: "#ff7a00",
                  color: "#111",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontWeight: 900,
                  textDecoration: "none",
                  boxShadow: "0 8px 18px rgba(0,0,0,.25)",
                  whiteSpace: "nowrap",
                }}
              >
                View →
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

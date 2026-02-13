"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;

  // optional if you ever decide to pass them through
  role_category?: string | null;
  pay_range?: string | null;
  employment_type?: string | null;
};

export default function LatestJobsPanel({ jobs }: { jobs: Job[] }) {
  // Match JobsFilterPanel UX: text search + location text, plus optional dropdown
  const [search, setSearch] = useState("");
  const [locationText, setLocationText] = useState("");
  const [position, setPosition] = useState("");

  const positionOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => j.title))).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const s = search.trim().toLowerCase();
    const loc = locationText.trim().toLowerCase();

    return jobs.filter((j) => {
      const cityState = `${j.city}, ${j.state}`.toLowerCase();

      const matchesLocation =
        !loc ||
        cityState.includes(loc) ||
        j.city.toLowerCase().includes(loc) ||
        j.state.toLowerCase().includes(loc);

      const matchesPosition = !position || j.title === position;

      const matchesSearch =
        !s ||
        j.title.toLowerCase().includes(s) ||
        j.restaurant_name.toLowerCase().includes(s) ||
        j.city.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s);

      return matchesLocation && matchesPosition && matchesSearch;
    });
  }, [jobs, search, locationText, position]);

  const clearFilters = () => {
    setSearch("");
    setLocationText("");
    setPosition("");
  };

  // ---- Shared styles (copied to match JobsFilterPanel exactly) ----
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

  // (Used for the Position dropdown so it matches)
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: 38,
  };

  return (
    <div
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
          Newest Job Listings
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
      </div>

      {/* Search row (match JobsFilterPanel grid + button style) */}
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
            fontFamily: "var(--font-body)",
          }}
        >
          Clear
        </button>
      </div>

      {/* Second row: Position dropdown (optional but helpful on homepage) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ position: "relative" }}>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            style={selectStyle}
            aria-label="Filter by position"
          >
            <option value="">Position (optional)</option>
            {positionOptions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>

          {/* caret */}
          <div
            style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              opacity: 0.6,
              fontWeight: 900,
            }}
          >
            ▾
          </div>
        </div>
      </div>

      {/* Count (match JobsFilterPanel) */}
      <div style={{ marginBottom: 12, color: "#35806e", fontWeight: 800, fontFamily: "var(--font-body)" }}>
        Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
      </div>

      {/* Jobs list (match JobsFilterPanel container + row styling) */}
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
          <div style={{ padding: 16, color: "rgba(0, 0, 0, 0.75)", fontWeight: 800, fontFamily: "var(--font-body)" }}>
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

                <div style={{ opacity: 0.85, color: "rgba(0,0,0,.75)", marginTop: 4, fontFamily: "var(--font-body)" }}>
                  {job.restaurant_name} — {job.city}, {job.state}
                </div>
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
                  fontFamily: "var(--font-body)",
                }}
              >
                View →
              </Link>
            </div>
          ))
        )}
      </div>

      {/* Bottom CTA (same style direction as your site) */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <Link
          href="/jobs"
          style={{
            color: "rgba(0,0,0,.75)",
            textDecoration: "none",
            fontWeight: 900,
            fontFamily: "var(--font-body)",
            borderBottom: "1px solid rgba(0,0,0,.25)",
            paddingBottom: 2,
          }}
        >
          View all jobs
        </Link>
      </div>

      {/* Responsive: stack the search row on smaller screens (same approach) */}
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

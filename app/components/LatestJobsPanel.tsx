/* eslint-disable react-hooks/static-components */
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Job = {
  id: string;
  slug?: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at?: string;

  // chips
  pay_range?: string | null;
  employment_type?: string | null;
  role_category?: string | null;
};

type DatePostedOption = "" | "24h" | "3d" | "7d" | "14d" | "30d";

export default function LatestJobsPanel({ jobs }: { jobs: Job[] }) {
  const GREEN = "#35806e";

  // Search inputs (match Available Jobs)
  const [search, setSearch] = useState("");
  const [locationText, setLocationText] = useState("");

  // “Position” + “Date posted” pills (like your screenshot)
  const [position, setPosition] = useState<string>("");
  const [datePosted, setDatePosted] = useState<DatePostedOption>("");

  // menu open/close
  const [openMenu, setOpenMenu] = useState<null | "position" | "date">(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const positionOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => (j.title ?? "").trim()).filter(Boolean))).sort();
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
      const matchesPosition = !position || j.title === position;

      const cityState = `${j.city}, ${j.state}`.toLowerCase();
      const matchesLocationText =
        !loc || cityState.includes(loc) || j.city.toLowerCase().includes(loc) || j.state.toLowerCase().includes(loc);

      const matchesSearch =
        !s ||
        j.title.toLowerCase().includes(s) ||
        j.restaurant_name.toLowerCase().includes(s) ||
        j.city.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s) ||
        String(j.role_category ?? "").toLowerCase().includes(s) ||
        String(j.employment_type ?? "").toLowerCase().includes(s);

      const matchesDate =
        !cutoff || (j.created_at ? new Date(j.created_at) >= cutoff : true);

      return matchesPosition && matchesLocationText && matchesSearch && matchesDate;
    });
  }, [jobs, search, locationText, position, datePosted]);

  const clearFilters = () => {
    setSearch("");
    setLocationText("");
    setPosition("");
    setDatePosted("");
    setOpenMenu(null);
  };

  // shared styles (match Available Jobs)
  const inputStyle: React.CSSProperties = {
    height: 46,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.10)",
    backgroundColor: "#fff",
    color: "#111",
    padding: "0 14px",
    outline: "none",
    fontWeight: 700,
    fontFamily: "var(--font-body)",
    boxShadow: "0 8px 18px rgba(0,0,0,.05)",
    width: "100%",
  };

  const pillButtonStyle: React.CSSProperties = {
    height: 40,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,.10)",
    backgroundColor: "rgba(255,255,255,.75)",
    padding: "0 14px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontWeight: 800,
    color: "rgba(0,0,0,.75)",
    whiteSpace: "nowrap",
  };

  const menuStyle: React.CSSProperties = {
    position: "absolute",
    top: 44,
    left: 0,
    minWidth: 240,
    background: "#fff",
    border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 18,
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
    padding: 8,
    zIndex: 50,
  };

  const menuItemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 18,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontWeight: 700,
    color: "rgba(0,0,0,.75)",
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 26,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,.10)",
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
    id: "position" | "date";
    label: string;
    activeLabel?: string;
    children: React.ReactNode;
    isActive?: boolean;
  }) => {
    return (
      <div style={{ position: "relative" }}>
        <button
          className="rn-btn-pill"
          type="button"
          onClick={() => setOpenMenu((prev) => (prev === id ? null : id))}
          aria-expanded={openMenu === id}
          aria-controls={`${id}-filter-menu`}
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

        {openMenu === id && <div id={`${id}-filter-menu`} style={menuStyle}>{children}</div>}
      </div>
    );
  };

  return (
    <div
      ref={menuWrapRef}
      style={{
        backgroundColor: "#f6f5f3",
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 18,
        padding: "22px 22px 26px",
        boxShadow: "0 18px 40px rgba(0,0,0,.12)",
      }}
    >
      {/* Title (keep this; remove “Latest Jobs” header from app/page.tsx) */}
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
            fontSize: 36,
            fontWeight: 700,
            color: GREEN,
            fontFamily: "var(--font-heading)",
            whiteSpace: "nowrap",
          }}
        >
          Newest Job Listings
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0,0,0,.35)" }} />
      </div>

      {/* Search row */}
      <div
        className="rn-jobs-search-row"
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
          className="rn-btn-subtle"
          type="button"
          onClick={clearFilters}
          style={{
            height: 46,
            padding: "0 16px",
            borderRadius: 18,
            border: "1px solid rgba(0,0,0,.16)",
            backgroundColor: "rgba(255,255,255,.75)",
            color: "rgba(0,0,0,0.75)",
            fontWeight: 900,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Clear
        </button>
      </div>

      {/* Pills row (Position + Date posted) */}
      <div className="rn-jobs-pills-row" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <PillMenu
          id="position"
          label="Position"
          activeLabel={position ? `Position: ${position}` : "Position"}
          isActive={!!position}
        >
          <button
            className="rn-btn-menu" style={menuItemStyle}
            onClick={() => {
              setPosition("");
              setOpenMenu(null);
            }}
          >
            Any
          </button>
          {positionOptions.map((p) => (
            <button
              key={p}
              className="rn-btn-menu" style={menuItemStyle}
              onClick={() => {
                setPosition(p);
                setOpenMenu(null);
              }}
            >
              {p}
            </button>
          ))}
        </PillMenu>

        <PillMenu
          id="date"
          label="Date posted"
          activeLabel={
            datePosted
              ? `Date: ${
                  datePosted === "24h"
                    ? "Last 24 hours"
                    : datePosted === "3d"
                    ? "Last 3 days"
                    : datePosted === "7d"
                    ? "Last 7 days"
                    : datePosted === "14d"
                    ? "Last 14 days"
                    : "Last 30 days"
                }`
              : "Date posted"
          }
          isActive={!!datePosted}
        >
          <button
            className="rn-btn-menu" style={menuItemStyle}
            onClick={() => {
              setDatePosted("");
              setOpenMenu(null);
            }}
          >
            Any time
          </button>
          <button className="rn-btn-menu" style={menuItemStyle} onClick={() => { setDatePosted("24h"); setOpenMenu(null); }}>
            Last 24 hours
          </button>
          <button className="rn-btn-menu" style={menuItemStyle} onClick={() => { setDatePosted("3d"); setOpenMenu(null); }}>
            Last 3 days
          </button>
          <button className="rn-btn-menu" style={menuItemStyle} onClick={() => { setDatePosted("7d"); setOpenMenu(null); }}>
            Last 7 days
          </button>
          <button className="rn-btn-menu" style={menuItemStyle} onClick={() => { setDatePosted("14d"); setOpenMenu(null); }}>
            Last 14 days
          </button>
          <button className="rn-btn-menu" style={menuItemStyle} onClick={() => { setDatePosted("30d"); setOpenMenu(null); }}>
            Last 30 days
          </button>
        </PillMenu>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 12, color: GREEN, fontWeight: 800 }}>
        Showing {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
      </div>

      {/* Jobs list */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 18,
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
                className="rn-job-list-row"
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
                    href={`/jobs/${job.slug ?? job.id}`}
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

                  {/* ✅ Quick info chips (this is what you’re missing) */}
                  {(pay || type || cat) && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {pay && <span style={chipStyle}>{pay}</span>}
                      {type && <span style={chipStyle}>{type}</span>}
                      {cat && <span style={chipStyle}>{cat}</span>}
                    </div>
                  )}
                </div>

                <Link
                  href={`/jobs/${job.slug ?? job.id}`}
                  className="rn-btn-view"
                  style={{
                    backgroundColor: GREEN,
                    color: "#fef5ea",
                    padding: "10px 18px",
                    borderRadius: 18,
                    fontWeight: 700,
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

      {/* Bottom CTA */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <Link
          href="/jobs"
          style={{
            color: "rgba(0,0,0,.85)",
            textDecoration: "none",
            fontWeight: 700,
            borderBottom: "1px solid rgba(0,0,0,.35)",
            paddingBottom: 2,
          }}
        >
          View all jobs
        </Link>
      </div>

      {/* Responsive: stack search row */}
      <style jsx>{`
        @media (max-width: 860px) {
          .rn-jobs-search-row {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .rn-job-list-row {
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
          }
          .rn-job-list-row .rn-btn-view {
            width: 100%;
          }
          .rn-jobs-pills-row > div,
          .rn-jobs-pills-row button {
            width: 100%;
          }
          .rn-jobs-pills-row [id$="-filter-menu"] {
            left: 0 !important;
            min-width: 0 !important;
            width: min(100%, calc(100vw - 56px));
          }
        }
      `}</style>
    </div>
  );
}

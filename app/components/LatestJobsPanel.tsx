"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  created_at: string;
};

export default function LatestJobsPanel({ jobs }: { jobs: Job[] }) {
  const [location, setLocation] = useState("");
  const [position, setPosition] = useState("");
  const [search, setSearch] = useState("");

  const locationOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => `${j.city}, ${j.state}`))).sort();
  }, [jobs]);

  const positionOptions = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => j.title))).sort();
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const s = search.trim().toLowerCase();

    return jobs.filter((j) => {
      const loc = `${j.city}, ${j.state}`;
      const matchesLocation = !location || loc === location;
      const matchesPosition = !position || j.title === position;

      const matchesSearch =
        !s ||
        j.title.toLowerCase().includes(s) ||
        j.restaurant_name.toLowerCase().includes(s) ||
        j.city.toLowerCase().includes(s) ||
        j.state.toLowerCase().includes(s);

      return matchesLocation && matchesPosition && matchesSearch;
    });
  }, [jobs, location, position, search]);

  return (
    <div
      style={{
        backgroundColor: "#fffffffe",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 10,
        padding: "24px 22px 18px",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.89)",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ height: 1, width: 140, background: "rgba(0, 0, 0, 0.89)" }} />
        <div
          style={{
            fontSize: 45,
            fontWeight: 900,
            letterSpacing: 1.2,
            color: "rgba(0, 0, 0, 0.89)",
            fontFamily: "var(--font-coldsmith)",
          }}
        >
          NEWEST JOB LISTINGS
        </div>
        <div style={{ height: 1, width: 140, background: "rgba(0, 0, 0, 0.89)" }} />
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1.2fr",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={{
            height: 44,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.18)",
            backgroundColor: "rgba(0, 0, 0, 0.35)",
            color: "rgba(0, 0, 0, 0.9)",
            padding: "0 12px",
            outline: "none",
          }}
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
            border: "1px solid rgba(255,255,255,.18)",
            backgroundColor: "rgba(0,0,0,.35)",
            color: "rgba(0, 0, 0, 0.9)",
            padding: "0 12px",
            outline: "none",
          }}
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
              border: "1px solid rgba(255,255,255,.18)",
              backgroundColor: "rgba(0,0,0,.35)",
              color: "rgba(0, 0, 0, 0.9)",
              padding: "0 12px",
              outline: "none",
            }}
          />
          <button
            onClick={() => {
              setLocation("");
              setPosition("");
              setSearch("");
            }}
            style={{
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.18)",
              backgroundColor: "rgba(0,0,0,.35)",
              color: "rgba(0, 0, 0, 0.85)",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Jobs list */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {filteredJobs.length === 0 ? (
          <div style={{ padding: 16, color: "rgba(0,0,0,.75)", fontWeight: 700 }}>
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
                <div style={{ fontWeight: 900, color: "#111", fontSize: 16 }}>
                  {job.title}
                </div>
                <div style={{ opacity: 0.85, color: "rgba(0,0,0,.75)", marginTop: 4 }}>
                  {job.restaurant_name} — {job.city}, {job.state}
                </div>
              </div>

              <Link
                href={`/jobs/${job.id}`}
                style={{
                  backgroundColor: "#ff7b00fa",
                  color: "#111",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontWeight: 900,
                  textDecoration: "none",
                  boxShadow: "0 8px 18px rgba(0,0,0,.25)",
                  whiteSpace: "nowrap",
                  
                  fontSize: 12,
                }}
              >
                View Job →
              </Link>
            </div>
          ))
        )}
      </div>

      {/* bottom CTA */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
        <Link
          href="/jobs"
          style={{
            color: "rgba(0,0,0,.85)",
            textDecoration: "none",
            fontWeight: 800,
            borderBottom: "1px solid rgba(0,0,0,.35)",
            paddingBottom: 2,
          }}
        >
          View all jobs
        </Link>
      </div>
    </div>
  );
}

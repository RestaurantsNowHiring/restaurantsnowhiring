"use client";

import { useRef, useState } from "react";

const MAX_RESUME_SIZE_MB = 5;
const ACCEPTED_RESUME_TYPES = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(0,0,0,0.16)",
  borderRadius: 12,
  backgroundColor: "#fff",
  color: "rgba(0,0,0,0.82)",
  fontFamily: "var(--font-body)",
  fontSize: 16,
  fontWeight: 700,
  padding: "12px 14px",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 7,
  color: "rgba(0,0,0,0.72)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 900,
};

type CandidateSubmissionFormProps = {
  jobId: string;
};

export default function CandidateSubmissionForm({ jobId }: CandidateSubmissionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const formData = new FormData(event.currentTarget);
    const resume = formData.get("resume");

    if (!(resume instanceof File) || resume.size === 0) {
      setStatus("error");
      setMessage("Please upload your resume as a PDF, DOC, or DOCX file.");
      return;
    }

    if (resume.size > MAX_RESUME_SIZE_MB * 1024 * 1024) {
      setStatus("error");
      setMessage(`Resume files must be ${MAX_RESUME_SIZE_MB}MB or smaller.`);
      return;
    }

    setStatus("submitting");
    setMessage(null);

    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/candidate-submissions`, {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setStatus("error");
      setMessage(payload?.error || "We could not send your information. Please try again.");
      return;
    }

    formRef.current?.reset();
    setStatus("success");
    setMessage("Thanks — your information was sent directly to the employer.");
  }

  return (
    <section
      aria-labelledby="candidate-interest-title"
      style={{
        marginTop: 18,
        background: "linear-gradient(135deg, rgba(53,128,110,0.10), rgba(255,255,255,0.96))",
        border: "1px solid rgba(53,128,110,0.24)",
        borderRadius: 16,
        padding: 18,
      }}
    >
      <p
        style={{
          margin: "0 0 6px 0",
          color: "#35806e",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 0.45,
          textTransform: "uppercase",
        }}
      >
        Candidate Interest
      </p>
      <h2
        id="candidate-interest-title"
        style={{
          margin: 0,
          color: "#35806e",
          fontFamily: "var(--font-heading)",
          fontSize: 30,
          lineHeight: 1.15,
        }}
      >
        Interested in this job? Send your information directly to the employer.
      </h2>

      <form ref={formRef} onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }} className="rn-candidate-grid">
          <label style={labelStyle}>
            Full Name
            <input name="fullName" required maxLength={160} autoComplete="name" style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Phone Number
            <input name="phone" required maxLength={40} autoComplete="tel" style={fieldStyle} />
          </label>
          <label style={labelStyle}>
            Resume upload
            <input name="resume" type="file" required accept={ACCEPTED_RESUME_TYPES} style={{ ...fieldStyle, padding: 10 }} />
          </label>
        </div>
        <label style={labelStyle}>
          Optional Message
          <textarea
            name="message"
            maxLength={2000}
            rows={5}
            style={{ ...fieldStyle, resize: "vertical", minHeight: 110 }}
            placeholder="Share availability, experience, or any note for the employer."
          />
        </label>

        {message ? (
          <div
            role={status === "error" ? "alert" : "status"}
            style={{
              borderRadius: 12,
              border: status === "error" ? "1px solid rgba(173,67,67,0.28)" : "1px solid rgba(53,128,110,0.28)",
              backgroundColor: status === "error" ? "rgba(173,67,67,0.08)" : "rgba(53,128,110,0.10)",
              color: status === "error" ? "#8a2f2f" : "#1d5b4d",
              fontFamily: "var(--font-body)",
              fontWeight: 800,
              padding: "10px 12px",
            }}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            justifySelf: "start",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            backgroundColor: "#35806e",
            color: "#fff",
            cursor: status === "submitting" ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            fontWeight: 900,
            opacity: status === "submitting" ? 0.72 : 1,
            padding: "12px 18px",
          }}
        >
          {status === "submitting" ? "Sending..." : "Send My Information"}
        </button>
      </form>

      <style jsx>{`
        @media (max-width: 760px) {
          .rn-candidate-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 480px) {
          section {
            padding: 14px !important;
          }
          button[type="submit"] {
            justify-self: stretch !important;
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

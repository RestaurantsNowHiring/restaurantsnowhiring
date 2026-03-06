import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "../../../../../lib/supabase";
import {
  homeCardStyle,
  homePrimaryButton,
  homeSecondaryButton,
  homeTheme,
} from "../../../../styles/homepageDesignSystem";

type JobRecord = {
  id: string;
  title: string;
  restaurant_name: string | null;
  city: string | null;
  state: string | null;
  role_category: string | null;
  employment_type: string | null;
  pay_range: string | null;
  description: string | null;
  active: boolean;
  created_at: string;
};

function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function parseDescriptionSections(rawDescription: string | null) {
  const lines = (rawDescription ?? "").split("\n");
  const scheduleLine = lines.find((line) => line.startsWith("Schedule:"));
  const benefitsLine = lines.find((line) => line.startsWith("Benefits:"));

  const description = lines
    .filter((line) => !line.startsWith("Schedule:") && !line.startsWith("Benefits:"))
    .join("\n")
    .trim();

  return {
    description,
    schedule: scheduleLine?.replace("Schedule:", "").trim() ?? "",
    benefits: benefitsLine?.replace("Benefits:", "").trim() ?? "",
  };
}

function parseLocationInput(location: string) {
  const trimmed = location.trim();
  if (!trimmed) {
    return { city: null, state: null };
  }

  const [cityPart, ...rest] = trimmed.split(",");
  const city = cityPart?.trim() || null;
  const state = rest.join(",").trim() || null;

  return { city, state };
}

export default async function EmployerJobEditPage({
  params,
  searchParams,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
  searchParams?:
    | { status?: string; mode?: string }
    | Promise<{ status?: string; mode?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const jobId = resolvedParams?.id;

  const { data, error } = jobId
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,role_category,employment_type,pay_range,description,active,created_at"
        )
        .eq("id", jobId)
        .limit(1)
    : { data: null, error: null };

  const job = (data?.[0] as JobRecord | undefined) ?? undefined;
  const notFound = !jobId || !!error || !job;
  const parsedDescription = parseDescriptionSections(job?.description ?? null);
  const status = resolvedSearchParams?.status;
  const mode = resolvedSearchParams?.mode;

  async function saveJobListing(formData: FormData) {
    "use server";

    if (!jobId) {
      redirect("/employer-dashboard/jobs");
    }

    const title = String(formData.get("title") ?? "").trim();
    const roleCategory = String(formData.get("role_category") ?? "").trim();
    const employmentType = String(formData.get("employment_type") ?? "").trim();
    const pay = String(formData.get("pay_range") ?? "").trim();
    const location = String(formData.get("location") ?? "");
    const schedule = String(formData.get("schedule") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const benefits = String(formData.get("benefits") ?? "").trim();

    const { city, state } = parseLocationInput(location);
    const composedDescription = [
      description,
      schedule ? `Schedule: ${schedule}` : "",
      benefits ? `Benefits: ${benefits}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

    const payload = {
      title,
      role_category: roleCategory || null,
      employment_type: employmentType || null,
      pay_range: pay || null,
      city,
      state,
      description: composedDescription || null,
    };

    const { error: updateError } = await supabase.from("jobs").update(payload).eq("id", jobId);

    revalidatePath(`/employer-dashboard/jobs/${jobId}/edit`);
    revalidatePath(`/jobs/${jobId}`);

    if (updateError) {
      redirect(`/employer-dashboard/jobs/${jobId}/edit?status=simulated&mode=fallback`);
    }

    redirect(`/employer-dashboard/jobs/${jobId}/edit?status=saved&mode=live`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        paddingTop: 82,
        paddingBottom: 64,
        backgroundColor: homeTheme.bg,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 18px" }}>
        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          <p
            style={{
              margin: 0,
              color: homeTheme.green,
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              fontFamily: "var(--font-body)",
            }}
          >
            Employer Workspace
          </p>
          <h1
            style={{
              marginTop: 8,
              marginBottom: 8,
              fontSize: 36,
              lineHeight: 1.1,
              fontFamily: "var(--font-heading)",
              color: homeTheme.green,
            }}
          >
            Edit Job Listing
          </h1>
          <p
            style={{
              marginBottom: 0,
              color: homeTheme.muted,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
            }}
          >
            Update this listing while keeping the dashboard layout and publishing flow unchanged.
          </p>
        </section>

        <section style={{ ...homeCardStyle, marginBottom: 16 }}>
          {notFound ? (
            <>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                Job not found
              </h2>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 600 }}>
                We could not load this listing. It may have been removed or the link is incorrect.
              </p>
            </>
          ) : (
            <>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                  fontFamily: "var(--font-heading)",
                  color: homeTheme.text,
                }}
              >
                {job.title}
              </h2>
              <p style={{ marginTop: 0, color: homeTheme.muted, fontWeight: 700 }}>
                {job.restaurant_name || "Restaurant"} • {[job.city, job.state].filter(Boolean).join(", ") || "Location not set"}
              </p>

              <div
                style={{
                  border: `1px solid ${homeTheme.border}`,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: "rgba(255,255,255,0.76)",
                }}
              >
                <p style={{ margin: "0 0 8px 0", color: homeTheme.text, fontWeight: 700 }}>
                  Listing details
                </p>
                <p style={{ margin: "0 0 12px 0", color: homeTheme.muted, fontWeight: 600 }}>
                  Status: {job.active ? "Active" : "Pending / Inactive"} • Posted: {formatDate(job.created_at)}
                </p>

                <form action={saveJobListing}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Job title
                      <input
                        name="title"
                        defaultValue={job.title || ""}
                        required
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Role category
                      <input
                        name="role_category"
                        defaultValue={job.role_category || ""}
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Employment type
                      <input
                        name="employment_type"
                        defaultValue={job.employment_type || ""}
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Pay
                      <input
                        name="pay_range"
                        defaultValue={job.pay_range || ""}
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Location
                      <input
                        name="location"
                        defaultValue={[job.city, job.state].filter(Boolean).join(", ")}
                        placeholder="City, State"
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Schedule
                      <input
                        name="schedule"
                        defaultValue={parsedDescription.schedule}
                        placeholder="e.g., Weeknights and weekends"
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Description
                      <textarea
                        name="description"
                        defaultValue={parsedDescription.description}
                        rows={5}
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, resize: "vertical", fontFamily: "var(--font-body)" }}
                      />
                    </label>

                    <label style={{ color: homeTheme.text, fontWeight: 700 }}>
                      Benefits
                      <input
                        name="benefits"
                        defaultValue={parsedDescription.benefits}
                        placeholder="e.g., Health insurance, PTO"
                        style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${homeTheme.border}`, fontFamily: "var(--font-body)" }}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <button type="submit" style={homePrimaryButton} className="rn-btn-primary">
                      Save Changes
                    </button>
                    {status === "saved" ? (
                      <span style={{ color: homeTheme.green, fontWeight: 700 }}>Changes saved to database.</span>
                    ) : null}
                    {status === "simulated" ? (
                      <span style={{ color: "#7a5600", fontWeight: 700 }}>
                        Save simulated. Live update could not be completed{mode === "fallback" ? " (missing write access or unsupported schema)." : "."}
                      </span>
                    ) : null}
                  </div>
                </form>
              </div>
            </>
          )}
        </section>

        <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/employer-dashboard" style={homePrimaryButton} className="rn-btn-primary">
            Back to Dashboard
          </Link>
          {jobId ? (
            <Link href={`/jobs/${jobId}`} style={homeSecondaryButton} className="rn-btn-secondary">
              View Public Job Page
            </Link>
          ) : null}
          <Link href="/post-job" style={homeSecondaryButton} className="rn-btn-secondary">
            Post New Job
          </Link>
        </section>
      </div>
    </main>
  );
}

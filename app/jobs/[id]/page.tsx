import type { Metadata } from "next";
import Link from "next/link";
import CandidateSubmissionForm from "../../components/CandidateSubmissionForm";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import {
  isMissingApprovedAtColumnError,
  isMissingStatusColumnError,
  isMissingViewsColumnError,
  isPubliclyVisibleJob,
} from "../../../lib/jobStatus";
import { isRichTextHtml, sanitizeRichText } from "../../../lib/richText";
import {
  SITE_NAME,
  absoluteUrl,
  noIndexRobots,
  truncateMetaDescription,
} from "../../../lib/seo";
import {
  buildJobSlugBase,
  buildUniqueJobSlugMap,
  extractShortIdFromJobSlug,
  getJobPath,
  isUuidRouteParam,
} from "../../../lib/jobSlugs";

type JobRouteParams = { id?: string };

const JOB_DETAIL_FIELDS =
  "id,title,restaurant_name,city,state,description,created_at,approved_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category";

const JOB_LISTING_DAYS = 30;
const RESTAURANT_INDUSTRY = "Restaurants";

async function fetchPublicJobById(id?: string) {
  if (!id) return null;

  const result = await supabase
    .from("jobs")
    .select(JOB_DETAIL_FIELDS)
    .eq("id", id)
    .limit(1);

  if (
    isMissingStatusColumnError(result.error) ||
    isMissingApprovedAtColumnError(result.error)
  ) {
    const fallbackResult = await supabase
      .from("jobs")
      .select(
        JOB_DETAIL_FIELDS.replace(",status", "").replace(",approved_at", ""),
      )
      .eq("id", id)
      .eq("active", true)
      .limit(1);

    if (fallbackResult.error) return null;
    const fallbackJob = fallbackResult.data?.[0] as unknown as Job | undefined;
    return fallbackJob &&
      isPubliclyVisibleJob(fallbackJob.status, fallbackJob.active)
      ? fallbackJob
      : null;
  }

  if (result.error) return null;
  const job = result.data?.[0] as Job | undefined;
  return job && isPubliclyVisibleJob(job.status, job.active) ? job : null;
}

type SlugLookupJob = Pick<
  Job,
  "id" | "title" | "city" | "state" | "active" | "status"
>;

async function fetchVisibleSlugJobs() {
  const initialResult = await supabase
    .from("jobs")
    .select("id,title,city,state,active,status")
    .order("created_at", { ascending: false })
    .limit(5000);

  const result = isMissingStatusColumnError(initialResult.error)
    ? await supabase
        .from("jobs")
        .select("id,title,city,state,active")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5000)
    : initialResult;

  if (result.error) return [];
  return ((result.data ?? []) as SlugLookupJob[]).filter((job) =>
    isPubliclyVisibleJob(job.status, job.active),
  );
}

async function getCanonicalJobPath(job: Job) {
  const visibleJobs = await fetchVisibleSlugJobs();
  const slugById = buildUniqueJobSlugMap(
    visibleJobs.some((entry) => entry.id === job.id)
      ? visibleJobs
      : [...visibleJobs, job],
  );

  return getJobPath(job, slugById);
}

async function resolvePublicJobRouteParam(routeParam?: string) {
  if (!routeParam) return null;

  if (isUuidRouteParam(routeParam)) {
    const job = await fetchPublicJobById(routeParam);
    return job ? { job, canonicalPath: await getCanonicalJobPath(job) } : null;
  }

  const shortId = extractShortIdFromJobSlug(routeParam);
  if (shortId) {
    const result = await supabase
      .from("jobs")
      .select(JOB_DETAIL_FIELDS)
      .ilike("id", `${shortId}%`)
      .limit(2);

    if (!result.error) {
      const job = ((result.data ?? []) as Job[]).find((entry) =>
        isPubliclyVisibleJob(entry.status, entry.active),
      );

      if (job) return { job, canonicalPath: await getCanonicalJobPath(job) };
    }
  }

  const visibleJobs = await fetchVisibleSlugJobs();
  const baseMatches = visibleJobs.filter(
    (job) => buildJobSlugBase(job) === routeParam,
  );
  if (baseMatches.length !== 1) return null;

  const job = await fetchPublicJobById(baseMatches[0].id);
  if (!job) return null;

  const slugById = buildUniqueJobSlugMap(visibleJobs);
  return { job, canonicalPath: getJobPath(job, slugById) };
}

function formatEmploymentType(value: string | null | undefined) {
  if (!value) return undefined;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const allowed = new Set([
    "FULL_TIME",
    "PART_TIME",
    "CONTRACTOR",
    "TEMPORARY",
    "INTERN",
    "VOLUNTEER",
    "PER_DIEM",
    "OTHER",
  ]);

  if (allowed.has(normalized)) return normalized;
  if (normalized.includes("FULL")) return "FULL_TIME";
  if (normalized.includes("PART")) return "PART_TIME";
  if (normalized.includes("TEMP")) return "TEMPORARY";
  if (normalized.includes("CONTRACT")) return "CONTRACTOR";
  if (normalized.includes("INTERN")) return "INTERN";
  return undefined;
}

function parseIsoDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function getJobPostedDate(job: Pick<Job, "approved_at" | "created_at">) {
  return parseIsoDate(job.approved_at) ?? parseIsoDate(job.created_at);
}

function addDaysIso(value: string | null | undefined, days: number) {
  const baseDate = parseIsoDate(value);
  if (!baseDate) return undefined;

  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString();
}

function getValidThroughIso(job: Pick<Job, "approved_at" | "created_at">) {
  return addDaysIso(job.approved_at ?? job.created_at, JOB_LISTING_DAYS);
}

function isExpiredForGoogleJobs(job: Pick<Job, "approved_at" | "created_at">) {
  const validThrough = getValidThroughIso(job);
  if (!validThrough) return true;

  return Date.now() > new Date(validThrough).getTime();
}

function isEligibleForJobPostingSchema(job: Job) {
  return (
    job.status === "active" &&
    job.active === true &&
    !isExpiredForGoogleJobs(job)
  );
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
}

function stripUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function cleanStructuredDataText(value: string | null | undefined) {
  if (!value?.trim()) return "";

  const sanitized = isRichTextHtml(value) ? sanitizeRichText(value) : value;
  return sanitized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJobBenefits(description: string | null | undefined) {
  const cleanDescription = cleanStructuredDataText(description);
  const benefitsLine = cleanDescription
    .split(/\n+/)
    .find((line) => line.trim().toLowerCase().startsWith("benefits:"));
  const benefits = benefitsLine?.replace(/^benefits:\s*/i, "").trim();

  if (!benefits) return undefined;
  return benefits
    .split(/,|;/)
    .map((benefit) => benefit.trim())
    .filter(Boolean);
}

function parsePayAmount(value: string | undefined) {
  if (!value) return undefined;
  const match = value.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  const number = Number.parseFloat(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

function parsePayUnitText(value: string) {
  const normalized = value.toLowerCase();
  if (/\b(yr|year|annual|annually|salary)\b/.test(normalized)) return "YEAR";
  if (/\b(month|monthly)\b/.test(normalized)) return "MONTH";
  if (/\b(week|weekly)\b/.test(normalized)) return "WEEK";
  if (/\b(day|daily)\b/.test(normalized)) return "DAY";
  return "HOUR";
}

function buildBaseSalary(payRange: string | null | undefined) {
  if (!payRange?.trim()) return undefined;

  const normalized = payRange.trim();
  const parts = normalized
    .split(/\s+[–-]\s+|\s+to\s+/i)
    .map(parsePayAmount)
    .filter((amount): amount is number => amount !== undefined);
  const unitText = parsePayUnitText(normalized);

  if (parts.length >= 2) {
    return {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: Math.min(parts[0], parts[1]),
        maxValue: Math.max(parts[0], parts[1]),
        unitText,
      },
    };
  }

  const amount = parsePayAmount(normalized);
  if (amount === undefined) return undefined;

  return {
    "@type": "MonetaryAmount",
    currency: "USD",
    value: {
      "@type": "QuantitativeValue",
      value: amount,
      unitText,
    },
  };
}

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildJobMetaDescription(job: Job) {
  const location =
    job.city && job.state ? `${job.city}, ${job.state}` : "restaurant location";
  const pay = job.pay_range ? ` Pay: ${job.pay_range}.` : "";
  return truncateMetaDescription(
    `${job.restaurant_name} is hiring a ${job.title} in ${location}.${pay} View details and apply on RestaurantsNowHiring.com.`,
  );
}

function buildJobPostingSchema(job: Job, canonicalPath: string) {
  if (!isEligibleForJobPostingSchema(job)) return null;

  const jobUrl = absoluteUrl(canonicalPath);
  const locationName =
    job.city && job.state ? `${job.city}, ${job.state}` : undefined;
  const orgUrl = safeExternalUrl(job.company_website);
  const datePosted = getJobPostedDate(job)?.toISOString() ?? job.created_at;
  const validThrough = getValidThroughIso(job);
  const description =
    cleanStructuredDataText(job.description) ||
    `${job.restaurant_name} is hiring for ${job.title}${locationName ? ` in ${locationName}` : ""}.`;
  const jobBenefits = extractJobBenefits(job.description);

  return stripUndefinedValues({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "@id": `${jobUrl}#jobposting`,
    mainEntityOfPage: jobUrl,
    title: job.title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: `${job.restaurant_name} via ${SITE_NAME}`,
      value: job.id,
    },
    datePosted,
    validThrough,
    employmentType: formatEmploymentType(job.employment_type),
    baseSalary: buildBaseSalary(job.pay_range),
    // RestaurantsNowHiring.com is a restaurant hiring board; use the site-level industry only when no more specific job field exists.
    industry: RESTAURANT_INDUSTRY,
    occupationalCategory: job.role_category || undefined,
    jobBenefits: jobBenefits?.length ? jobBenefits : undefined,
    hiringOrganization: stripUndefinedValues({
      "@type": "Organization",
      name: job.restaurant_name,
      sameAs: orgUrl,
      logo: absoluteUrl("/logo-star.png"),
    }),
    jobLocation: {
      "@type": "Place",
      address: stripUndefinedValues({
        "@type": "PostalAddress",
        streetAddress: job.address || undefined,
        addressLocality: job.city || undefined,
        addressRegion: job.state || undefined,
        addressCountry: "US",
      }),
    },
    url: jobUrl,
    // Candidates can submit interest directly from each public job detail page through CandidateSubmissionForm.
    directApply: true,
  });
}

export async function generateMetadata({
  params,
}: {
  params: JobRouteParams | Promise<JobRouteParams>;
}): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
  const resolvedRoute = await resolvePublicJobRouteParam(resolvedParams?.id);
  const job = resolvedRoute?.job ?? null;

  if (!job) {
    return {
      title: "Job Not Found",
      description:
        "This restaurant job may be inactive, removed, or unavailable.",
      robots: noIndexRobots,
      alternates: {
        canonical: absoluteUrl(
          resolvedParams?.id ? `/jobs/${resolvedParams.id}` : "/jobs",
        ),
      },
    };
  }

  const location =
    job.city && job.state ? `${job.city}, ${job.state}` : "Restaurant Job";
  const title = `${job.title} at ${job.restaurant_name} - ${location}`;
  const description = buildJobMetaDescription(job);
  const url = absoluteUrl(resolvedRoute?.canonicalPath ?? getJobPath(job));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Restaurants Now Hiring",
      type: "article",
      images: [
        { url: absoluteUrl("/logo-star.png"), alt: "Restaurants Now Hiring" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/logo-star.png")],
    },
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  description: string | null;
  created_at: string;
  approved_at?: string | null;
  active: boolean;
  status?: string | null;
  pay_range: string | null;
  employment_type: string | null;
  address: string | null;
  how_to_apply: string | null;
  company_website?: string | null;
  role_category?: string | null;
  views?: number | null;
};

export default async function JobDetailsPage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const routeParam = resolvedParams?.id;
  const resolvedRoute = await resolvePublicJobRouteParam(routeParam);
  const id =
    resolvedRoute?.job.id ??
    (isUuidRouteParam(routeParam) ? routeParam : undefined);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleClient =
    serviceRoleKey && process.env.NEXT_PUBLIC_SUPABASE_URL
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  const queryVariants: Array<{
    fields: string;
    includesStatus: boolean;
    includesViews: boolean;
    includesApprovedAt: boolean;
  }> = [
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,approved_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: true,
      includesViews: true,
      includesApprovedAt: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,approved_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: true,
      includesViews: false,
      includesApprovedAt: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: true,
      includesViews: true,
      includesApprovedAt: false,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,status,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: true,
      includesViews: false,
      includesApprovedAt: false,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,approved_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: false,
      includesViews: true,
      includesApprovedAt: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,approved_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: false,
      includesViews: false,
      includesApprovedAt: true,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category,views",
      includesStatus: false,
      includesViews: true,
      includesApprovedAt: false,
    },
    {
      fields:
        "id,title,restaurant_name,city,state,description,created_at,active,pay_range,employment_type,address,how_to_apply,company_website,role_category",
      includesStatus: false,
      includesViews: false,
      includesApprovedAt: false,
    },
  ];

  let data: Array<Record<string, unknown>> | null = null;
  let error: { code?: string; message?: string } | null = null;
  let missingStatus = false;
  let missingViews = false;

  if (id) {
    for (const variant of queryVariants) {
      const result = await supabase
        .from("jobs")
        .select(variant.fields)
        .eq("id", id)
        .limit(1);

      if (!result.error) {
        data = result.data as unknown as Array<Record<string, unknown>>;
        error = null;
        missingStatus = !variant.includesStatus;
        missingViews = !variant.includesViews;
        break;
      }

      const statusMissing = isMissingStatusColumnError(result.error);
      const viewsMissing = isMissingViewsColumnError(result.error);
      const approvedAtMissing = isMissingApprovedAtColumnError(result.error);
      if (statusMissing || viewsMissing || approvedAtMissing) {
        missingStatus = missingStatus || statusMissing;
        missingViews = missingViews || viewsMissing;
        error = result.error;
        continue;
      }

      error = result.error;
      break;
    }
  }

  let job: Job | undefined = (data?.[0] as Job | undefined) ?? undefined;

  const notFound =
    !id || !!error || !job || !isPubliclyVisibleJob(job.status, job.active);

  if (
    !notFound &&
    resolvedRoute?.canonicalPath &&
    routeParam !== resolvedRoute.canonicalPath.replace(/^\/jobs\//, "")
  ) {
    redirect(resolvedRoute.canonicalPath);
  }

  if (!notFound && !missingViews && job) {
    const currentViews =
      typeof job.views === "number" && Number.isFinite(job.views)
        ? job.views
        : 0;
    const viewUpdateClient = serviceRoleClient ?? supabase;
    const { data: updatedViewData, error: updateViewsError } =
      await viewUpdateClient
        .from("jobs")
        .update({ views: currentViews + 1 })
        .eq("id", job.id)
        .select("views")
        .limit(1);

    if (isMissingViewsColumnError(updateViewsError)) {
      missingViews = true;
    }

    const updatedViews = updatedViewData?.[0]?.views;
    if (typeof updatedViews === "number" && Number.isFinite(updatedViews)) {
      job = { ...job, views: updatedViews };
    }
  }

  const locationText =
    job?.city && job?.state ? `${job.city}, ${job.state}` : "";

  const postedText = job?.created_at
    ? new Date(job.created_at).toLocaleDateString()
    : "";

  const BRAND = "#35806e";
  const INK = "rgba(0,0,0,0.82)";
  const MUTED = "rgba(0,0,0,0.62)";

  const websiteDisplay = job?.company_website
    ? job.company_website.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";

  const safeWebsiteHref =
    job?.company_website && job.company_website.trim()
      ? job.company_website.startsWith("http://") ||
        job.company_website.startsWith("https://")
        ? job.company_website
        : `https://${job.company_website}`
      : "";

  const badgeBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 38,
    padding: "0 16px",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    border: `2px solid ${BRAND}`,
    color: BRAND,
    fontSize: 14,
    fontWeight: 900,
    whiteSpace: "nowrap",
    boxShadow: "0 8px 18px rgba(0,0,0,.08)",
    letterSpacing: 0.2,
  };

  const badgeEmphasis: React.CSSProperties = {
    ...badgeBase,
    backgroundColor: BRAND,
    color: "#ffffff",
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
  };

  // ✅ clickable look (no JS). Hover handled in globals.css via className
  const websiteBadge: React.CSSProperties = {
    ...badgeBase,
    textDecoration: "none",
    cursor: "pointer",
    position: "relative",
    paddingRight: 38, // room for ↗
    outline: "none",
  };

  const websiteArrow: React.CSSProperties = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: BRAND,
    color: "#ffffff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
  };

  const buttonPrimary: React.CSSProperties = {
    backgroundColor: BRAND,
    color: "#ffffff",
    padding: "10px 18px",
    fontWeight: 800,
    borderRadius: 12,
    textDecoration: "none",
    fontSize: 16,
    fontFamily: "var(--font-body)",
    boxShadow: "0 10px 22px rgba(0,0,0,.14)",
    whiteSpace: "nowrap",
    border: "1px solid rgba(0,0,0,0.08)",
  };

  const buttonSecondary: React.CSSProperties = {
    backgroundColor: "rgba(0,0,0,0.03)",
    color: "rgba(0,0,0,0.72)",
    padding: "10px 18px",
    fontWeight: 800,
    borderRadius: 12,
    textDecoration: "none",
    fontSize: 16,
    fontFamily: "var(--font-body)",
    border: "1px solid rgba(0,0,0,0.12)",
    whiteSpace: "nowrap",
  };

  const visibleJob = job as Job;
  const canonicalPath =
    !notFound && job
      ? (resolvedRoute?.canonicalPath ?? getJobPath(visibleJob))
      : null;
  const jobPostingSchema =
    !notFound && job && canonicalPath
      ? buildJobPostingSchema(visibleJob, canonicalPath)
      : null;

  return (
    <main
      style={{
        backgroundColor: "#ffffff",
        minHeight: "100vh",
        paddingTop: 70,
        paddingBottom: 70,
      }}
    >
      {jobPostingSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(jobPostingSchema),
          }}
        />
      ) : null}
      <div
        className="rn-job-detail-container"
        style={{ maxWidth: 1200, margin: "0 auto", padding: "0 18px" }}
      >
        {/* Header row */}
        <div
          className="rn-job-detail-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginTop: 6,
          }}
        >
          <div style={{ minWidth: 260, flex: "1 1 520px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: 56,
                fontWeight: 800,
                color: BRAND,
                lineHeight: 1.05,
                fontFamily: "var(--font-heading)",
                letterSpacing: -0.3,
              }}
            >
              {notFound ? "Job Details" : visibleJob.title}
            </h1>

            <div style={{ marginTop: 10, color: INK, fontWeight: 800 }}>
              {notFound
                ? "This job may be inactive, removed, or the link is incorrect."
                : `${visibleJob.restaurant_name} — ${locationText}`}
            </div>

            {!notFound && (
              <div style={{ marginTop: 6, color: MUTED, fontWeight: 700 }}>
                Posted: {postedText}
              </div>
            )}
          </div>

          <div
            className="rn-job-detail-actions"
            style={{ display: "flex", gap: 12, alignItems: "center" }}
          >
            <Link href="/jobs" style={buttonPrimary}>
              Back to Jobs
            </Link>
            <Link href="/" style={buttonSecondary}>
              Home
            </Link>
          </div>
        </div>

        {/* Body card */}
        <div
          className="rn-job-detail-card"
          style={{
            marginTop: 22,
            backgroundColor: "rgba(0,0,0,0.02)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 16px 40px rgba(0,0,0,0.10)",
          }}
        >
          {notFound ? (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                padding: 18,
                border: "1px solid rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18, color: INK }}>
                Job not found
              </div>

              <div style={{ marginTop: 10, color: MUTED, fontWeight: 700 }}>
                This job may be inactive, removed, or the link is incorrect.
              </div>

              <div style={{ marginTop: 14, color: MUTED, fontWeight: 700 }}>
                Debug: ID ={" "}
                <span style={{ fontFamily: "monospace" }}>{String(id)}</span>
              </div>

              {error ? (
                <div style={{ marginTop: 10, color: MUTED, fontWeight: 700 }}>
                  Supabase error:{" "}
                  <span style={{ fontFamily: "monospace" }}>
                    {error.message}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* Badges row */}
              <div
                className="rn-job-detail-badges"
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "10px 10px 16px",
                }}
              >
                {visibleJob.pay_range && (
                  <span style={badgeEmphasis}>{visibleJob.pay_range}</span>
                )}

                {visibleJob.employment_type && (
                  <span style={badgeBase}>{visibleJob.employment_type}</span>
                )}

                {visibleJob.role_category && (
                  <span style={badgeBase}>{visibleJob.role_category}</span>
                )}

                {websiteDisplay && safeWebsiteHref && (
                  <a
                    href={safeWebsiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={websiteBadge}
                    className="rnhr-clickable-badge"
                    title={safeWebsiteHref}
                  >
                    {websiteDisplay}
                    <span style={websiteArrow}>↗</span>
                  </a>
                )}
              </div>

              {/* Info row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <InfoCard label="Company" value={visibleJob.restaurant_name} />
                <InfoCard
                  label="Location"
                  value={locationText || "Not listed"}
                />
                <InfoCard
                  label="Address"
                  value={visibleJob.address || "Not listed"}
                />
              </div>

              {/* Description */}
              <SectionCard title="Description">
                {visibleJob.description &&
                isRichTextHtml(visibleJob.description) ? (
                  <div
                    className="rn-job-description-content"
                    style={{
                      color: INK,
                      lineHeight: 1.8,
                      fontWeight: 650,
                      fontSize: 16,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeRichText(visibleJob.description),
                    }}
                  />
                ) : (
                  <div
                    style={{
                      color: INK,
                      lineHeight: 1.8,
                      whiteSpace: "pre-wrap",
                      fontWeight: 650,
                      fontSize: 16,
                    }}
                  >
                    {visibleJob.description || "No description provided."}
                  </div>
                )}
              </SectionCard>

              <CandidateSubmissionForm jobId={visibleJob.id} />

              {/* How to Apply */}
              <SectionCard title="How to Apply">
                <div
                  style={{
                    color: INK,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                    fontWeight: 650,
                    fontSize: 16,
                  }}
                >
                  {visibleJob.how_to_apply || "Not listed yet."}
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rn-job-description-content ul,
            .rn-job-description-content ol {
              color: inherit;
              margin: 8px 0;
              padding-left: 26px;
            }

            .rn-job-description-content ul {
              list-style: disc outside;
            }

            .rn-job-description-content ol {
              list-style: decimal outside;
            }

            .rn-job-description-content li {
              color: inherit;
              display: list-item;
              margin: 4px 0;
            }

            .rn-job-description-content li > ul,
            .rn-job-description-content li > ol {
              margin: 4px 0;
            }

            @media (max-width: 640px) {
              .rn-job-detail-header {
                display: grid !important;
                gap: 14px !important;
              }
              .rn-job-detail-header > div:first-child {
                min-width: 0 !important;
              }
              .rn-job-detail-actions {
                align-items: stretch !important;
                display: grid !important;
                grid-template-columns: 1fr 1fr;
                width: 100%;
              }
              .rn-job-detail-actions a {
                justify-content: center;
                text-align: center;
              }
              .rn-job-detail-card {
                padding: 14px !important;
              }
              .rn-job-detail-badges {
                padding-left: 0 !important;
                padding-right: 0 !important;
              }
              .rn-job-detail-badges > * {
                max-width: 100%;
                min-height: 40px;
                white-space: normal !important;
              }
            }
          `,
        }}
      />
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,0.58)",
          fontSize: 12,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontWeight: 900,
          color: "rgba(0,0,0,0.82)",
          fontSize: 18,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 16,
        padding: 18,
        backgroundColor: "#ffffff",
        marginBottom: 14,
        boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          color: "rgba(0,0,0,0.86)",
          fontSize: 20,
          fontFamily: "var(--font-body)",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

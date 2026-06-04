import type { MetadataRoute } from "next";
import { supabase } from "../lib/supabase";
import { isMissingStatusColumnError, isNonExpiredPublicJob } from "../lib/jobStatus";
import { absoluteUrl } from "../lib/seo";
import { buildUniqueJobSlugMap, getJobPath } from "../lib/jobSlugs";
import { restaurantRolePages } from "../lib/restaurantRolePages";
import {
  getStateLandingPageByCode,
  MIN_JOBS_FOR_STATE_PAGE,
} from "../lib/stateLandingPages";

type SitemapJob = {
  id: string;
  title: string;
  city: string;
  state: string;
  active: boolean;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
};

const staticRoutes = [
  "/",
  "/jobs",
  "/contact",
  "/about",
  "/pricing",
  "/terms",
  "/privacy",
];
const roleRoutes = restaurantRolePages.map((role) => `/${role.slug}`);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === "/jobs" || route === "/" ? "daily" : "monthly",
    priority: route === "/" ? 1 : route === "/jobs" ? 0.9 : 0.6,
  }));

  const roleEntries: MetadataRoute.Sitemap = roleRoutes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 0.85,
  }));

  const initialResult = await supabase
    .from("jobs")
    .select("id,title,city,state,active,status,created_at,approved_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const result = isMissingStatusColumnError(initialResult.error)
    ? await supabase
        .from("jobs")
        .select("id,title,city,state,active,created_at")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5000)
    : initialResult;

  const visibleJobs = ((result.data ?? []) as SitemapJob[]).filter((job) =>
    isNonExpiredPublicJob(job),
  );
  const slugById = buildUniqueJobSlugMap(visibleJobs);

  const jobEntries: MetadataRoute.Sitemap = visibleJobs.map((job) => ({
    url: absoluteUrl(getJobPath(job, slugById)),
    lastModified: job.created_at ? new Date(job.created_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const stateCounts = new Map<string, number>();
  for (const job of visibleJobs) {
    const code = job.state?.trim().toUpperCase();
    if (!code || !getStateLandingPageByCode(code)) continue;

    stateCounts.set(code, (stateCounts.get(code) ?? 0) + 1);
  }

  const stateEntries: MetadataRoute.Sitemap = Array.from(stateCounts.entries())
    .filter(([, count]) => count >= MIN_JOBS_FOR_STATE_PAGE)
    .map(([code]) => getStateLandingPageByCode(code))
    .filter((state): state is NonNullable<ReturnType<typeof getStateLandingPageByCode>> =>
      Boolean(state),
    )
    .map((state) => ({
      url: absoluteUrl(`/${state.slug}`),
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.85,
    }));

  return [...staticEntries, ...roleEntries, ...stateEntries, ...jobEntries];
}

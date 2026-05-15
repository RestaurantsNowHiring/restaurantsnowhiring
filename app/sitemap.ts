import type { MetadataRoute } from "next";
import { supabase } from "../lib/supabase";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "../lib/jobStatus";
import { absoluteUrl } from "../lib/seo";
import { buildUniqueJobSlugMap, getJobPath } from "../lib/jobSlugs";

type SitemapJob = {
  id: string;
  title: string;
  city: string;
  state: string;
  active: boolean;
  status?: string | null;
  created_at?: string | null;
};

const staticRoutes = ["/", "/jobs", "/contact", "/about", "/pricing", "/terms", "/privacy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: route === "/jobs" || route === "/" ? "daily" : "monthly",
    priority: route === "/" ? 1 : route === "/jobs" ? 0.9 : 0.6,
  }));

  const initialResult = await supabase
    .from("jobs")
    .select("id,title,city,state,active,status,created_at")
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
    isPubliclyVisibleJob(job.status, job.active)
  );
  const slugById = buildUniqueJobSlugMap(visibleJobs);

  const jobEntries: MetadataRoute.Sitemap = visibleJobs.map((job) => ({
    url: absoluteUrl(getJobPath(job, slugById)),
    lastModified: job.created_at ? new Date(job.created_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticEntries, ...jobEntries];
}

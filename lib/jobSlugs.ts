export type SluggableJob = {
  id: string;
  title: string;
  city: string;
  state: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_ID_PATTERN = /-([0-9a-f]{8})$/i;

export function isUuidRouteParam(value: string | null | undefined) {
  return !!value && UUID_PATTERN.test(value);
}

export function buildJobSlugBase(job: Pick<SluggableJob, "title" | "city" | "state">) {
  const source = [job.title, job.city, job.state].filter(Boolean).join(" ");
  const slug = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "restaurant-job";
}

export function getJobShortId(jobOrId: Pick<SluggableJob, "id"> | string) {
  const id = typeof jobOrId === "string" ? jobOrId : jobOrId.id;
  return id.slice(0, 8).toLowerCase();
}

export function extractShortIdFromJobSlug(value: string | null | undefined) {
  const match = value?.match(SHORT_ID_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

export function buildJobSlug(job: SluggableJob, collides = false) {
  const base = buildJobSlugBase(job);
  return collides ? `${base}-${getJobShortId(job)}` : base;
}

export function buildUniqueJobSlugMap(jobs: SluggableJob[]) {
  const baseCounts = new Map<string, number>();

  for (const job of jobs) {
    const base = buildJobSlugBase(job);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }

  return new Map(
    jobs.map((job) => {
      const base = buildJobSlugBase(job);
      return [job.id, buildJobSlug(job, (baseCounts.get(base) ?? 0) > 1)] as const;
    })
  );
}

export function getJobPath(job: SluggableJob, slugById?: Map<string, string>) {
  return `/jobs/${slugById?.get(job.id) ?? buildJobSlug(job)}`;
}

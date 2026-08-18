export const CANDIDATE_RESOURCE_CATEGORIES = [
  "Resume Help",
  "Interview Preparation",
  "What to Wear",
  "Practice Interview Questions",
  "Questions to Ask Restaurants / Employers",
] as const;

export type CandidateResourceCategory = (typeof CANDIDATE_RESOURCE_CATEGORIES)[number];
export type CandidateResourceType = "video" | "article";

export type CandidateResource = {
  id: string;
  title: string;
  category: CandidateResourceCategory;
  resource_type: CandidateResourceType;
  url: string | null;
  source: string;
  description: string | null;
  thumbnail_url: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function youtubeThumbnail(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    let id = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    if (!id && parsed.hostname.endsWith("youtube.com")) {
      const match = parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
      id = match?.[1] ?? null;
    }
    return id && /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}

export function visibleResources(resources: CandidateResource[], category = "All") {
  return resources
    .filter((resource) => resource.active && (category === "All" || resource.category === category))
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export function normalizeCandidateResourceInput(value: Record<string, unknown>) {
  const category = String(value.category ?? "");
  const resourceType = String(value.resource_type ?? "");
  const url = String(value.url ?? "").trim();
  const active = value.active === true;
  return {
    title: String(value.title ?? "").trim(),
    category,
    resource_type: resourceType,
    url: url || null,
    source: String(value.source ?? "").trim(),
    description: String(value.description ?? "").trim() || null,
    thumbnail_url: String(value.thumbnail_url ?? "").trim() || null,
    sort_order: Number.isInteger(Number(value.sort_order)) ? Number(value.sort_order) : 0,
    active,
  };
}

export function validateCandidateResourceInput(input: ReturnType<typeof normalizeCandidateResourceInput>) {
  if (!input.title) return "Title is required.";
  if (!CANDIDATE_RESOURCE_CATEGORIES.includes(input.category as CandidateResourceCategory)) return "Choose a valid category.";
  if (input.resource_type !== "video" && input.resource_type !== "article") return "Choose a valid resource type.";
  if (!input.source) return "Source is required.";
  if (input.active && !input.url) return "A URL is required before publishing.";
  for (const [label, url] of [["URL", input.url], ["Thumbnail URL", input.thumbnail_url]] as const) {
    if (url) {
      try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); }
      catch { return `${label} must be a valid HTTP or HTTPS URL.`; }
    }
  }
  return null;
}

import { supabase } from "./supabase";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "./jobStatus";

export function getCompanyName(restaurantName: string | null | undefined) {
  const name = restaurantName?.trim() ?? "";

  if (name.toLowerCase().startsWith("mission bbq")) {
    return "MISSION BBQ";
  }

  return name;
}

export function makeCompanySlug(name: string) {
  return getCompanyName(name)
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function getPublicJobs() {
  const initial = await supabase
    .from("jobs")
    .select(
      "id,title,restaurant_name,city,state,active,status,pay_range,role_category,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const result = isMissingStatusColumnError(initial.error)
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,active,pay_range,role_category,created_at"
        )
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5000)
    : initial;

  if (result.error) return [];

  return (result.data ?? []).filter((job: any) =>
    isPubliclyVisibleJob(job.status, job.active)
  );
}

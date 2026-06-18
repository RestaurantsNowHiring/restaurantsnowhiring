import { supabase } from "./supabase";
import { getSupabaseAdminClient } from "./supabaseAdmin";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "./jobStatus";

export type CompanyProfile = {
  company_short_description: string | null;
  company_description: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  headquarters: string | null;
  location_count: number | null;
  benefits_summary: string | null;
  benefits_list: string | null;
  company_cover_image_url: string | null;
  cover_image_position_x: number | null;
  cover_image_position_y: number | null;
};

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
      "id,title,restaurant_name,city,state,active,status,pay_range,role_category,created_at,employment_type"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const result = isMissingStatusColumnError(initial.error)
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,active,pay_range,role_category,created_at,employment_type"
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

export async function getCompanyProfile(companyName: string): Promise<CompanyProfile | null> {
  const brandName = getCompanyName(companyName);
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("employer_accounts")
    .select(
      "company_short_description,company_description,company_website,company_logo_url,headquarters,location_count,benefits_summary,benefits_list,company_cover_image_url,cover_image_position_x,cover_image_position_y"
    )
    .eq("restaurant_brand_name", brandName)
    .not("company_description", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Company profile lookup failed", error);
    return null;
  }

  return (data?.[0] ?? null) as CompanyProfile | null;
}

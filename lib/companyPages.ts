import { supabase } from "./supabase";
import { isMissingStatusColumnError, isPubliclyVisibleJob } from "./jobStatus";

export type CompanyProfile = {
  company_description: string | null;
  company_website: string | null;
  company_logo_url: string | null;
  headquarters: string | null;
  location_count: number | null;
  benefits_summary: string | null;
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

export async function getCompanyProfile(companyName: string) {
  const brandName = getCompanyName(companyName);

  const { data, error } = await supabase
    .from("employer_accounts")
    .select(
      "company_description,company_website,company_logo_url,headquarters,location_count,benefits_summary"
    )
    .or(
      `company_name.eq.${brandName},restaurant_brand_name.eq.${brandName},account_name.eq.${brandName}`
    )
    .limit(1)
    .maybeSingle();

  if (error) return null;

  return data;
}

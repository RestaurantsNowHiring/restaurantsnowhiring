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
};

export type PublicCompanyJob = {
  id: string;
  title: string;
  restaurant_name: string;
  city: string;
  state: string;
  active: boolean;
  status?: string | null;
  source_type?: string | null;
  pay_range?: string | null;
  role_category?: string | null;
  created_at: string;
  employment_type?: string | null;
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

export async function getPublicCompanyInventory(): Promise<PublicCompanyJob[]> {
  const initial = await supabase
    .from("jobs")
    .select(
      "id,title,restaurant_name,city,state,active,status,source_type,pay_range,role_category,created_at,employment_type"
    )
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<PublicCompanyJob[]>();

  const result = isMissingStatusColumnError(initial.error)
    ? await supabase
        .from("jobs")
        .select(
          "id,title,restaurant_name,city,state,active,source_type,pay_range,role_category,created_at,employment_type"
        )
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(5000)
        .returns<PublicCompanyJob[]>()
    : initial;

  if (result.error) return [];

  const visibleJobs = (result.data ?? []).filter((job) =>
    isPubliclyVisibleJob(job.status, job.active)
  );

  return visibleJobs.filter((job) => job.source_type === "employer");
}

export async function getCompanyProfile(companyName: string): Promise<CompanyProfile | null> {
  const brandName = getCompanyName(companyName);
  const supabaseAdmin = getSupabaseAdminClient();

  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("employer_accounts")
   .select(
  "company_short_description,company_description,company_website,company_logo_url,headquarters,location_count,benefits_summary,benefits_list,company_cover_image_url")
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

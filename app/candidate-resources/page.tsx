import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import CandidateResourcesClient from "./CandidateResourcesClient";
import type { CandidateResource } from "../../lib/candidateResources";

export const metadata: Metadata = { title: "Candidate Resources", description: "Practical resources to help restaurant job seekers prepare and apply with confidence." };
export const revalidate = 60;

async function loadResources(): Promise<CandidateResource[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const { data, error } = await createClient(url, key).from("candidate_resources").select("id,title,category,resource_type,url,source,description,thumbnail_url,sort_order,active,created_at,updated_at").eq("active", true).order("sort_order").order("title");
  if (error) { console.error("Candidate resources load failed", error); return []; }
  return (data ?? []) as CandidateResource[];
}

export default async function CandidateResourcesPage() {
  return <CandidateResourcesClient resources={await loadResources()} />;
}

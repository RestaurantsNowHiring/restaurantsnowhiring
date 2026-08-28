/**
 * Directory participation is based on listing ownership, not company_id.
 * Sourced listings retain company_id for claims and analytics without making
 * the related company a public employer.
 *
 * @param {{ source_type?: string | null }} job
 */
export function isEmployerOwnedCompanyJob(job) {
  return job.source_type === "employer";
}

/** @param {Array<{ source_type?: string | null }>} jobs */
export function getPublicCompanyJobs(jobs) {
  return jobs.filter(isEmployerOwnedCompanyJob);
}

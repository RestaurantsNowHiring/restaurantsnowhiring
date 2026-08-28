export type CompanyInventoryJob = { source_type?: string | null };

export function isEmployerOwnedCompanyJob(job: CompanyInventoryJob): boolean;
export function getPublicCompanyJobs<T extends CompanyInventoryJob>(jobs: T[]): T[];

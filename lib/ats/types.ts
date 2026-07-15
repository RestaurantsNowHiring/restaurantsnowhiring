/**
 * Shared ATS integration types.
 *
 * These provider-agnostic shapes are used by future ATS detection, parsing,
 * and sync modules. This file intentionally contains no detection logic,
 * provider registrations, API routes, UI code, or persistence mapping.
 */
export type AtsProviderKey = string;

export type DetectionConfidence = "low" | "medium" | "high";

export type AtsProvider = {
  key: AtsProviderKey;
  displayName: string;
  detect: (careersPage: CareersPage) => Promise<DetectionResult>;
  parseJobs: (careersPage: CareersPage) => Promise<ImportedJob[]>;
  syncJobs?: (careersPage: CareersPage) => Promise<ImportedJob[]>;
};

export type DetectionResult =
  | {
      matched: true;
      providerKey: AtsProviderKey;
      confidence: DetectionConfidence;
      sourceUrl: string;
      evidence: string[];
      detectedAt: string;
    }
  | {
      matched: false;
      providerKey: null;
      confidence: null;
      sourceUrl: string;
      evidence: string[];
      detectedAt: string;
    };

export type CareersPage = {
  employerAccountId?: string;
  companyName?: string;
  url: string;
  html?: string;
  fetchedAt?: string;
};

export type ImportedJob = {
  externalId: string;
  providerKey: AtsProviderKey;
  sourceUrl: string;
  title: string;
  companyName?: string;
  location?: string;
  descriptionHtml?: string;
  applyUrl: string;
  employmentType?: string;
  department?: string;
  postedAt?: string;
  updatedAt?: string;
  raw?: unknown;
};

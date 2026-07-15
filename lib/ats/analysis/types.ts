import type { DiscoveryResult } from "../discovery/types";

export type CareersPageAnalysisResult =
  | {
      stage: "discovery";
      status: "failed";
      discovery: Extract<DiscoveryResult, { status: "failed" }>;
    }
  | {
      stage: "detection";
      status: "pending";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
    };

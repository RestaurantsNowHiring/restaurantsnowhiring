import type { DiscoveryResult } from "../discovery/types";
import type { DetectionResult } from "../types";

export type CareersPageAnalysisResult =
  | {
      stage: "discovery";
      status: "failed";
      discovery: Extract<DiscoveryResult, { status: "failed" }>;
    }
  | {
      stage: "detection";
      status: "matched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: true }>;
    }
  | {
      stage: "detection";
      status: "unmatched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
    };

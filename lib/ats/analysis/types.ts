import type { DiscoveryResult } from "../discovery/types";
import type { CareersPathInspectionResult } from "../discovery/inspectCareersPath";
import type { RankedCandidateLink } from "../discovery/rankCandidateLinks";
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
      stage: "link-discovery";
      status: "no-candidates";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
      candidateLinks: [];
    }
  | {
      stage: "careers-path-inspection";
      status: "matched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
      candidateLinks: RankedCandidateLink[];
      careersPathInspection: Extract<
        CareersPathInspectionResult,
        { status: "matched" }
      >;
    }
  | {
      stage: "careers-path-inspection";
      status: "unmatched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
      candidateLinks: RankedCandidateLink[];
      careersPathInspection: Extract<
        CareersPathInspectionResult,
        { status: "unmatched" }
      >;
    };

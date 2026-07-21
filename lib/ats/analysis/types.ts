import type { DiscoveryResult } from "../discovery/types";
import type { CandidateLinkInspectionResult } from "../discovery/inspectCandidateLinks";
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
      stage: "candidate-inspection";
      status: "matched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
      candidateLinks: RankedCandidateLink[];
      candidateInspection: Extract<
        CandidateLinkInspectionResult,
        { status: "matched" }
      >;
    }
  | {
      stage: "candidate-inspection";
      status: "unmatched";
      discovery: Extract<DiscoveryResult, { status: "success" }>;
      detection: Extract<DetectionResult, { matched: false }>;
      candidateLinks: RankedCandidateLink[];
      candidateInspection: Extract<
        CandidateLinkInspectionResult,
        { status: "unmatched" }
      >;
    };

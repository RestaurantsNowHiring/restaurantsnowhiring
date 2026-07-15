# ATS Integration Plan

## Current Scope
This document describes the planned architecture for an applicant tracking system detection engine. It is intentionally planning-only:

- No API routes
- No UI
- No database changes
- No placeholder implementation code
- No ATS detection logic yet

## Recommended Folder Structure
ATS detection should live outside route handlers and UI components so it can be reused by admin tools, employer workflows, cron jobs, and future background workers.

Recommended structure:

```text
lib/
  ats/
    types.ts
    providers/
      index.ts
      greenhouse/
        provider.ts
        detector.ts
        parser.ts
        sync.ts
      workday/
        provider.ts
        detector.ts
        parser.ts
        sync.ts
    detection/
      detectCareersPage.ts
      detectionRegistry.ts
    parsing/
      normalizeImportedJob.ts
    sync/
      syncCareersPageJobs.ts
```

### Folder Responsibilities

| Path | Responsibility |
| --- | --- |
| `lib/ats/types.ts` | Shared ATS interfaces and data shapes. |
| `lib/ats/providers/` | Provider-specific modules such as Greenhouse, Workday, Lever, Ashby, or iCIMS. |
| `lib/ats/providers/index.ts` | Exports provider registrations for the registry. |
| `lib/ats/providers/<provider>/provider.ts` | Provider metadata and references to detector, parser, and future sync behavior. |
| `lib/ats/providers/<provider>/detector.ts` | Provider-specific detection rules only. |
| `lib/ats/providers/<provider>/parser.ts` | Provider-specific job parsing only. |
| `lib/ats/providers/<provider>/sync.ts` | Future provider-specific sync behavior only. |
| `lib/ats/detection/` | Provider-agnostic orchestration for running detectors. |
| `lib/ats/parsing/` | Provider-agnostic normalization helpers for imported jobs. |
| `lib/ats/sync/` | Provider-agnostic future sync orchestration. |

## Recommended Types and Interfaces
These are recommended TypeScript shapes for a future implementation. They are not implemented yet.

### ATS Provider
An ATS provider should be a self-contained module that exposes metadata plus provider-specific capabilities.

```ts
export type AtsProviderKey = "greenhouse" | "workday";

export type AtsProvider = {
  key: AtsProviderKey;
  displayName: string;
  detect: (careersPage: CareersPage) => Promise<DetectionResult>;
  parseJobs: (careersPage: CareersPage) => Promise<ImportedJob[]>;
  syncJobs?: (careersPage: CareersPage) => Promise<ImportedJob[]>;
};
```

### Detection Result
Detection should return a consistent result regardless of the provider.

```ts
export type DetectionResult = {
  providerKey: AtsProviderKey;
  matched: boolean;
  confidence: "low" | "medium" | "high";
  sourceUrl: string;
  evidence: string[];
  detectedAt: string;
};
```

Recommended rules:

- `matched` should be `true` only when the provider has enough evidence to proceed.
- `confidence` should make uncertain matches explicit.
- `evidence` should contain short, non-sensitive explanations such as matched hostnames, script URLs, meta tags, or known embed patterns.

### Careers Page
A careers page should represent the employer-owned page or ATS-hosted page being inspected.

```ts
export type CareersPage = {
  employerAccountId?: string;
  companyName?: string;
  url: string;
  html?: string;
  fetchedAt?: string;
};
```

Recommended rules:

- `url` is required because every provider needs a canonical source.
- `html` should be optional so detection can work with either pre-fetched content or provider APIs.
- `employerAccountId` should stay optional until database support is intentionally added.

### Imported Job
Imported jobs should use an internal normalized shape before any persistence step.

```ts
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
```

Recommended rules:

- `externalId`, `providerKey`, and `sourceUrl` should be the basis for duplicate detection later.
- `raw` should be available for debugging and future parser improvements, but it should not be trusted as application-ready data.
- Persistence mapping should happen after parsing and normalization, not inside provider parsers.

## How to Add a New ATS Provider
A new ATS provider should be added by creating a new provider folder and registering it with the detection registry. Existing provider folders should not need to change.

Example for Greenhouse:

```text
lib/ats/providers/greenhouse/
  provider.ts
  detector.ts
  parser.ts
  sync.ts
```

Example for Workday:

```text
lib/ats/providers/workday/
  provider.ts
  detector.ts
  parser.ts
  sync.ts
```

Recommended process:

1. Add a provider folder under `lib/ats/providers/<provider>/`.
2. Add the provider-specific detector in `detector.ts`.
3. Add the provider-specific parser in `parser.ts`.
4. Add future sync behavior in `sync.ts` only when sync is being implemented.
5. Export the provider from `provider.ts`.
6. Register the provider in the central provider registry.

The registry should be the only shared file that changes when a provider is added. Provider internals should remain isolated.

## Where Detection Logic Should Live
Detection logic should be split into two layers:

1. Provider-specific rules in `lib/ats/providers/<provider>/detector.ts`.
2. Provider-agnostic orchestration in `lib/ats/detection/detectCareersPage.ts`.

Provider detectors should know how to identify their own ATS. The orchestration layer should only know how to run registered detectors, compare confidence, and return the best result.

This keeps route handlers, UI components, and future cron jobs from owning ATS-specific logic.

## Where Parsing Logic Should Live
Parsing logic should also be split into two layers:

1. Provider-specific parsers in `lib/ats/providers/<provider>/parser.ts`.
2. Shared normalization helpers in `lib/ats/parsing/normalizeImportedJob.ts`.

Provider parsers should convert ATS-specific payloads, embedded JSON, or HTML into the shared `ImportedJob` shape. Shared normalization should handle application-wide cleanup such as trimming fields, standardizing location text, preserving source URLs, and preparing data for future persistence.

## Where Future Sync Logic Should Live
Future sync logic should live outside detection and parsing:

1. Provider-specific sync behavior in `lib/ats/providers/<provider>/sync.ts`.
2. Provider-agnostic sync orchestration in `lib/ats/sync/syncCareersPageJobs.ts`.

Sync orchestration should eventually handle:

- Fetching current remote jobs
- Parsing remote jobs into `ImportedJob`
- Comparing remote jobs with locally imported jobs
- Creating new local jobs
- Updating changed local jobs
- Pausing or expiring removed jobs
- Recording sync metadata and errors

Database writes should be introduced only in a future database-focused task.

## Why This Scales Well
This architecture scales because every provider owns its own detection, parsing, and future sync behavior. Adding Workday should not require changing Greenhouse. Adding Lever should not require changing Workday. The shared orchestration only depends on common interfaces.

Benefits:

- Providers are isolated and easier to test.
- Detection can run before parsing or sync exists.
- Parsing can evolve without changing detection.
- Sync can be added later without redesigning provider modules.
- API routes and UI can call stable library functions instead of duplicating provider logic.
- Database mapping can be introduced later as a separate persistence layer.

## Future Extension Points
Planned extension points include:

- Additional ATS providers such as Lever, Ashby, iCIMS, SmartRecruiters, JazzHR, and BambooHR
- Confidence scoring rules for ambiguous careers pages
- Provider-specific API clients
- HTML fetching and caching helpers
- Job normalization helpers for restaurant-specific roles and locations
- Duplicate detection using `providerKey`, `externalId`, and `sourceUrl`
- Sync scheduling through Vercel cron or a background worker
- Sync logs and employer-facing import history
- Admin review workflows for imported jobs
- Error reporting for failed detection, parsing, and sync attempts
- Tests with provider-specific fixture pages and payloads

## Phase 1 - Planning and Architecture
- [x] Document recommended ATS detection architecture
- [x] Define proposed shared types
- [x] Separate detection, parsing, and future sync responsibilities
- [ ] Implement shared ATS types
- [ ] Implement detection registry
- [ ] Implement first provider detector

## Phase 2 - Detection MVP
- [ ] Research supported ATS providers
- [ ] Add provider fixtures
- [ ] Build provider-specific detectors
- [ ] Add tests for detection confidence

## Phase 3 - Import MVP
- [ ] Design database schema
- [ ] Build ATS preview API
- [ ] Import jobs into RNH
- [ ] Handle duplicate jobs
- [ ] Test import

## Phase 4 - Sync
- [ ] Automatic scheduled syncing
- [ ] Update changed jobs
- [ ] Pause removed jobs
- [ ] Sync logging
- [ ] Employer sync history

## Phase 5 - Expansion
- [ ] Multiple ATS providers
- [ ] ATS analytics
- [ ] Employer notifications

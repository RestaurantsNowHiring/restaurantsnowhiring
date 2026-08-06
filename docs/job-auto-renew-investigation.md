# Job auto-renew investigation and implementation plan

**Investigation baseline:** commit `303683a07e3293017df0f2e2b7e6b0faeede944f` on branch `auto-renew` (investigated 2026-08-06).
**Scope:** repository-grounded investigation and planning only. No application, billing, cron, email, UI, legal-copy, or database behavior is changed by this document.

## Executive summary

The application currently has **two independent 30-day concepts**:

1. Stripe Checkout creates one employer-level, quantity-based **recurring subscription** with a 30-day free trial. Its quantity is the number of jobs where `status='active' AND active=true` (`app/api/stripe/checkout/route.ts`, `lib/billing.ts`). The `$9` amount and billing interval are copy/configuration assumptions; the repository supplies `STRIPE_PRICE_ID`, not an amount or recurring interval.
2. Each approved job receives `expires_at = approval time + 30 UTC calendar days`. A daily cron emails reminders, changes expired active jobs to paused, and then reduces the Stripe subscription quantity (`lib/jobListingDuration.ts`, `app/api/cron/pause-expired-jobs/route.ts`, `supabase/migrations/202607130001_job_expires_at.sql`).

Thus recurring billing already exists at the **employer subscription/seat quantity** level, while automatic renewal of a job's listing window does not. Manual “Renew” resets `expires_at` to now + 30 days and reactivates the job, but does not create a one-off PaymentIntent or invoice. Replacing auto-pause with paid auto-renew must first resolve how per-job renewal dates are meant to align with Stripe's employer-level subscription cycle. Simply extending `expires_at` and leaving the existing subscription active is not proof that the specific job's renewal was successfully paid.

## 1. Current job lifecycle

### Canonical state model and columns

The repository does not contain a complete base `jobs` table definition, so nullability/defaults for historical columns that are not added by checked-in SQL must be verified against the deployed Supabase schema before implementation.

| Field | Meaning and actual reads/writes |
|---|---|
| `jobs.status` | Application union: `active`, `paused`, `pending`, `draft`, `archived`, `rejected` (`lib/jobStatus.ts`). New manual and ATS jobs write `pending`. Approval and resume/renew write `active`; manual/automatic pause writes `paused`; rejection writes `rejected`; an ATS disappearance writes `archived`. Public visibility requires `active` status. |
| `jobs.active` | Redundant visibility/billing boolean. New jobs write `false`; approval/resume/renew write `true`; pause/reject/ATS close write `false`. Public and billable jobs require both `status='active'` and `active=true`. In legacy missing-`status` fallbacks, `active` alone can determine visibility/status. |
| `jobs.created_at` | Insert timestamp supplied by the database; displayed as posted date and selected by lifecycle/email queries. It does not start the listing period. |
| `jobs.approved_at` | Approval timestamp. Admin approval sets it to now; initial `expires_at` is based on it. ATS synchronization uses its presence to decide whether a returning ATS job can reactivate directly or must return to pending review. |
| `jobs.expires_at` | Nullable `timestamptz`, indexed. Initial approval sets approval + 30 days; manual renew sets now + 30 days; pause/resume leave it unchanged. Public-listing selectors require it to be non-null and in the future. The expiration RPC selects it at/before database `now()`. |
| `jobs.employer_user_id`, `employer_email`, `employer_account_id` | Ownership, access, billing owner/counting, and notification routing. Account-based counting is preferred when an account ID is passed; several lifecycle sync calls pass only owner ID/email, an important multi-account audit point. |
| `jobs.posted_by_user_id`, `posted_by_email` | Original submitter identity and expiration-recipient fallback. |
| `jobs.source_type` | Checked `manual`/`ats`, default `manual`. Determines ATS provenance and special inactive-reason writes, but does **not** exempt a job from billing or expiration. |
| `jobs.ats_provider`, `ats_external_job_id` | Durable provider identity; unique per account/provider/external ID for ATS rows. |
| `jobs.ats_source_url`, `ats_apply_url`, `ats_last_synced_at`, `ats_remote_updated_at` | ATS source/apply URLs and sync timestamps; sync refreshes these independently of listing expiration. |
| `jobs.ats_inactive_reason` | Nullable checked value: `closed_in_ats`, `employer_deactivated`, `admin_rejected`, `connection_unavailable`, or `review_required`. Employer pause sets `employer_deactivated`, resume/renew clears it, rejection sets `admin_rejected`, and an ATS disappearance sets `closed_in_ats`. Auto-pause does not set a reason. |
| candidate routing fields | `apply_email`, `candidate_notification_email`, `candidate_notification_emails`, and `candidate_notification_routing` affect expiration recipients, not lifecycle or billing. |

Dashboard-only `Expired` is **not persisted**. `dashboardStatusForJob` derives it when a persisted `active` or `paused` job has `expires_at <= now`; an active job can therefore display “Expired” before the daily cron persists `paused`. Public selectors independently suppress an active-but-expired job immediately (`lib/jobStatus.ts`). Admin status has no `Expired` representation.

### Creation and free trial

1. Employer onboarding confirms email and redirects to `/post-job` (`app/employer-welcome/page.tsx`). The post form calls `/api/billing/status`; missing/inactive billing blocks insertion and directs the owner to start/reactivate billing (`app/post-job/page.tsx`).
2. Stripe Checkout creates/reuses a customer and starts a subscription with `trial_period_days: 30`, collecting a payment method even though checkout copy says no charge today (`app/api/stripe/checkout/route.ts`). The trial is account/subscription-wide, not stored per job.
3. Manual creation writes the canonical payload with `active=false`, `status='pending'`, owner/account/poster and notification fields; it does not set `approved_at` or `expires_at` (`lib/jobPersistence.ts`, `app/post-job/page.tsx`). The database billing trigger also checks billing on inserts when installed (`supabase/policies/employer-billing.sql`).
4. ATS import uses the same canonical pending/private payload plus provenance fields. Existing ATS imports update managed content only and retain status/dates (`lib/ats/import/importPreparedJobs.ts`).

There is no “free job” flag or job-level trial. A job may be approved during an employer's subscription trial, and all approved active jobs count toward subscription quantity even while Stripe status is `trialing`.

### Approval, rejection, and paid/active state

* Admin approval requires `employer_user_id` and billing access (`active`/`trialing` Stripe status or a future local `trial_ends_at`). It writes `active=true`, `status='active'`, `approved_at=now`, and `expires_at=approved_at+30 days`, then best-effort syncs Stripe quantity (`app/api/admin/jobs/[id]/approve/route.ts`). Legacy fallbacks can approve without writing the date/status if columns are absent.
* Admin rejection writes `active=false`, `status='rejected'`, adds `admin_rejected` for ATS, validates the persisted status, and best-effort syncs quantity (`app/api/admin/jobs/[id]/reject/route.ts`). No rejection reason/date is stored here.
* A job is publicly visible only while status/active are both active and `expires_at` is future. Billable counting checks only status/active and does **not** check approval, `expires_at`, source type, or trial state (`lib/billing.ts`). Therefore an expired row remains counted between its exact expiry and the cron pause, even though public selectors hide it.

### Expiration and automatic pause

* Listing duration is exactly `setUTCDate(+30)` from approval or manual-renew time, preserving time-of-day (`lib/jobListingDuration.ts`). This is 30 UTC calendar days, not “end of day,” and can differ from Stripe monthly recurrence.
* At the exact timestamp, public selectors hide the job and the dashboard derives `Expired`; no synchronous write or charge occurs.
* Daily cron later invokes `pause_expired_job_ads()`, which atomically updates every `status='active' AND active=true AND expires_at<=now()` row to `active=false,status='paused'`. It neither deletes nor changes `expires_at`, `approved_at`, or ATS reason. The route then sends auto-pause notices and best-effort resynchronizes each collected owner's Stripe quantity.

### Manual pause, resume, renew, delete/cancel

* Authenticated users with `canManageJobs` and job access may pause/resume/renew through server routes. Pause writes `active=false,status='paused'`; resume writes `active=true,status='active'` only if the existing expiration remains future; renew writes active status and `expires_at=now+30 days`. ATS pause/resume/renew respectively set/clear `ats_inactive_reason` (`app/api/employer/jobs/[id]/actions.ts`).
* Resume and renew require billing access but neither makes a discrete Stripe charge. Every action performs a best-effort subscription-quantity sync **after** the database update; failure returns success plus a warning, leaving job and Stripe potentially inconsistent.
* Bulk actions call the single-job endpoints sequentially. Bulk renewal can partially succeed. Bulk deletion is a direct client-side Supabase hard delete filtered by ownership, followed by asynchronous quantity sync (`app/employer-dashboard/page.tsx`). There is no job-level cancellation record, soft-delete flag, refund, or credit for unused days.
* “Cancel billing” is not an application endpoint. Account owners enter Stripe Billing Portal; cancellation behavior and timing depend on external portal configuration. A `customer.subscription.deleted` webhook marks local billing canceled but does not pause/delete jobs.

### ATS-managed lifecycle

* Imported jobs start pending and require the same admin approval and billing gate as manual jobs. They have no billing exemption.
* Daily ATS sync (`0 12 * * *` UTC) updates content. Missing remote jobs become `archived`/inactive with `closed_in_ats`. If they return, only `closed_in_ats` rows reopen: approved rows become active immediately; never-approved rows return pending. Reopening does not change `expires_at`, does not verify billing, and does not synchronize Stripe quantity, so an approved expired ATS job can be made `active` with a stale past expiration while remaining publicly hidden (`lib/ats/sync/syncEmployerAtsConnection.ts`). Employer/admin intentional inactive reasons are preserved.
* The general expiration cron includes ATS rows and changes them to plain `paused` without recording an ATS inactive reason. Future design must define precedence between auto-renew, ATS closure, employer pause, rejection, and connection failures.

### MISSION BBQ

The only MISSION BBQ-specific code normalizes company display names (`lib/companyPages.ts`). There is no billing, trial, approval, expiration, ATS, or renewal exception in the repository. Any exemption is either external/unimplemented and must not be inferred.

## 2. Billing trace

### Current model and `$9` behavior

* Billing is one Stripe **subscription per employer billing owner**, using `STRIPE_PRICE_ID`, with quantity equal to active/status-active jobs. Checkout starts at `max(active count, 1)` and a webhook immediately resyncs actual quantity. The configured Stripe Price determines the real currency, `$9` amount, and interval; none is validated in code.
* Checkout sets a 30-day subscription trial and `payment_method_collection='always'`. Payment therefore occurs according to Stripe's recurring invoice lifecycle after trial and each configured price interval, not when a job is approved, manually renewed, or reaches its own `expires_at`.
* Quantity changes use `proration_behavior='none'`. Adding/removing an active job changes future subscription quantity without immediate proration. Consequently repository copy describing each approval/renewal as its own paid “30-day listing” is not a faithful transaction ledger.
* There is no existing renewal worker, renewal charge, PaymentIntent, Invoice Item, per-job subscription item, or renewal audit record. Stripe itself renews the employer subscription; the job cron expires jobs instead of renewing them.

### Stored methods and off-session capability

Checkout requires a payment method for a subscription/customer, and the Billing Portal can manage the customer. Stripe subscriptions ordinarily attempt invoice payment without the employer present, so the existing integration is operationally capable of Stripe-managed off-session subscription collection. However, the repository does not read/store a payment-method ID, inspect `invoice_settings.default_payment_method`, create off-session PaymentIntents, or handle authentication-required outcomes. A future discrete per-job charge cannot assume off-session consent/capability solely from the customer/subscription IDs.

### Local billing data

`employer_billing` stores `user_id` (PK), `email`, unique `stripe_customer_id`, unique `stripe_subscription_id`, `billing_status`, `trial_started_at`, `trial_ends_at`, `subscription_current_period_end`, timestamps, and later-used `employer_account_id`. Reads are owner-scoped; server/service-role routes write. Access is allowed for `active`/`trialing` status, or (even with another status) a local future trial end.

### Webhooks, failure handling, and idempotency

Handled events are:

| Stripe event | Behavior |
|---|---|
| `checkout.session.completed` | Fetch subscription, upsert local record, sync quantity. |
| `customer.subscription.created/updated` | Upsert status/trial/period, sync quantity unless canceled. |
| `customer.subscription.deleted` | Upsert status `canceled`; jobs are unchanged. |
| `invoice.payment_failed` | Set local `billing_status='past_due'`; jobs are unchanged and no email is sent by application code. |

Webhook signatures use HMAC SHA-256, timing-safe comparison, and a five-minute timestamp tolerance. There is **no Stripe event table or event-ID deduplication**. Upserts and setting a quantity to an absolute count are mostly repeat-safe, but duplicate/out-of-order subscription events can overwrite newer state and repeated side effects remain possible. The Stripe request helper supplies no idempotency key. `invoice.paid`, `invoice.payment_succeeded`, `payment_intent.*`, `charge.refunded`, disputes, authentication-required invoices, and checkout expiration are not handled.

Failures in checkout/webhook return errors (allowing Stripe retry for webhook 5xx). Quantity sync failures after lifecycle changes are logged/best-effort. A failed invoice only changes local status; there is no grace period, retry scheduler, job pause, employer notification, or local failure reason/date. Stripe's retry/dunning behavior is external configuration.

### Refunds and cancellation

No refund API, refund webhook, credit/proration calculation, or per-job cancellation exists. Terms say fees generally are non-refundable. Billing Portal configuration controls payment method updates and cancellation; this repository neither specifies `cancel_at_period_end` nor records it. Subscription deletion does not deactivate jobs, while later posting/activation gates will reject canceled/past-due billing.

### Special populations

* **MISSION BBQ:** no exception.
* **ATS imports:** same pending/approval gate and active-job quantity counting as manual jobs; no separate billing handling. ATS automatic close/reopen does not explicitly quantity-sync.
* **Free/trial jobs:** no job flag. Trial is employer subscription-wide; quantity is still tracked.

## 3. Cron and background-task inventory

| Task | Cadence/auth | Lifecycle, dates, billing, and email effects |
|---|---|---|
| `app/api/cron/pause-expired-jobs/route.ts` configured in `vercel.json` | Daily at `19:30 UTC`; GET or POST; requires `CRON_SECRET` through bearer, header, or query parameter. | Selects active jobs whose expiration falls on the UTC date five days ahead and one day ahead; sends reminders; snapshots already-expired active jobs; calls the pause RPC; sends auto-pause email for the snapshot; best-effort syncs Stripe quantity by distinct `employer_user_id`. Does not update dates. |
| `public.pause_expired_job_ads()` in `supabase/migrations/202607130001_job_expires_at.sql` and duplicated in `supabase/policies/job-expiration.sql` | Called by the route. Policy file also documents an optional, currently commented `08:15 UTC` pg_cron schedule which must not be enabled alongside the route without deliberate design. | Bulk/atomic update to paused/inactive. Repeat calls affect zero already-paused rows. No charging/email. |
| `app/api/cron/ats-sync/route.ts` configured in `vercel.json` | Daily at `12:00 UTC`, cron-secret protected. | Synchronizes ATS connections; may archive closed jobs or reopen returned jobs, and sends ATS sync-failure notifications under a separate flow. It does not renew expiration or explicitly sync billing quantity. |

Because the expiration route's reminder selection is by entire **UTC date**, the email can be almost six calendar days or less than five exact 24-hour periods before `expires_at`. The pause occurs up to roughly 24 hours after exact expiry, although public visibility stops at exact expiry. Both a Vercel schedule and optional database schedule are documented, presenting a deployment audit requirement.

## 4. Relevant email inventory

Only the expiration family is implemented by application code for the requested topics (`lib/jobExpirationEmails.ts`). No application email exists for renewal success/upcoming auto-renew, payment failure, receipt, trial ending, or billing cancellation. Stripe may send receipts, failed-payment, and trial emails if configured in Stripe, but that is not repository-verifiable and must be audited in the Stripe Dashboard.

| Email | Subject | Trigger/cadence | Recipients | Template and links | Duplicate suppression |
|---|---|---|---|---|---|
| Five-day reminder | `Your job ad expires in 5 days: {jobTitle}` | Daily cron; active jobs with `expires_at` anywhere in UTC date +5. | Deduplicated valid addresses from active account owners, candidate-routing destinations, and original poster. Routing can include custom job email, apply email, employer email, or poster email. | Inline HTML/text in `lib/jobExpirationEmails.ts`; says job will auto-pause and only active approved ads are billable; links to `/employer-dashboard` (“Manage This Job”). | Pre-send lookup and post-send insert into `job_expiration_email_events`, unique `(job_id, reminder_type)`. |
| One-day reminder | `Your job ad expires tomorrow: {jobTitle}` | Same, UTC date +1. | Same. | Same template; auto-pause-tomorrow intro and dashboard link. | Same. |
| Auto-pause notice | `Your job ad was auto-paused: {jobTitle}` | After pause RPC for the pre-RPC snapshot of expired active jobs. | Same. | Says 30-day active window ended; dashboard link label “Reactivate or Manage Jobs.” | Same. |

Important weaknesses:

* The event is recorded **after** Resend succeeds. Concurrent cron executions can both pass the lookup and both send; the unique insert suppresses only the second record, not the second email.
* Uniqueness is lifetime per job/type. Manual renew does not clear or cycle the event rows, so the renewed listing will never receive those reminder types again.
* The auto-pause snapshot may differ from rows actually changed by the RPC during concurrency, yet all snapshot rows can receive an auto-pause notice.
* One Resend request sends to all resolved recipients. Address normalization/deduplication happens within a job, not across jobs; an employer can receive many messages per run.
* Missing recipients are skipped; individual send failures are logged and do not fail the cron. The default From address is used unless `EXPIRATION_REMINDER_FROM` or contact From is configured.

Other email code inspected but out of scope for renewal content: Supabase confirmation/recovery/invite templates; team invitation mail; candidate-submission notifications; contact notifications; password reset; and ATS sync-failure notification. None currently mentions job renewal billing.

## 5. Employer/public copy inventory for future updates

The following are the files that contain relevant product assertions or surfaces and should be reviewed in the copy phase. Generic UI uses of “Cancel” (closing modals), search filters saying “Last 30 days,” password/invite expiration, and stream `pause()` calls are false positives and do not need auto-renew copy changes.

| Surface | File(s) | Current assertion / future work |
|---|---|---|
| Pricing + FAQ | `app/pricing/page.tsx` | Metadata and cards promise 30-day trial, `$9 per approved job ad every 30 days`, cancel/pause anytime, jobs auto-expire, no unintended renewals, no proration/refund. This is the primary contradictory FAQ and pricing surface. |
| Terms | `app/terms/page.tsx` | Section 9 already allows subscriptions/posts to renew based on presented checkout terms and discusses cancellation/refunds, but requires counsel-reviewed explicit job auto-renew disclosures, timing, authorization, failure, and opt-out behavior. |
| About | `app/about/page.tsx` | Search found no lifecycle/billing keyword copy. Still perform a final product review; no known text currently requires a change. |
| Checkout | `app/api/stripe/checkout/route.ts` and Stripe-hosted Product/Price/Checkout/Portal settings | Code creates recurring trial subscription and redirects only. Stripe-hosted price/consent text is external and must be inventoried before launch. |
| Employer dashboard | `app/employer-dashboard/page.tsx` | Billing card, trial/subscription/next-date labels, expiration column/status, pause confirmations, single/bulk renew actions, success/errors, and “expiration continues while paused” text all require redesign. |
| Posting/onboarding | `app/post-job/page.tsx`, `app/employer-welcome/page.tsx`, `app/employer-login/page.tsx` | Post flow states trial ended/start trial/no charge today and billing prerequisites. Welcome has no pricing claim. Login mentions billing generally. Add consent/disclosure only after decisions. |
| Public marketing | `app/[roleSlug]/page.tsx` | Employer CTA says `$9 per active approved public job ad every 30 days after free trial`. |
| Transactional email | `lib/jobExpirationEmails.ts` | All three subjects/body/link labels are built around expiration and auto-pause. Must be replaced/versioned, not silently repurposed. |
| Marketing email | No repository file found | No marketing-email campaign/template containing the requested terms was found. Audit external email provider/campaign system. |
| Developer/product docs | `docs/CODEBASE_GUIDE.md`, `docs/DEVELOPER_MANUAL.md`, `supabase/policies/job-expiration.sql`, `supabase/migrations/202607130001_job_expires_at.sql` | Describe trial, recurring `$9`, expiration, reminder, and pause behavior; update after code/migration rollout, while retaining historical migration truth. |
| SEO/public job pages | `app/sitemap.ts`, `app/page.tsx`, `app/jobs/page.tsx`, `app/jobs/[id]/page.tsx`, `app/[roleSlug]/page.tsx`, `lib/companyPages.ts`, `lib/jobStatus.ts` | These read/filter `expires_at`. They may need lifecycle semantics changes even where no employer-facing auto-pause prose exists. |

No standalone FAQ route/file was found; the relevant FAQ is embedded in `app/pricing/page.tsx`. No repository copy promises a MISSION BBQ exemption.

## 6. Database impact and smallest recommended schema

### What can be reused

Keep `status`, `active`, `approved_at`, and `expires_at`. For the intended model, reinterpret `expires_at` as the paid-through/end of current listing term and advance it only after authoritative payment entitlement is established. Reuse employer-level Stripe IDs/status/trial fields for account billing access, but do not treat `subscription_current_period_end` as every job's renewal date because jobs can be approved at different times.

### Minimum job fields

Subject to owner decisions, the smallest safe addition is:

| Proposed field | Reason |
|---|---|
| `jobs.auto_renew_enabled boolean not null` | Durable, auditable per-job employer intent. The migration default/backfill must be an explicit product/legal decision; do not silently default existing jobs on. |
| `jobs.auto_renew_disabled_at timestamptz null` | Records opt-out timing for support/dispute evidence. Optional only if an immutable event ledger records it instead. |

Do **not** add `next_renewal_at` initially: it duplicates `expires_at`. Do **not** add `last_renewed_at`: derive the latest successful renewal from an append-only attempt/event record. Do **not** freeze `renewal_price_cents` on `jobs` unless product promises price grandfathering; record the actual price/currency per attempt instead. Do **not** store an unconstrained free-text `renewal_payment_status` on jobs; it loses history and creates synchronization ambiguity.

### Required renewal-attempt ledger

Reliable paid renewal needs more than job flags. Add one append-only `job_renewal_attempts` (or `job_listing_periods`) table:

* `id uuid` primary key; `job_id uuid` FK; `employer_account_id uuid`; `scheduled_for timestamptz`; `period_start`, `period_end` timestamps;
* constrained `status` (for example `pending`, `processing`, `succeeded`, `failed`, `canceled`);
* `amount_cents integer`, `currency text`, and Stripe identifiers appropriate to the approved billing design (`invoice_id`, `invoice_line_item_id`, `payment_intent_id`, or subscription/period reference);
* `idempotency_key text unique`, `stripe_event_id text`, `attempt_count integer`, `failure_code`, `failure_reason`, `last_attempted_at`, `succeeded_at`, and timestamps;
* unique business constraint such as `(job_id, scheduled_for)` (or a stable listing-period number) so cron retries cannot create a second renewal.

If the existing quantity-subscription invoice is declared sufficient payment, this table should still record the job entitlement and the Stripe invoice/period that funded it; otherwise there is no defensible mapping from a paid invoice to a renewed job.

### Conditional fields

* `grace_period_ends_at` belongs on the attempt/entitlement unless the approved design needs a fast current-state job column.
* A current `renewal_failure_reason` on `jobs` is denormalized and potentially sensitive; derive from latest attempt.
* `next_renewal_at` becomes justified only if renewal timing intentionally differs from `expires_at` (e.g., pre-charge several days early).
* Add a Stripe webhook event table with unique `event_id` (or include events in a general payment-event ledger) for ordered/idempotent processing.

This is the smallest **safe** schema: two job preference columns plus an attempt ledger; one boolean alone is insufficient for paid, retryable, supportable renewal.

## 7. Open product/legal/operations decisions (owner approval required)

1. Is auto-renew opt-in or opt-out, and what explicit consent language/checkpoint is required?
2. What is the default for new jobs? What happens to existing active, paused, expired, trial, and pending jobs? No grandfathering policy exists.
3. Is renewal controlled per job, account-wide, or both? Which roles may change it—account owner only, or any `canManageJobs` user?
4. Does manual pause disable future auto-renew, merely stop billing while paused, or preserve the setting? Are unused days forfeited as today?
5. What exact event is “paid renewal”: an employer subscription invoice, quantity at invoice finalization, a separate per-job invoice/PaymentIntent, or a dedicated subscription item?
6. How should staggered job `expires_at` dates align with one employer subscription billing anchor and `proration_behavior='none'`?
7. Is price always current `STRIPE_PRICE_ID`, or is `$9` grandfathered per listing? Currency/tax handling?
8. Trial behavior: should jobs renew during trial without charge, align to trial end, or begin their first paid term only after a successful invoice?
9. When should renewal be attempted relative to `expires_at`, and which timezone/date is disclosed?
10. What retry cadence and grace period apply? During grace, is the job public and billable?
11. On failure, immediately pause, remain active through grace, or disable auto-renew? What restores it after later payment success?
12. How can employers cancel a scheduled renewal, and what cutoff applies? Is disabling auto-renew distinct from pausing/deleting/canceling the account subscription?
13. Are cancellations/refunds/prorations/credits offered after renewal? Who can issue them and how are job dates rolled back?
14. Are ATS jobs eligible by default? Does ATS closure always win? Does an ATS return auto-renew/reactivate? Should imported jobs require separate approval/consent?
15. Is MISSION BBQ exempt? If so, by stable account ID/contract flag—not company-name matching—and which charges/lifecycle rules are exempt?
16. What happens to jobs if an account subscription is canceled, past due, incomplete, or deleted? Current code leaves them active until job expiration.
17. Which notices are legally/product-required: initial consent, pre-renewal (how many days), success/receipt, failure/retry, final pause, price change, trial ending, cancellation confirmation?
18. Who receives billing notices versus job-operation notices? Current candidate-notification routing may expose billing lifecycle to non-owner addresses.
19. Must the Terms/Privacy/checkout disclosure be accepted and versioned, and what evidence must be retained?
20. What are support/admin override, comp/free-job, refund, and reconciliation procedures?

## 8. Recommended implementation phases

Each phase should be independently deployable behind a disabled feature flag. Do not remove auto-pause until reconciliation proves the replacement.

### Phase 1 — Backend lifecycle

* Write an approved state machine covering status/active/expiration/ATS precedence and payment entitlement.
* Introduce typed renewal preference + attempt/period records and database constraints; centralize lifecycle writes in server code/RPCs.
* Build a dry-run renewal candidate query and reconciliation report. Use database time and row locking/conditional updates.
* Fix lifecycle prerequisites: account-aware quantity sync, ATS close/reopen billing sync, stale-expiration reopening, and cancellation/past-due behavior.
* Add a feature flag that leaves current auto-pause authoritative.

### Phase 2 — Employer controls

* Add role-authorized per-job auto-renew control, effective date/cutoff, clear next-renewal/price display, and audit evidence.
* Make pause, delete, manual renew, and billing cancellation interactions explicit.
* Support bulk changes with partial-failure reporting and server endpoints; avoid direct client-only writes for renewal preferences.

### Phase 3 — Renewal billing

* Implement the owner-approved Stripe model with stable Stripe idempotency keys and local unique period constraints.
* Split candidate selection, payment initiation, webhook confirmation, expiration advancement, and failure/grace transitions. Advance `expires_at` only once and only from confirmed entitlement.
* Persist/process webhook IDs, handle out-of-order events, invoice success/failure/refund/dispute/cancellation, and run reconciliation.
* Roll out in shadow mode, then allowlist internal/test accounts, then a small cohort. Keep a kill switch.

### Phase 4 — Email redesign

* Replace expiration warnings with decision-approved pre-renewal, success/receipt-link, payment-failure/retry, grace-ending/final-pause, and opt-out confirmations.
* Separate billing recipients (normally account owners) from candidate-routing/job operators.
* Dedupe by renewal period + message type using claim-before-send/outbox semantics; include dashboard/billing portal/deep job-control links.

### Phase 5 — Copy updates

* Update Pricing/FAQ, dashboard, posting/onboarding, public CTA, and transactional content together.
* Obtain legal review and explicit checkout/Terms consent where required; audit Stripe-hosted checkout/portal/email copy and external marketing campaigns.
* Ensure `$9`, cadence, trial conversion, cancellation cutoff, refunds, and failure behavior match actual configuration.

### Phase 6 — Migration and rollout

* Backfill preferences according to the approved grandfathering policy; never infer consent merely from active status.
* Seed current listing periods/attempts from `approved_at`/`expires_at`, classify anomalies, and exclude unresolved rows.
* Dual-run read-only reconciliation, migrate cohorts, monitor charges/emails/status, then disable the pause RPC route only after rollback criteria pass.
* Preserve historical migrations; add new migrations and update operational docs/runbooks. Maintain a rollback path that disables renewal without double-pausing or shortening paid terms.

## 9. Risks and safeguards

| Risk | Safeguard |
|---|---|
| Duplicate billing from cron retries/concurrency | Unique `(job, period)` constraint, transaction/advisory lock, atomic claim, stable Stripe idempotency key, and no charge inside a broad non-idempotent loop. |
| Webhook duplicates/out-of-order delivery | Persist unique Stripe event IDs; compare object versions/periods; make transitions monotonic; retrieve authoritative Stripe object before irreversible writes. |
| Payment succeeds but date update fails (or inverse) | Payment/entitlement ledger, webhook-driven confirmation, transactional conditional date advance from expected old boundary, and reconciliation worker. Never mark paid before Stripe confirmation. |
| Race with pause/delete/disable/ATS close/admin reject | Lock/re-read job immediately before initiation and completion; explicit precedence; conditional updates on state + expected expiration + preference version. Cancel pending attempts where possible. |
| Unauthorized renewal | Server-side account/job authorization, restrict billing consent role, immutable actor/timestamp/disclosure version, CSRF/session protections, and no company-name exemptions. |
| Free/trial/comp jobs billed | Explicit account/job billing policy; model comps rather than overloading status; trial-aware entitlement tests; reconcile amounts before activation. |
| ATS jobs reopen incorrectly | Define ATS precedence; require current billing/expiration; sync quantity; never let sync clear employer/admin opt-out or renew a remotely closed job. |
| Employer-level subscription cannot prove job-level payment | Choose and document allocation model; retain invoice/line-item linkage per job/period; reconcile subscription quantity at invoice boundaries. |
| Timezone/date ambiguity | Store `timestamptz` UTC, compute from a single database clock/expected boundary, disclose timezone, and test DST/month-end/leap-day/cron delay. |
| Misleading/legally inadequate copy | Legal review, versioned affirmative consent, configuration-to-copy release checklist, price/cadence surfaced before authorization. |
| Excessive/duplicate emails | Period-scoped outbox unique keys, claim before sending, account digest/recipient policy, delivery state, retry caps, and observability. |
| Current reminder dedupe blocks later cycles | Key future events by listing period/attempt, not lifetime `(job,type)`; migrate without resending historical notices. |
| Quantity-sync drift and no proration | Account-aware centralized sync, Stripe/local reconciliation, webhook coverage, alerts, and owner-approved treatment of mid-cycle quantity changes. |
| MISSION BBQ assumptions | Require a contract-backed stable account entitlement/exemption record; never branch on normalized display name. |

## 10. Test plan

### Unit/state-machine tests

* Every transition for pending, active, manually paused, expired, rejected, archived/deleted, and renewal failure/grace/success.
* Trial/account status matrix (`trialing`, active, past_due, canceled, incomplete), free/comp policy, preference on/off, and role authorization.
* UTC boundary, DST, month-end, leap-day, invalid/null legacy dates, delayed cron, and exact `expires_at` equality.
* Manual and ATS jobs; ATS close/return, employer deactivation, admin rejection, connection failure, and simultaneous renewal.

### Database/concurrency tests

* Two workers claim one job/period; only one attempt and one Stripe idempotency key result.
* Conditional date advancement occurs once; pause/delete/reject/ATS close racing payment cannot incorrectly reactivate.
* Constraints/FKs/status enums and RLS/service-role boundaries; existing jobs backfill exactly per approved policy.

### Stripe integration/webhook tests

* Test-clock trial end and recurring invoices, staggered job dates, quantity changes with no proration, payment success/failure/retry, authentication required, cancellation-at-period-end/deletion, refund/dispute.
* Duplicate, reordered, delayed, and concurrently delivered events; handler crash before/after each local write; Stripe idempotency replay.
* Reconciliation finds/fixes local/Stripe quantity, status, payment, and expiration mismatches without charging again.

### Cron/email tests

* Dry-run candidate selection, feature flag/kill switch, rerun safety, partial batches, timeout/resume, and multi-account owner mapping.
* Exactly one email per job/period/type under concurrent workers; correct role-based recipients and deep links; no candidate-routing recipient receives billing data unintentionally.
* Digest/rate limits and failure retries; renewals after the first period receive their own notices.

### UI/copy/acceptance tests

* Per-job and bulk preference controls, permissions, optimistic/concurrent edits, pause/delete/cancel interactions, mobile/desktop accessibility.
* Price/date/timezone/trial/cancellation/refund/failure copy matches Stripe test configuration and Terms; stored disclosure-version evidence.
* Cohort migration, grandfathered jobs, ATS accounts, any approved MISSION BBQ policy, and rollback/kill-switch exercise.

## 11. Files inspected

The investigation used direct reads and repository-wide `rg` searches. Principal files inspected:

* Lifecycle/visibility: `lib/jobStatus.ts`, `lib/jobListingDuration.ts`, `lib/jobPersistence.ts`, `lib/employerVisibleJobs.ts`, `app/post-job/page.tsx`, `app/employer-dashboard/page.tsx`, `app/employer-dashboard/jobs/[id]/edit/page.tsx`, `app/api/employer/jobs/[id]/actions.ts`, pause/resume/renew route wrappers, `app/api/admin/jobs/[id]/approve/route.ts`, `app/api/admin/jobs/[id]/reject/route.ts`, public job/list/sitemap/company pages.
* Billing: `lib/billing.ts`, `app/api/billing/status/route.ts`, `app/api/billing/sync/route.ts`, all three `app/api/stripe/*` routes, `supabase/policies/employer-billing.sql`, `lib/employerAccounts.ts`.
* Expiration/cron/email: `app/api/cron/pause-expired-jobs/route.ts`, `lib/jobExpirationEmails.ts`, `vercel.json`, `supabase/migrations/202607130001_job_expires_at.sql`, `supabase/policies/job-expiration.sql`, email-related app/lib files and Supabase templates.
* ATS: import/prepare/sync libraries and routes, `app/api/cron/ats-sync/route.ts`, ATS dashboard, provenance/inactive-reason/connection migrations and tests.
* Copy/docs: `app/about/page.tsx`, `app/terms/page.tsx`, `app/pricing/page.tsx`, `app/post-job/page.tsx`, `app/employer-welcome/page.tsx`, `app/employer-login/page.tsx`, `app/[roleSlug]/page.tsx`, `docs/CODEBASE_GUIDE.md`, `docs/DEVELOPER_MANUAL.md`, `docs/SEO_GOOGLE_JOBS_OPTIMIZATION.md`, and `ATS_INTEGRATION_PLAN.md`.

## 12. Files likely to change during implementation

This is a forecast, not an authorization to edit them now:

* **Lifecycle/billing core:** `lib/jobStatus.ts`, `lib/jobListingDuration.ts`, `lib/billing.ts`, new renewal service/state-machine/outbox modules.
* **Routes/workers:** `app/api/cron/pause-expired-jobs/route.ts` (eventually replace/retire), new renewal cron/reconciliation routes, `app/api/stripe/webhook/route.ts`, checkout/portal as required, `app/api/employer/jobs/[id]/actions.ts`, new preference endpoints, billing status/sync routes, admin approve/reject routes.
* **ATS:** `lib/ats/import/importPreparedJobs.ts`, `lib/ats/sync/syncEmployerAtsConnection.ts`, `app/api/cron/ats-sync/route.ts` and associated tests.
* **Database:** new dated migrations for job preferences, renewal attempts/periods, webhook events/outbox, constraints/indexes/RLS; possibly account entitlement/exemption schema. Existing historical migration files should not be rewritten.
* **Employer UI/copy:** `app/employer-dashboard/page.tsx`, `app/post-job/page.tsx`, possibly onboarding/login; `app/pricing/page.tsx`, `app/terms/page.tsx` after legal approval, and `app/[roleSlug]/page.tsx`.
* **Email:** replace/version `lib/jobExpirationEmails.ts`, add renewal/payment templates and outbox sender; update `vercel.json` schedules.
* **Public visibility/docs/tests:** `lib/jobStatus.ts`, public list/detail/sitemap/company selectors if semantics change, `docs/CODEBASE_GUIDE.md`, `docs/DEVELOPER_MANUAL.md`, operational runbooks, and comprehensive new unit/integration/migration tests.

## 13. Pre-implementation gates

Before writing production code: obtain answers to Section 7; inspect deployed Supabase schema/triggers/RLS and whether optional pg_cron is enabled; export Stripe Product/Price interval/currency/tax/proration, Portal cancellation, dunning/retry, receipt/trial-email, and webhook endpoint settings; identify any external marketing emails or contractual exemptions; then write an approved lifecycle/payment sequence diagram and migration/rollback runbook.

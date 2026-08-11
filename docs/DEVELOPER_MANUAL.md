# RestaurantsNowHiring.com Developer Manual

Plain-English manual for founders/operators. This document explains what the current repository does without changing production behavior.

> **Important public-job rule:** public job listings should only show when `status = 'active'` **and** `active = true`. The app centralizes this rule in `lib/jobStatus.ts` with a legacy fallback for older databases that may not have the `status` column yet.

## How to read this manual

- **Public user** means a job seeker or general visitor.
- **Employer** means a signed-in restaurant/employer user.
- **Admin** means an approved admin user listed by admin auth rules.
- **API** means server routes under `app/api/**/route.ts`.
- **Needs verification** means the repository does not contain enough information to confirm the exact production behavior.

## Route map

| Route                                  | File                                                  | User Type                  | What It Does                                                                   | Important Notes                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | `app/page.tsx`                                        | Public user                | Homepage with hero content, role links, latest visible jobs, and employer CTA. | Reads `jobs`; filters public jobs through `isPubliclyVisibleJob` so public listings should require `status='active'` and `active=true`. |
| `/jobs`                                | `app/jobs/page.tsx`                                   | Public user                | Browse/search jobs, optionally filtered by `role` query string.                | Uses `JobsFilterPanel`; noindexes filtered result pages; builds SEO-friendly job links.                                                 |
| `/jobs/[id]`                           | `app/jobs/[id]/page.tsx`                              | Public user                | Job detail page and candidate interest form.                                   | Increments `views`; rejects non-public jobs; accepts slugs or UUIDs through job slug helpers.                                           |
| `/[roleSlug]`                          | `app/[roleSlug]/page.tsx`                             | Public user                | SEO landing page for predefined restaurant role categories.                    | Only static role slugs from `lib/restaurantRolePages.ts` are valid.                                                                     |
| `/about`                               | `app/about/page.tsx`                                  | Public user                | Marketing/about page.                                                          | Static content and CTAs.                                                                                                                |
| `/contact`                             | `app/contact/page.tsx`                                | Public user                | Contact form.                                                                  | Posts to `/api/contact`; writes contact inquiries server-side.                                                                          |
| `/pricing`                             | `app/pricing/page.tsx`                                | Public user / employer     | Pricing information.                                                           | Static page; actual billing runs through Stripe API routes.                                                                             |
| `/privacy`                             | `app/privacy/page.tsx`                                | Public user                | Privacy policy.                                                                | Static legal content.                                                                                                                   |
| `/terms`                               | `app/terms/page.tsx`                                  | Public user                | Terms page.                                                                    | Static legal content.                                                                                                                   |
| `/post-job`                            | `app/post-job/page.tsx`                               | Employer                   | Multi-step job posting form.                                                   | Requires confirmed Supabase session, employer access, and active/trial billing before insert; inserts new jobs as pending/private.      |
| `/employer-login`                      | `app/employer-login/page.tsx`                         | Employer                   | Employer signup/login page.                                                    | Uses Supabase Auth; signup requires email confirmation; accepts `next` redirect.                                                        |
| `/employer-welcome`                    | `app/employer-welcome/page.tsx`                       | Employer                   | Email-confirmation waiting page.                                               | Can resend confirmation and redirects confirmed users to `/post-job`.                                                                   |
| `/check-email`                         | `app/check-email/page.tsx`                            | Employer / auth user       | Generic “check your email” screen.                                             | Used after signup/reset style flows.                                                                                                    |
| `/forgot-password`                     | `app/forgot-password/page.tsx`                        | Employer / admin auth user | Password reset request page.                                                   | Calls Supabase reset flow or employer password reset API depending on route state.                                                      |
| `/reset-password`                      | `app/reset-password/page.tsx`                         | Employer / admin auth user | New password form after reset link.                                            | Updates Supabase Auth password.                                                                                                         |
| `/invite/[token]`                      | `app/invite/[token]/page.tsx`                         | Employer invitee           | Team invite acceptance landing page.                                           | Reads invite details from `/api/invite/[token]`; requires invited email to match signed-in user email on acceptance.                    |
| `/employer-dashboard`                  | `app/employer-dashboard/page.tsx`                     | Employer                   | Employer dashboard for jobs, billing status, candidates, pause/resume/delete.  | Redirects unauthenticated users; role-gates actions; dashboard status differs from public visibility.                                   |
| `/employer-dashboard/profile`          | `app/employer-dashboard/profile/page.tsx`             | Employer                   | Company/profile settings and password reset.                                   | Uses `/api/employer/profile`; account owner permissions matter.                                                                         |
| `/employer-dashboard/team`             | `app/employer-dashboard/team/page.tsx`                | Employer                   | Team member and invite management.                                             | Account owners manage team; uses normalized emails and invite tokens.                                                                   |
| `/employer-dashboard/stores`           | `app/employer-dashboard/stores/page.tsx`              | Employer                   | Store/location management.                                                     | Uses employer account context and `employer_stores`.                                                                                    |
| `/employer-dashboard/job-templates`    | `app/employer-dashboard/job-templates/page.tsx`       | Employer                   | Reusable job template management.                                              | Uses `employer_job_templates`.                                                                                                          |
| `/employer-dashboard/jobs/[id]/edit`   | `app/employer-dashboard/jobs/[id]/edit/page.tsx`      | Employer                   | Edit an existing employer job.                                                 | Needs ownership and role permission; keep public status rules intact.                                                                   |
| `/admin`                               | `app/admin/page.tsx`, `app/admin/AdminPageClient.tsx` | Admin                      | Admin workspace for job approval/rejection, contacts, candidates, admin users. | Requires admin session cookie and admin allowlist/database check.                                                                       |
| `/admin/login`                         | `app/admin/login/page.tsx`                            | Admin                      | Admin login page.                                                              | Creates admin session cookie through `/api/admin/session`.                                                                              |
| `/admin/unauthorized`                  | `app/admin/unauthorized/page.tsx`                     | Admin                      | Unauthorized message.                                                          | Shown for signed-in non-admins.                                                                                                         |
| `/admin/blog`                          | `app/admin/blog/page.tsx`                             | Admin                      | Private blog draft list.                                                       | No public blog route exists in this repository.                                                                                         |
| `/admin/blog/new`                      | `app/admin/blog/new/page.tsx`                         | Admin                      | New blog draft editor.                                                         | Saves drafts to `blog_posts`.                                                                                                           |
| `/admin/blog/[id]`                     | `app/admin/blog/[id]/page.tsx`                        | Admin                      | Edit blog draft.                                                               | Reads and updates `blog_posts` by ID.                                                                                                   |
| `/api/contact`                         | `app/api/contact/route.ts`                            | API                        | Saves public contact form submissions and optionally emails support.           | Uses service role; writes contact inquiry table/fallback.                                                                               |
| `/api/jobs/[id]/candidate-submissions` | `app/api/jobs/[id]/candidate-submissions/route.ts`    | API                        | Saves candidate submissions and resumes for a public job.                      | Verifies job is public before accepting; uploads resume to private storage.                                                             |
| `/api/admin/jobs/[id]/approve`         | `app/api/admin/jobs/[id]/approve/route.ts`            | API / admin                | Approves a job.                                                                | Requires admin cookie; verifies employer billing; sets `status='active'`, `active=true`, and `approved_at` if available.                |
| `/api/admin/jobs/[id]/reject`          | `app/api/admin/jobs/[id]/reject/route.ts`             | API / admin                | Rejects a job.                                                                 | Requires admin cookie; sets `status='rejected'` and `active=false`; syncs billing quantity.                                             |
| `/api/admin/*`                         | `app/api/admin/.../route.ts`                          | API / admin                | Admin support APIs for session, users, blog, contacts, candidates.             | Use admin auth helpers and service role for DB reads/writes.                                                                            |
| `/api/employer/*`                      | `app/api/employer/.../route.ts`                       | API / employer             | Employer profile/team/stores/templates/candidate APIs.                         | Require Bearer Supabase access token.                                                                                                   |
| `/api/billing/status`                  | `app/api/billing/status/route.ts`                     | API / employer             | Returns billing status and active billable job count.                          | Uses employer account context and `employer_billing`.                                                                                   |
| `/api/billing/sync`                    | `app/api/billing/sync/route.ts`                       | API / employer             | Syncs Stripe subscription quantity.                                            | Requires signed-in employer.                                                                                                            |
| `/api/stripe/checkout`                 | `app/api/stripe/checkout/route.ts`                    | API / employer             | Creates Stripe Checkout session.                                               | Uses `STRIPE_PRICE_ID`; quantity is active public jobs count.                                                                           |
| `/api/stripe/portal`                   | `app/api/stripe/portal/route.ts`                      | API / employer             | Creates Stripe Billing Portal session.                                         | Requires existing Stripe customer ID.                                                                                                   |
| `/api/stripe/webhook`                  | `app/api/stripe/webhook/route.ts`                     | API / Stripe               | Handles Stripe subscription/invoice webhooks.                                  | Verifies Stripe signature; updates `employer_billing`.                                                                                  |
| `/api/invite/[token]`                  | `app/api/invite/[token]/route.ts`                     | API / employer invitee     | Reads or accepts an invite token.                                              | Email must match normalized invite email.                                                                                               |
| `/api/cron/pause-expired-jobs`         | `app/api/cron/pause-expired-jobs/route.ts`            | API / scheduler            | Sends expiration reminders and pauses jobs after 30 days.                      | Requires `CRON_SECRET`; calls `pause_expired_job_ads` RPC.                                                                              |
| `/sitemap.xml`                         | `app/sitemap.ts`                                      | SEO                        | Dynamic sitemap.                                                               | Includes static pages, role pages, and public jobs only.                                                                                |
| `/robots.txt`                          | `app/robots.ts`                                       | SEO                        | Robots directives.                                                             | Points crawlers to sitemap and allows indexing.                                                                                         |

## Public website pages

### Homepage: `/`

- **File path:** `app/page.tsx`
- **Who uses it:** public user.
- **What it does:** shows the homepage, employer CTA, role sections, and latest job listings.
- **Important buttons/actions:** “Post a Job”, “Browse Jobs”, role/category links, latest job cards.
- **Important data:** reads `jobs` fields such as `id`, `title`, `restaurant_name`, `city`, `state`, `created_at`, `active`, `status`, `role_category`, `pay_range`, and `employment_type`.
- **Supabase tables:** `jobs`.
- **Auth/permissions:** none for viewing.
- **Things that could break:** changing visibility filtering could expose pending/rejected jobs; changing slug logic could break job links.
- **Troubleshooting:** if latest jobs are missing, check `jobs.status`, `jobs.active`, and whether `lib/jobStatus.ts` still treats public jobs correctly.

### Browse jobs: `/jobs`

- **File path:** `app/jobs/page.tsx`
- **Who uses it:** public user.
- **What it does:** lists public jobs and lets users filter by role/category.
- **Important buttons/actions:** filters in `JobsFilterPanel`, job cards, “Post a Job”.
- **Important data:** reads `jobs`; builds slugs using `buildUniqueJobSlugMap`.
- **Supabase tables:** `jobs`.
- **Auth/permissions:** none for viewing.
- **Things that could break:** role filtering, noindex behavior for filtered URLs, and public visibility rules.
- **Troubleshooting:** if a job appears in Supabase but not on `/jobs`, confirm `status='active'`, `active=true`, and the role filter matches `role_category`.

### Job detail: `/jobs/[id]`

- **File path:** `app/jobs/[id]/page.tsx`
- **Who uses it:** public user.
- **What it does:** shows one public job, increments views, and renders the candidate submission form.
- **Important buttons/actions:** candidate submission form, apply/contact actions, navigation back to jobs.
- **Important data:** reads one job; writes `views` by incrementing; candidate form posts to `/api/jobs/[id]/candidate-submissions`.
- **Supabase tables:** `jobs`, `candidate_submissions`; storage bucket `candidate-resumes` through API.
- **Auth/permissions:** none to view public jobs or submit interest.
- **Things that could break:** accepting inactive jobs, breaking slug/UUID lookup, or changing view update logic.
- **Troubleshooting:** if job detail 404s, check slug generation, `status`, `active`, and whether the ID is a real job ID.

### Role landing pages: `/[roleSlug]`

- **File path:** `app/[roleSlug]/page.tsx`
- **Who uses it:** public user and SEO visitors.
- **What it does:** renders SEO landing pages for predefined restaurant roles and lists matching public jobs.
- **Important buttons/actions:** links to jobs and related role pages.
- **Important data:** reads public `jobs`; role definitions come from `lib/restaurantRolePages.ts`.
- **Supabase tables:** `jobs`.
- **Auth/permissions:** none.
- **Things that could break:** adding a slug not present in `restaurantRolePages` will not work because dynamic params are fixed.
- **Troubleshooting:** if a role page has no jobs, check `role_category`, title keywords, and public job status.

### Static public pages

- **Files:** `app/about/page.tsx`, `app/contact/page.tsx`, `app/pricing/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`.
- **Who uses them:** public users and employers.
- **What they do:** explain the company, contact the team, show pricing, and provide legal content.
- **Important actions:** contact page submits to `/api/contact`; pricing links users toward employer signup/posting.
- **Supabase tables:** contact page writes `contact_inquiries` through the API.
- **Auth/permissions:** none for public pages.
- **Things that could break:** contact form validation, support email notifications, legal content accuracy.
- **Troubleshooting:** if contact submissions fail, check `/api/contact`, `SUPABASE_SERVICE_ROLE_KEY`, `contact_inquiries`, and optional Resend environment variables.

## Employer pages

### Employer signup/login: `/employer-login`

- **File path:** `app/employer-login/page.tsx`
- **Who uses it:** employers.
- **What it does:** signs existing employers in and creates new Supabase Auth users.
- **Important buttons/actions:** login, signup, forgot password.
- **Important data:** Supabase Auth session and user metadata.
- **Supabase tables:** Auth users; additional employer account records may be created by helper flows after auth.
- **Auth/permissions:** user must confirm email before posting jobs.
- **Things that could break:** redirect URLs, email confirmation, invite acceptance after login.
- **Troubleshooting:** if login works but dashboard redirects, check email confirmation, session token, and `/api/employer/me`.

### Post a job: `/post-job`

- **File path:** `app/post-job/page.tsx`
- **Who uses it:** employers with posting permission.
- **What it does:** guides employers through account/job details and inserts a new job.
- **Important buttons/actions:** store selector, template selector, multi-step next/back, final submit.
- **Important data:** writes `jobs` with `active:false` and pending review fields; may include `employer_account_id`, `posted_by_user_id`, store/template IDs, candidate notification routing, and contact/application fields.
- **Supabase tables:** `jobs`, `employer_stores`, `employer_job_templates`, `employer_team_members`, `employer_billing`.
- **Auth/permissions:** requires Supabase session, confirmed email, employer access from `/api/employer/me`, job-management permission, and billing access.
- **Things that could break:** changing insert defaults could make jobs public before admin approval. New jobs should remain pending/private until approved.
- **Troubleshooting:** if posting is blocked, check billing status, role permissions, email confirmation, and Supabase RLS on `jobs`.

### Employer dashboard: `/employer-dashboard`

- **File path:** `app/employer-dashboard/page.tsx`
- **Who uses it:** employers.
- **What it does:** shows employer jobs, dashboard statuses, views, candidates, billing status, and job actions.
- **Important buttons/actions:** pause/resume, delete, candidate status updates, billing checkout/portal, account switcher.
- **Important data:** reads and updates `jobs`; reads candidates; reads billing; may sync Stripe quantity.
- **Supabase tables:** `jobs`, `candidate_submissions`, `employer_billing`, `employer_team_members`, `employer_accounts`.
- **Auth/permissions:** requires logged-in Supabase user; uses employer account context and role permissions.
- **Things that could break:** ownership filters, pause/resume status transitions, views column fallback, RLS policies.
- **Troubleshooting:** if jobs do not show for an employer, check `employer_account_id`, `employer_user_id`, `employer_email`, selected account ID, and team role.

### Employer profile: `/employer-dashboard/profile`

- **File path:** `app/employer-dashboard/profile/page.tsx`
- **Who uses it:** employers, mainly account owners.
- **What it does:** shows and edits safe company/profile fields and sends password reset.
- **Important buttons/actions:** save profile, send password reset.
- **Important data:** reads/writes `employer_profiles`; falls back to latest job/user metadata for missing values.
- **Supabase tables:** `employer_profiles`, `jobs`.
- **Auth/permissions:** requires Bearer token; profile management is permission-gated by employer account context.
- **Things that could break:** exposing unsafe fields, losing fallback profile data, incorrect selected account context.
- **Troubleshooting:** if profile save fails, check `/api/employer/profile`, service role configuration, and account-owner permissions.

### Employer team: `/employer-dashboard/team`

- **File path:** `app/employer-dashboard/team/page.tsx`
- **Who uses it:** employer account owners.
- **What it does:** manages team members, roles, invites, resend invite emails, and store/location links.
- **Important buttons/actions:** add member, resend invite, edit member/location, remove member.
- **Important data:** reads/writes `employer_team_members`; reads/writes store-related data through store APIs.
- **Supabase tables:** `employer_team_members`, `employer_accounts`, `employer_stores`.
- **Auth/permissions:** account owners can manage; hiring managers/viewers have restricted access.
- **Things that could break:** normalized email matching, `user_id`/`auth_user_id` sync, invite tokens, role permissions.
- **Troubleshooting:** if an invite does not work, check token, invite status, exact normalized email, and `/api/invite/[token]` response.

### Stores and templates

- **Files:** `app/employer-dashboard/stores/page.tsx`, `app/employer-dashboard/job-templates/page.tsx`.
- **Who uses them:** employers with account-management permission.
- **What they do:** manage reusable store/location information and job template defaults.
- **Important buttons/actions:** add, edit, delete/deactivate stores/templates.
- **Important data:** `employer_stores` stores location/pay/application/routing defaults; `employer_job_templates` stores job title/category/schedule/description/benefits defaults.
- **Auth/permissions:** employer account context and account-owner style permissions.
- **Things that could break:** default values used by `/post-job`, notification routing emails, RLS account checks.
- **Troubleshooting:** if selectors are empty on `/post-job`, check `/api/employer/stores`, `/api/employer/job-templates`, active flags, and account ID.

### Edit job: `/employer-dashboard/jobs/[id]/edit`

- **File path:** `app/employer-dashboard/jobs/[id]/edit/page.tsx`
- **Who uses it:** employers with job-management permission.
- **What it does:** edits an existing job owned by the selected employer account.
- **Important buttons/actions:** save changes, return to dashboard.
- **Important data:** reads/writes `jobs`, and may use stores/templates for defaults.
- **Supabase tables:** `jobs`, `employer_stores`, `employer_job_templates`.
- **Auth/permissions:** must be signed in and own/access the job.
- **Things that could break:** accidentally changing approval/public visibility fields, ownership filters, notification routing.
- **Troubleshooting:** if save is blocked, check role permission, job ownership fields, and Supabase RLS.

## Admin pages

### Admin workspace: `/admin`

- **Files:** `app/admin/page.tsx`, `app/admin/AdminPageClient.tsx`.
- **Who uses it:** admins.
- **What it does:** loads the admin page after cookie-based admin validation; client tabs show job approvals, contact inquiries, candidates, and admin users.
- **Important buttons/actions:** approve job, reject job, filter job queues, add admin user.
- **Important data:** reads jobs, contact inquiries, candidate submissions, and admin users; approval/rejection calls admin APIs.
- **Supabase tables:** `jobs`, `contact_inquiries`, `candidate_submissions`, `admin_users`.
- **Auth/permissions:** requires `ADMIN_SESSION_COOKIE` set by `/api/admin/session`; admin must pass allowlist/database check.
- **Things that could break:** approval/rejection status changes, admin cookie handling, admin allowlist bootstrap.
- **Troubleshooting:** if admin is locked out, check `/admin/login`, `/api/admin/me`, `ADMIN_ALLOWLIST_EMAILS`, and `admin_users`.

### Admin login/unauthorized

- **Files:** `app/admin/login/page.tsx`, `app/admin/unauthorized/page.tsx`.
- **Who uses them:** admins or rejected admin users.
- **What they do:** sign in with Supabase Auth and create/delete the admin session cookie; show unauthorized messaging.
- **Important buttons/actions:** login, forgot password link, sign out/try another account.
- **Supabase tables:** Auth users; `admin_users` through auth helper checks.
- **Things that could break:** cookie name/options, redirect `next` URL, admin allowlist.

### Admin blog drafts

- **Files:** `app/admin/blog/page.tsx`, `app/admin/blog/new/page.tsx`, `app/admin/blog/[id]/page.tsx`, `app/admin/blog/BlogEditorClient.tsx`, `app/admin/blog/BlogAdminShell.tsx`.
- **Who uses them:** admins.
- **What they do:** list, create, and edit private blog drafts.
- **Important buttons/actions:** create draft, save draft, edit draft.
- **Important data:** `blog_posts` fields `title`, `slug`, `category`, `excerpt`, `content`, `status`, `meta_title`, `meta_description`.
- **Supabase tables:** `blog_posts`.
- **Auth/permissions:** primary blog admin helper; no public blog route exists in this repo.
- **Things that could break:** accidentally assuming drafts are public; slug uniqueness; HTML content storage.

## Auth pages and flow

### Auth flow in plain English

1. Employer signs up on `/employer-login` using Supabase Auth.
2. Supabase sends an email confirmation link.
3. Until confirmed, the user is sent to `/employer-welcome` or `/check-email`.
4. Confirmed users can log in and receive a Supabase session.
5. Pages load sessions with `supabase.auth.getSession()` or users with `supabase.auth.getUser()`.
6. Employer-only API routes expect `Authorization: Bearer <Supabase access token>`.
7. Dashboard and posting pages call `acceptPendingTeamInvitesForCurrentUser()` so pending team invites can attach to the signed-in user.
8. Password reset uses `/forgot-password`, `/reset-password`, and `/api/employer/password-reset` where present.

### Auth files to know

- `app/employer-login/page.tsx`: signup/login form and redirects.
- `app/employer-welcome/page.tsx`: confirmation waiting/resend screen.
- `app/check-email/page.tsx`: simple email-check page.
- `app/forgot-password/page.tsx`: reset request page.
- `app/reset-password/page.tsx`: new-password page.
- `app/admin/login/page.tsx`: admin login and admin cookie creation.
- `lib/teamInviteAcceptance.ts`: accepts pending invites after auth.
- `lib/billing.ts`: `getAuthUserFromRequest()` validates Bearer tokens for server APIs.

## API routes

### Public APIs

- `app/api/contact/route.ts`: validates contact form input, inserts an inquiry through service role, and sends optional Resend email.
- `app/api/jobs/[id]/candidate-submissions/route.ts`: validates candidate form, confirms the job is publicly visible, uploads resume to `candidate-resumes`, inserts `candidate_submissions`, and emails the employer notification address.
- `app/api/invite/[token]/route.ts`: returns invite details on `GET`; accepts invite on `POST` after auth and email match.

### Employer APIs

- `app/api/employer/me/route.ts`: returns employer account context and role permissions.
- `app/api/employer/profile/route.ts`: reads/writes safe employer profile fields.
- `app/api/employer/password-reset/route.ts`: sends employer password reset.
- `app/api/employer/team/route.ts`: list/add/update/delete team members.
- `app/api/employer/team/[id]/invite/route.ts`: resend a team invite email.
- `app/api/employer/stores/route.ts`: CRUD for employer stores.
- `app/api/employer/job-templates/route.ts`: CRUD for job templates.
- `app/api/employer/candidate-submissions/route.ts`: lists employer candidate submissions.
- `app/api/employer/candidate-submissions/[id]/resume/route.ts`: serves private resume downloads to authorized employers.

### Admin APIs

- `app/api/admin/session/route.ts`: creates/deletes the admin session cookie after validating the Supabase access token.
- `app/api/admin/me/route.ts`: reports current admin auth status.
- `app/api/admin/users/route.ts`: lists and adds admin users.
- `app/api/admin/jobs/[id]/approve/route.ts`: approves a job after billing verification.
- `app/api/admin/jobs/[id]/reject/route.ts`: rejects a job and syncs billing quantity.
- `app/api/admin/contact-inquiries/route.ts`: reads contact inquiries.
- `app/api/admin/candidate-submissions/route.ts`: reads candidate submissions.
- `app/api/admin/blog/route.ts` and `app/api/admin/blog/[id]/route.ts`: create/update blog drafts.

### Billing/cron APIs

- `app/api/billing/status/route.ts`: returns billing record, billable active job count, and whether jobs can be posted/activated.
- `app/api/billing/sync/route.ts`: syncs Stripe subscription quantity for active public jobs.
- `app/api/stripe/checkout/route.ts`: creates Checkout session.
- `app/api/stripe/portal/route.ts`: creates customer portal session.
- `app/api/stripe/webhook/route.ts`: handles Stripe subscription lifecycle events.
- `app/api/cron/pause-expired-jobs/route.ts`: invokes the idempotent job renewal RPC on the existing daily schedule.

## Supabase/database tables

The repository includes additive SQL files under `supabase/schema` and `supabase/policies`. The base `jobs` table creation file is not present, so the full jobs schema is **Needs verification**.

| Table / Storage                    | Purpose                             | Important Fields Mentioned in Code                                                                                                                                                                                                                                                                                        | Notes                                                                                           |
| ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `jobs`                             | Job ads.                            | `id`, `title`, `restaurant_name`, `city`, `state`, `active`, `status`, `approved_at`, `views`, `employer_user_id`, `employer_email`, `employer_account_id`, `posted_by_user_id`, `posted_by_email`, `candidate_notification_email(s)`, `candidate_notification_routing`, `employer_store_id`, `employer_job_template_id`. | Public only when `status='active'` and `active=true`. Base table definition needs verification. |
| `employer_accounts`                | Employer company/account container. | owner IDs/emails, account/brand/company names, support email, default candidate notification routing.                                                                                                                                                                                                                     | Used for multi-user account context.                                                            |
| `employer_team_members`            | Team membership and invites.        | `account_id`, `user_id`, `auth_user_id`, `email`, `role`, `status`, `invite_token`, `invite_accepted_at`, `can_manage_notification_routing`.                                                                                                                                                                              | Normalized email matching matters.                                                              |
| `employer_profiles`                | Safe profile fields for employers.  | company/contact/phone/address/support fields.                                                                                                                                                                                                                                                                             | Managed through profile API.                                                                    |
| `employer_billing`                 | Stripe billing state.               | Stripe customer/subscription IDs, status, trial dates, period end, account ID.                                                                                                                                                                                                                                            | Controls posting/approval gate.                                                                 |
| `employer_stores`                  | Store/location defaults.            | location, address, city/state, routing emails, pay/application defaults, active.                                                                                                                                                                                                                                          | Used by team and post-job flow.                                                                 |
| `employer_job_templates`           | Reusable job ad templates.          | template name, job title, category, employment type, schedule, pay defaults, description, benefits, active.                                                                                                                                                                                                               | Used by post-job flow.                                                                          |
| `candidate_submissions`            | Candidate interest/applications.    | job/employer IDs, candidate contact info, resume metadata, status.                                                                                                                                                                                                                                                        | Resume files are private.                                                                       |
| `candidate-resumes` storage bucket | Private resume uploads.             | object paths.                                                                                                                                                                                                                                                                                                             | API uploads and removes on insert failure.                                                      |
| `contact_inquiries`                | Contact page submissions.           | name, email, subject, message, status/read fields.                                                                                                                                                                                                                                                                        | Server-side service role writes.                                                                |
| `admin_users`                      | Admin allowlist table.              | normalized email, created metadata.                                                                                                                                                                                                                                                                                       | Bootstrapped by env allowlist too.                                                              |
| `blog_posts`                       | Private admin blog drafts.          | title, slug, category, excerpt, content, status, meta fields.                                                                                                                                                                                                                                                             | No public blog route currently.                                                                 |
| `job_expiration_email_events`      | Historical expiration-email deduplication records. | `job_id`, `reminder_type`, `sent_at`.                                                                                                                                                                                                                                                                                     | Retained but no longer written by the auto-renew cron.                                          |

## Stripe/billing

### Billing flow in plain English

1. Employer signs in and visits dashboard/post-job.
2. Dashboard calls `/api/billing/status`.
3. Billing is allowed if `employer_billing.billing_status` is `active` or `trialing`, or if `trial_ends_at` is still in the future.
4. Checkout route creates or reuses a Stripe customer and creates a Stripe Checkout session using `STRIPE_PRICE_ID`.
5. Stripe webhooks update `employer_billing` with customer/subscription/status/trial/period information.
6. Active billable job count is based on public active jobs: `status='active'` and `active=true`.
7. Quantity sync updates the Stripe subscription item quantity to match active billable jobs.
8. Admin approval verifies billing before setting a job public.

### Pricing notes

- The requested business rule is **free trial plus $9 per job every 30 days**.
- The code uses Stripe `STRIPE_PRICE_ID`; the actual price amount and recurrence live in Stripe, not in this repository. Confirm the Stripe Price is configured as $9/job/30 days before relying on it.

### Billing files to know

- `lib/billing.ts`: Stripe API helper, billing access evaluation, billable job counts, webhook signature verification, subscription quantity sync.
- `app/api/stripe/checkout/route.ts`: Checkout creation.
- `app/api/stripe/portal/route.ts`: Billing Portal creation.
- `app/api/stripe/webhook/route.ts`: webhook handling.
- `app/api/billing/status/route.ts`: dashboard billing summary.
- `app/api/billing/sync/route.ts`: manual app-side quantity sync.
- `supabase/policies/employer-billing.sql`: billing table and trigger/RPC policy support.

## SEO files: sitemap, robots, metadata

### SEO flow in plain English

1. `app/layout.tsx` sets global metadata, fonts, navigation, and organization/website structured data.
2. `lib/seo.ts` provides canonical URL helpers and metadata builder.
3. Public pages call `buildPageMetadata()` for titles/descriptions/canonical links.
4. `app/sitemap.ts` emits static pages, role landing pages, and public jobs only.
5. `app/robots.ts` allows crawling and points to the sitemap.
6. Job detail and role pages include structured data helpers for search engines.
7. Google Search Console should be expected to index public static pages, role pages, and active job detail pages over time. Filtered `/jobs?role=...` pages are marked noindex.

### SEO cautions

- Do not put pending/rejected jobs in the sitemap.
- Do not remove canonical URLs unless there is a deliberate SEO migration.
- If indexing is slow, confirm the job appears in `/sitemap.xml`, returns 200, and is not blocked by robots/noindex.

## Environment variables

Do not put secret values in documentation, client code, or commits. The repository references these names:

| Variable                        | Used For                                  | Secret?                                 |
| ------------------------------- | ----------------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase client URL.                      | Public.                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server anon Supabase client.      | Public but still environment-managed.   |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only admin/service role DB access. | Secret.                                 |
| `NEXT_PUBLIC_SITE_URL`          | Canonical/site URL and Stripe redirects.  | Public.                                 |
| `STRIPE_SECRET_KEY`             | Stripe API requests.                      | Secret.                                 |
| `STRIPE_PRICE_ID`               | Stripe Checkout price.                    | Not a secret, but environment-specific. |
| `STRIPE_WEBHOOK_SECRET`         | Stripe webhook signature verification.    | Secret.                                 |
| `RESEND_API_KEY`                | Sending email through Resend.             | Secret.                                 |
| `CONTACT_NOTIFICATION_FROM`     | From address for contact notifications.   | Not usually secret.                     |
| `CANDIDATE_NOTIFICATION_FROM`   | From address for candidate emails.        | Not usually secret.                     |
| `TEAM_INVITE_FROM`              | From address for team invites.            | Not usually secret.                     |
| `EXPIRATION_REMINDER_FROM`      | From address for job expiration emails.   | Not usually secret.                     |
| `ADMIN_ALLOWLIST_EMAILS`        | Bootstrap admin emails.                   | Sensitive operational config.           |
| `CRON_SECRET`                   | Protects cron endpoint.                   | Secret.                                 |
| `NODE_ENV`                      | Runtime mode/cookie security.             | Not secret.                             |

## Key flows

### 1. Job posting flow

1. Employer signs up/logs in at `/employer-login`.
2. Employer confirms email.
3. Employer opens `/post-job`.
4. Page loads employer access, stores, templates, and billing status.
5. Employer fills job details and submits.
6. New job is inserted as not public (`active:false`; status is pending when the status column is available).
7. Admin reviews in `/admin`.
8. Admin approves with `/api/admin/jobs/[id]/approve`.
9. Approval verifies employer billing first, then sets `status='active'`, `active=true`, and `approved_at` when available.
10. Approved job becomes visible on homepage, `/jobs`, role pages, job detail, and sitemap.
11. Employer can pause/resume from dashboard if status allows it.
12. Dashboard shows status labels and view counts; billing quantity sync is based on active public jobs.

### 2. Auth flow

1. Signup creates Supabase Auth user.
2. Supabase sends confirmation email.
3. App checks `email_confirmed_at` before allowing posting.
4. Login creates a Supabase session in browser.
5. Client pages call `supabase.auth.getSession()`/`getUser()` while loading.
6. API routes receive Bearer access token and validate through Supabase.
7. Dashboard redirects to `/employer-login?next=/employer-dashboard` if no user.
8. Password reset uses `/forgot-password`, email link, and `/reset-password`.

### 3. Team invite flow

1. Account owner creates an invite/team member row in `employer_team_members`.
2. Invite has `status` such as `invited` or `pending`, an `email`, and an `invite_token`.
3. Invite email points to `/invite/[token]`.
4. Invite page/API loads invite by token.
5. Acceptance requires the signed-in user's normalized email to match the invite's normalized email.
6. Acceptance sets member `status='active'`, sets `user_id`, sets `auth_user_id`, and records `invite_accepted_at`.
7. `lib/teamInviteAcceptance.ts` also attempts to accept pending invites for the current user after login/dashboard load; it first tries the `accept_pending_team_invites_for_current_user` RPC, then falls back to a client update.

### 4. Billing flow

1. Billing record lives in `employer_billing`.
2. Trial or active subscription allows posting/activation.
3. Stripe Checkout starts subscription setup.
4. Stripe webhook updates local billing fields.
5. Subscription quantity should equal count of jobs where `status='active'` and `active=true`.
6. Admin approval and employer pause/resume/delete can trigger quantity sync.

### 5. SEO flow

1. Metadata comes from `lib/seo.ts` and page metadata exports.
2. Public job pages and role pages are intended for indexing.
3. Filtered browse pages are noindexed.
4. Sitemap includes only public jobs.
5. Robots points crawlers to sitemap.

## Notes on the code

## `lib/jobStatus.ts`

### What this file does

Central source of truth for persisted job statuses, public visibility, dashboard labels, admin filters, and missing-column fallbacks.

### Important code notes

- `normalizePersistedStatus(...)`: converts stored status strings into known values like `active`, `paused`, `pending`, and `rejected`.
- `isPubliclyVisibleJob(status, active)`: returns true only for `status='active'` and `active=true` when status exists; this is the public visibility rule.
- `dashboardStatusForJob(...)`: turns database values into employer-facing labels.
- `adminReadableStatusForJob(...)` and `adminFilterForJob(...)`: support admin queues.
- `getEmployerPauseResumeUpdate(...)`: decides the next `status`/`active` pair when an employer pauses or resumes.
- `isMissingStatusColumnError(...)`, `isMissingViewsColumnError(...)`, `isMissingApprovedAtColumnError(...)`: keep older database environments from hard-failing.

## `lib/billing.ts`

### What this file does

Handles Stripe API calls, validates API Bearer tokens, reads billing records, counts active billable jobs, evaluates billing access, verifies webhooks, and syncs subscription quantity.

### Important code notes

- `stripeRequest(...)`: sends authenticated Stripe API requests using `STRIPE_SECRET_KEY`.
- `getAuthUserFromRequest(...)`: extracts and verifies Supabase Bearer tokens for server APIs.
- `.from("employer_billing")`: reads/writes employer billing state.
- `.from("jobs")` with `.eq("status", "active")` and `.eq("active", true)`: counts billable public jobs.
- `evaluateBillingAccess(...)`: allows active/trialing subscriptions or unexpired trial dates.
- `verifyStripeWebhookSignature(...)`: protects webhook endpoint with `STRIPE_WEBHOOK_SECRET`.
- `syncSubscriptionQuantity(...)`: updates Stripe quantity to match active public job count.

## `lib/employerAccounts.ts`

### What this file does

Builds the current employer account context: account ID, owner, memberships, role, and permissions.

### Important code notes

- `.from("employer_team_members")`: finds memberships by user ID/auth user ID/email.
- `.from("employer_accounts")`: loads owned accounts and account metadata.
- `ROLE_PERMISSIONS`: maps account owner, hiring manager, and viewer roles to allowed actions.
- `getEmployerAccountContext(...)`: main helper used by employer and billing APIs.
- Email normalization is important because old rows may be linked by email rather than user ID.

## `lib/teamInviteAcceptance.ts`

### What this file does

Automatically accepts pending invites for the currently signed-in user when their email matches an invite.

### Important code notes

- `normalizeEmail(...)`: trims and lowercases email for matching.
- `supabase.auth.getUser()`: loads the current browser-authenticated user.
- `supabase.rpc("accept_pending_team_invites_for_current_user")`: preferred database helper if installed.
- `.from("employer_team_members")`: fallback update sets `user_id`, `auth_user_id`, `status='active'`, and `invite_accepted_at`.
- `.in("status", ["invited", "pending"])`: only accepts pending invite states.

## `app/page.tsx`

### What this file does

Renders the public homepage and latest jobs.

### Important code notes

- `import { supabase }`: uses the Supabase client to read jobs.
- `.from("jobs")`: loads recent job rows.
- `isPubliclyVisibleJob(...)`: filters public jobs.
- `buildUniqueJobSlugMap(...)`: creates stable job URLs.
- `LatestJobsPanel`: renders the latest job cards.
- `return (...)`: renders the hero, CTAs, role section, and latest jobs.

## `app/jobs/page.tsx`

### What this file does

Renders the public browse jobs page.

### Important code notes

- `generateMetadata(...)`: marks filtered search pages noindex.
- `searchParams.role`: reads role filters from the URL.
- `.from("jobs")`: queries jobs.
- `.in("role_category", rolesArray)`: filters jobs by selected role categories.
- `isPubliclyVisibleJob(...)`: hides pending/paused/rejected jobs.
- `JobsFilterPanel`: client-side filter UI.

## `app/jobs/[id]/page.tsx`

### What this file does

Renders one job detail page and candidate form.

### Important code notes

- Dynamic `id` can be a UUID or generated slug.
- `.from("jobs")`: loads the job and related fields.
- `isPubliclyVisibleJob(...)`: prevents private jobs from being shown.
- View update code increments `views` when possible.
- `CandidateSubmissionForm`: renders the public candidate interest form.
- Structured data helps Google understand the job page.

## `app/post-job/page.tsx`

### What this file does

Client-side multi-step employer job posting form.

### Important code notes

- `supabase.auth.getSession()` and `getUser()`: enforce signed-in confirmed employer.
- `acceptPendingTeamInvitesForCurrentUser()`: attaches pending team access after login.
- `fetch("/api/employer/me")`: loads role permissions and account context.
- `fetch("/api/billing/status")`: blocks posting when billing is inactive.
- `fetch("/api/employer/stores")` and `fetch("/api/employer/job-templates")`: load optional shortcuts.
- `handleFinalSubmit(...)`: validates the form and inserts into `jobs`.
- `.from("jobs").insert(...)`: creates a new pending/private job.
- `active: false`: keeps the job private until admin approval.

## `app/employer-dashboard/page.tsx`

### What this file does

Client-side employer dashboard for jobs, candidates, billing, and job actions.

### Important code notes

- `useEffect(...)`: loads session, accepts invites, loads employer access, billing, candidates, and jobs.
- `.from("jobs")`: reads employer-owned jobs by account ID, user ID, or email fallback.
- `canUserAccessJob(...)`: filters jobs based on role/location access.
- `dashboardStatusForJob(...)`: shows status labels.
- `handlePauseResume(...)`: updates `status` and `active` for eligible jobs.
- `handleConfirmDelete(...)`: deletes a job after ownership checks.
- `fetch("/api/employer/candidate-submissions")`: loads candidates.
- `fetch("/api/stripe/checkout")` / `fetch("/api/stripe/portal")`: starts billing actions.

## `app/admin/page.tsx` and `app/admin/AdminPageClient.tsx`

### What these files do

Server page validates admin cookie, then client component renders admin tools.

### Important code notes

- `cookies()`: reads the admin session cookie.
- `getAdminUserFromAccessToken(...)`: validates admin access.
- `redirect(...)`: sends unauthenticated/non-admin users away.
- `fetch("/api/admin/jobs/[id]/approve")`: approves jobs.
- `fetch("/api/admin/jobs/[id]/reject")`: rejects jobs.
- `fetch("/api/admin/contact-inquiries")`, `fetch("/api/admin/candidate-submissions")`, `fetch("/api/admin/users")`: load admin tables.

## `app/api/admin/jobs/[id]/approve/route.ts`

### What this file does

Approves a pending job after admin and billing checks.

### Important code notes

- `cookies()`: requires admin session cookie.
- `getAdminUserFromAccessToken(...)`: confirms caller is an admin.
- `.from("jobs").select("employer_user_id,employer_email")`: finds owner for billing verification.
- `getBillingRecord(...)` and `evaluateBillingAccess(...)`: block approval if billing is inactive.
- `.update({ active: true, status: "active", approved_at })`: makes the job public.
- `syncSubscriptionQuantityForEmployer(...)`: updates Stripe quantity after approval.

## `app/api/admin/jobs/[id]/reject/route.ts`

### What this file does

Rejects a job from the admin queue.

### Important code notes

- Admin cookie and admin access checks are required.
- `.from("jobs").update({ active: false, status: "rejected" })`: keeps rejected jobs private.
- `normalizePersistedStatus(...)`: verifies rejection persisted.
- `syncSubscriptionQuantityForEmployer(...)`: updates Stripe quantity when needed.

## `app/api/jobs/[id]/candidate-submissions/route.ts`

### What this file does

Handles public candidate submissions for a job.

### Important code notes

- Validates name, email, phone, resume file type, and file size.
- `.from("jobs")`: confirms target job exists and is public.
- `isPubliclyVisibleJob(...)`: blocks inactive/non-approved jobs.
- `storage.from("candidate-resumes").upload(...)`: saves private resume file.
- `.from("candidate_submissions").insert(...)`: records candidate info and resume metadata.
- Email helper sends candidate notification if Resend is configured.

## `app/api/invite/[token]/route.ts`

### What this file does

Loads invite details and accepts invite tokens.

### Important code notes

- `.from("employer_team_members").eq("invite_token", token)`: finds the invite.
- `GET`: returns account/member display data.
- `POST`: verifies Bearer-authenticated user and normalized email match.
- `.update({ user_id, auth_user_id, status: "active", invite_accepted_at })`: activates membership.

## `app/sitemap.ts`

### What this file does

Builds the dynamic sitemap.

### Important code notes

- `staticRoutes`: includes core static pages.
- `restaurantRolePages`: adds role landing pages.
- `.from("jobs")`: reads job rows.
- `isPubliclyVisibleJob(...)`: includes only public jobs.
- `getJobPath(...)`: outputs SEO job URLs.

## `app/robots.ts`

### What this file does

Builds robots.txt.

### Important code notes

- `getSiteUrl()`: resolves canonical site URL.
- `sitemap`: points crawlers to `/sitemap.xml`.
- `rules`: allows crawlers by default.

## Common troubleshooting

### Jobs not showing publicly

- Confirm `jobs.status = 'active'`.
- Confirm `jobs.active = true`.
- Confirm the job was approved through admin route or equivalent safe process.
- Confirm the job URL is in `/sitemap.xml` for SEO expectations.
- Confirm role filters match `role_category`.
- Check whether production database is missing `status`; legacy fallback may behave differently and needs verification.

### Job views not updating

- Confirm the `jobs.views` column exists; code has a missing-column fallback.
- Confirm the job detail page is being visited, not only the list page.
- Check Supabase update permissions/service behavior for the view increment path.
- Confirm errors are not hidden by fallback logic in the job detail page.

### Employer cannot access dashboard

- Confirm Supabase Auth login succeeds.
- Confirm email is confirmed.
- Confirm `/api/employer/me` returns employer context.
- Confirm `employer_team_members` has an active row for the normalized email/user.
- Confirm selected employer account ID in local storage still exists.
- Check `employer_accounts.owner_user_id`, `employer_team_members.user_id`, `auth_user_id`, and email matching.

### Invite link expired or does not work

- Confirm `invite_token` in the URL exists in `employer_team_members`.
- Confirm status is `invited` or `pending`, not `disabled`.
- Confirm signed-in user email exactly matches invite email after trim/lowercase normalization.
- Confirm both `user_id` and `auth_user_id` can be populated.
- Check whether `accept_pending_team_invites_for_current_user` RPC exists; if not, verify the fallback update works.
- Resend invite from `/employer-dashboard/team` if token/email is wrong.

### Admin approval/rejection does not update job visibility

- Confirm admin user is authorized through `/api/admin/me`.
- For approval, confirm employer has active billing or trial.
- Confirm `jobs.employer_user_id` exists; approval route rejects jobs missing this because billing cannot be verified.
- Confirm approval wrote `status='active'` and `active=true`.
- Confirm rejection wrote `status='rejected'` and `active=false`.
- Check for missing `status` or `approved_at` columns in older databases.

### Billing/trial status looks wrong

- Confirm `employer_billing` row exists for the account owner user ID.
- Confirm `billing_status` is `active` or `trialing`, or `trial_ends_at` is in the future.
- Confirm Stripe webhook is configured and `STRIPE_WEBHOOK_SECRET` matches.
- Confirm `STRIPE_PRICE_ID` points to the intended $9/job/30-day price in Stripe.
- Run or trigger billing sync if subscription quantity does not match active public job count.
- Remember billable jobs are only `status='active'` and `active=true`.

### SEO pages not indexing

- Confirm the page returns 200 publicly.
- Confirm `robots.txt` allows crawling and references sitemap.
- Confirm public job is present in `/sitemap.xml`.
- Confirm filtered `/jobs?role=...` pages are expected to be noindex.
- Confirm job detail page is not blocked by inactive status.
- Submit sitemap in Google Search Console and wait; indexing timing is controlled by Google.

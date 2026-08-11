# Google Jobs Optimization

## What changed

The individual job detail page JSON-LD was audited and tightened so `JobPosting` schema is only emitted for jobs that are eligible for public Google Jobs markup:

- `status = 'active'`
- `active = true`
- not expired under the current 30-day listing rule

The sitemap includes every publicly visible job, based on `status = 'active'` and `active = true`; `expires_at` is not a public visibility or sitemap gate.

## Where schema is generated

`JobPosting` structured data is generated in `app/jobs/[id]/page.tsx` by `buildJobPostingSchema()` and rendered as an `application/ld+json` script in the same page component.

This is the only `JobPosting` schema location. Other JSON-LD scripts in the app are site/page schemas, not job posting schemas.

## Schema placement and eligibility

`JobPosting` schema is rendered only on individual job detail pages under `/jobs/[id]` or their slug equivalent.

Schema is not rendered on:

- `/jobs` listing pages
- dashboard pages
- admin pages
- rejected, pending, paused, draft, inactive, or archived jobs
- expired jobs
- not-found job detail responses

The page may still display a non-schema not-found state for unavailable jobs, but it will not output `JobPosting` JSON-LD.

## Included fields

Eligible job detail pages include these required `JobPosting` fields:

- `title` from the job record
- `description` from the job record, cleaned for readable structured data
- `datePosted` using `approved_at` when present, otherwise `created_at`
- `validThrough` based on the listing expiration rule
- `hiringOrganization.name` from the restaurant/employer name
- `jobLocation.address` with available street address, city, state, and `US` country

Recommended fields included when reliable data exists:

- `employmentType`, mapped to Google-supported values when possible
- `baseSalary`, when `pay_range` can be parsed into numeric salary data
- `directApply: true`, because candidates can submit interest directly from the job detail page
- `hiringOrganization.logo`, using the site logo
- `hiringOrganization.sameAs`, when `company_website` exists
- `identifier`, using the stable job ID and organization context
- `jobBenefits`, parsed from the existing `Benefits:` line when present in the stored description
- `industry`, using the restaurant hiring board's reliable site-level industry
- `occupationalCategory`, using `role_category` when present
- `url` and `mainEntityOfPage`, using the canonical job detail URL

## Fields intentionally not included yet

These fields are not emitted because the current job records do not provide reliable dedicated data for them:

- `applicantLocationRequirements`: there is no explicit applicant residency/location restriction field.
- Employer-specific logo: no reliable employer logo URL field is currently selected by the job detail query.
- Separate structured minimum/maximum/rate fields: the app stores pay as `pay_range` text, so `baseSalary` is emitted only when the text can be parsed safely.
- Separate benefits array column: benefits currently appear in composed job description text, so the schema only parses the existing `Benefits:` line when available.

Do not add these fields until the app stores reliable source data for them.

## `validThrough` calculation

Listings follow the existing 30-day expiration model documented in Supabase job-expiration SQL.

`validThrough` is calculated as:

1. Use `approved_at` as the posting/expiration base date when present.
2. Fall back to `created_at` if `approved_at` is unavailable.
3. Add 30 days.
4. Output the result as an ISO date/time string.

Jobs past `validThrough` do not output `JobPosting` schema. They can remain on the public page and in the sitemap until the daily auto-renew cron advances `expires_at`.

## Sitemap behavior

The sitemap is generated in `app/sitemap.ts`.

Job URLs are included only when:

- `status = 'active'`
- `active = true`

The sitemap does not independently check the 30-day structured-data validity window.

Sitemap job URLs use `getJobPath()` and the same slug map approach used by job pages so sitemap URLs match canonical job detail URLs.

## Metadata and canonical URLs

Job detail metadata is generated in `generateMetadata()` inside `app/jobs/[id]/page.tsx`.

Active job pages include:

- a concise title with role, restaurant name, and location
- a concise meta description with restaurant, title, location, and pay when available
- canonical URL matching the resolved job detail path
- Open Graph title and description matching the page metadata

Unavailable job pages return noindex robots metadata.

## How to test with Google Rich Results Test

1. Deploy the changes.
2. Open the production URL for 3-5 active, approved job detail pages with future renewal dates.
3. Test each URL in Google Rich Results Test: <https://search.google.com/test/rich-results>
4. Confirm each eligible job page detects a valid `JobPosting` item.
5. Test at least one paused, rejected, or inactive job detail URL and confirm no `JobPosting` item appears; also confirm an overdue active job temporarily omits schema until renewal.
6. Open the rendered page source and confirm the JSON-LD is valid JSON inside one `application/ld+json` script for the job detail page.
7. Open `/sitemap.xml` and confirm active job URLs are present while paused, rejected, and inactive jobs are absent.

## What to monitor in Google Search Console

Monitor:

- Job posting rich result enhancements and validation errors
- Page indexing status for job detail URLs
- Sitemap discovery and fetch status
- Crawl stats after publishing new jobs
- Search performance for job detail URLs and job-intent queries
- Manual actions or policy warnings related to job postings
- Drops in valid job posting count after jobs expire or are paused

## Important note

Valid schema does not guarantee placement in Google Jobs. Google still considers site trust, job freshness, job quality, search relevance, location relevance, competition, and whether the page is indexed.

Expected timing after indexing:

- Initial visibility can take 1-4 weeks.
- More consistent results can take 1-3 months as job volume and site trust grow.

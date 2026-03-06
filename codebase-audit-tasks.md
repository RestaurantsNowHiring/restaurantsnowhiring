# Codebase Audit: Proposed Fix Tasks

## 1) Typo fix task
**Issue:** The contact email shown to users is misspelled as `Team@ReataurantsNOWHiring.com`.

**Why it matters:** Users copying this address may send messages to the wrong recipient (or fail delivery), causing lost support inquiries.

**Proposed task:**
- Update the displayed email string to `Team@RestaurantsNOWHiring.com` in the contact page.
- Verify any mailto links or backend destinations use the same corrected spelling.

**Acceptance criteria:**
- Contact page displays `Team@RestaurantsNOWHiring.com` consistently.
- No remaining references to `ReataurantsNOWHiring.com` in the repo.

---

## 2) Bug fix task
**Issue:** Role filters are decoded with `decodeURIComponent` in `app/jobs/page.tsx` even though Next.js search params are already decoded, which can throw `URIError: URI malformed` for malformed `%` input and break page rendering.

**Why it matters:** A crafted or malformed URL query can crash the jobs page before rendering content.

**Proposed task:**
- Remove manual `decodeURIComponent` calls and normalize values safely (`String(raw).trim()` etc.).
- Add defensive parsing for role query params and ignore malformed values without throwing.

**Acceptance criteria:**
- `/jobs?role=Line%20Cook` and `/jobs?role=%` render without runtime exceptions.
- Role filtering still works for single and multi-value queries.

---

## 3) Code comment / documentation discrepancy task
**Issue:** `README.md` is still the default Next.js scaffold and does not describe this app’s purpose, setup needs (Supabase env vars), or main routes.

**Why it matters:** New contributors cannot reliably run or understand the project from the current docs.

**Proposed task:**
- Replace scaffold README content with project-specific documentation:
  - app purpose and key routes
  - required environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
  - local development and lint/build commands
  - high-level architecture notes (App Router + Supabase)

**Acceptance criteria:**
- README contains project-specific setup and usage instructions.
- A new developer can run the app locally from README alone.

---

## 4) Test improvement task
**Issue:** There is no automated test coverage for critical query/filter behavior on the jobs listing page.

**Why it matters:** Regressions in filtering logic or query parsing can ship unnoticed.

**Proposed task:**
- Introduce a lightweight test setup (e.g., Vitest + React Testing Library).
- Add unit tests for role query parsing behavior in `app/jobs/page.tsx` (extract helper if needed):
  - single role
  - multiple roles
  - empty/whitespace role
  - malformed `%` value handling

**Acceptance criteria:**
- Test suite runs in CI/local via `npm test`.
- Parsing/filter tests pass and protect against malformed query regressions.

# Universal Free First Job entry foundation

`/post-free` is a discoverable entry point, not a bearer credential and not proof of eligibility. Admin-issued `/promotional-post/<token>` links remain a private way to bypass only the public eligibility-entry step. Both paths converge on the existing `promotional_invitations` lifecycle.

## Enforced by the database foundation

- Browser roles cannot write invitations or entry-attempt records.
- Every promotional job must use `source_type = 'outreach_free'` and an existing invitation.
- Before redemption, the invitation must be unrevoked, unexpired, email-verified, and marked eligible by server-side logic.
- A promotional job must be created inactive and pending, without `approved_at`; publication is a later Admin action.
- Partial unique indexes allow only one redeemed promotional job for a normalized contact email and only one for a company identity.
- A server-only attempt ledger supports rate-limit queries by a 32-byte IP digest and normalized email without retaining raw IP addresses.
- Outreach-free jobs remain excluded from the existing auto-renew function. Nothing in this foundation invokes billing or Stripe.

## Deferred to the public submission phase

The future server endpoint—not browser state—will normalize email, validate or establish the authoritative company record, generate verification secrets, set eligibility/verification state, and write the attempt ledger. It will enforce concrete rolling rate limits by keyed IP digest and normalized email before accepting a request. A server secret for keyed IP hashing and a retention cleanup schedule should be added with that endpoint.

Disposable and non-business addresses will be handled server-side with a maintained disposable-domain denylist. Consumer email domains will not automatically establish company identity: they will require domain-independent company validation and may be routed to manual Admin review. The exact provider/list and policy are intentionally deferred so they are deployed atomically with the submission endpoint rather than represented as browser validation.

The submission API must accept no browser-controlled source type, billing state, company ownership, verification state, eligibility result, or approval state. It must not create employer accounts, billing records, Stripe updates, or active jobs.

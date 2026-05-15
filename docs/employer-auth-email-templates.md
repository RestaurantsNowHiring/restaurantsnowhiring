# Employer auth email templates

RestaurantsNOWHiring.com uses Supabase for employer signup confirmation and password reset links, plus a Resend-powered team invitation email for employer team access.

## Supabase-hosted auth templates

Copy these HTML files into the matching Supabase Dashboard email template screens:

| Supabase template | Local file | Suggested subject |
| --- | --- | --- |
| Confirm signup | `supabase/templates/confirmation.html` | `Confirm your RestaurantsNOWHiring.com account` |
| Reset password / Recovery | `supabase/templates/recovery.html` | `Reset your RestaurantsNOWHiring.com password` |
| Invite user | `supabase/templates/invite.html` | `You’re invited to RestaurantsNOWHiring.com` |

These templates intentionally keep Supabase’s `{{ .ConfirmationURL }}` token intact in the CTA `href`. Do not replace that value with a hard-coded URL; Supabase generates the secure verification, recovery, or invite link at send time.

## Custom employer team invitations

Employer team invitations sent from the dashboard use `lib/teamInviteEmail.ts`, which renders the shared premium RestaurantsNOWHiring.com layout from `lib/emailTemplates.ts`.

The custom invitation includes the available account context:

- Employer Account Name
- Access Level
- Invited By

## Brand requirements covered

- Primary green: `#35806e`
- Pure white outer email background with a warm off-white/cream rounded card
- Rounded cards and pill-shaped CTA buttons
- Centered brand header: `RestaurantsNOWHiring.com` and `Restaurant Hiring Platform`
- Supporting line: `Built for restaurant operators, hiring managers, and restaurant teams.`
- Subtle footer: `RestaurantsNOWHiring.com` / `Hiring built for restaurants.`
- Mobile responsive media queries for padding, typography, and card shape

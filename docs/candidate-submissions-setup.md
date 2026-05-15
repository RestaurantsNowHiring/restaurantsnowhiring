# Candidate submissions Supabase setup

Run `supabase/schema/candidate-submissions.sql` in the Supabase SQL Editor before enabling candidate submissions in production.

## What it creates

1. `public.candidate_submissions` for job seeker interest submissions.
2. Indexes for job/employer dashboard reads ordered by newest first.
3. RLS policies allowing:
   - employers to read/update submissions for jobs they own by `employer_user_id` or `employer_email`,
   - admins in `public.admin_users` or `team@restaurantsnowhiring.com` to read/update submissions.
4. A private Supabase Storage bucket named `candidate-resumes` with:
   - `public = false`,
   - `file_size_limit = 5242880` (5MB),
   - allowed MIME types for PDF, DOC, and DOCX resumes.

## Runtime environment variables

The server routes require these existing variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Candidate email notifications use the existing Resend integration:

- `RESEND_API_KEY`
- optional `CANDIDATE_NOTIFICATION_FROM`
- optional fallback `CONTACT_NOTIFICATION_FROM`
- optional `NEXT_PUBLIC_SITE_URL` for dashboard links in email bodies

## Security model

Public job seekers submit through `/api/jobs/[id]/candidate-submissions`; browser clients never receive service-role credentials. The API validates active public job status, required fields, resume MIME type/extension, and the 5MB size limit before uploading to the private `candidate-resumes` bucket and inserting `candidate_submissions`.

Employers load candidates and create resume signed URLs through authenticated server routes under `/api/employer/candidate-submissions`. Resume signed URLs expire after five minutes and are only returned after the server verifies that the signed-in employer owns the submission's job.

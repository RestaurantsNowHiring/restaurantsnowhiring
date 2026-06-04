# RestaurantsNowHiring.com Codebase Guide

## Purpose
This document explains what each major part of the application does.

## Core Stack
- Next.js
- React
- TypeScript
- Supabase
- Stripe
- Tailwind CSS
- Vercel

## Public Site
### Home Page
Purpose: Introduces RestaurantsNowHiring and drives users to browse jobs or post jobs.

### Jobs Page
Purpose: Lists active jobs.

Important rule:
A job is visible only when:
- status = active
- active = true

### Job Detail Page
Purpose: Displays a single job and increments view count.

## Employer Portal
### Signup
Creates a Supabase Auth account.

### Login
Creates an authenticated session.

### Dashboard
Shows:
- Jobs
- Views
- Status
- Edit actions

### Post Job
Multi-step form used to create jobs.

## Admin Portal
### Pending Jobs
Review newly submitted jobs.

### Approve
Sets:
- status = active
- active = true

### Reject
Sets:
- status = rejected
- active = false

## Team Access System
### employer_accounts
Stores employer organizations.

### employer_team_members
Stores team access.

Statuses:
- pending
- active
- removed

### Invite Acceptance
Function:
acceptPendingTeamInvitesForCurrentUser()

Purpose:
- Match invite to logged in user
- Link auth account
- Activate membership

## Billing
Stripe handles subscriptions.

Current model:
- 30 day free trial
- $9 per job every 30 days

## SEO
### sitemap.xml
Contains:
- Home
- Jobs
- About
- Contact
- Privacy
- Terms
- Job pages

### robots.txt
Allows search engine crawling.

## Database Tables
### jobs
Stores job ads.

### employer_accounts
Stores employer organizations.

### employer_team_members
Stores team members.

### employer_billing
Stores subscription information.

## Future Improvement
Expand this document so every file includes:
- Purpose
- Inputs
- Outputs
- Dependencies
- Common troubleshooting steps

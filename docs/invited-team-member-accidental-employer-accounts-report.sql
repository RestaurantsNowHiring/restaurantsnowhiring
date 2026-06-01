-- Report candidate employer accounts that appear to have been accidentally
-- provisioned when an invited team member signed up or logged in.
--
-- Review these rows manually before deleting or merging data. A suspected
-- accidental account is an employer_accounts row whose owner_email also appears
-- as a team member on a different employer account.

with invited_memberships as (
  select
    member.id as invited_member_id,
    member.account_id as invited_account_id,
    member.email as invited_email,
    member.user_id as invited_user_id,
    member.role as invited_role,
    member.status as invited_status,
    member.created_at as invite_created_at,
    member.updated_at as invite_updated_at
  from public.employer_team_members member
), suspected_accounts as (
  select
    account.id as suspected_account_id,
    account.owner_user_id as suspected_owner_user_id,
    account.owner_email as suspected_owner_email,
    account.account_name as suspected_account_name,
    account.restaurant_brand_name as suspected_restaurant_brand_name,
    account.company_name as suspected_company_name,
    account.created_at as suspected_account_created_at,
    account.updated_at as suspected_account_updated_at,
    invited.invited_member_id,
    invited.invited_account_id,
    invited.invited_email,
    invited.invited_user_id,
    invited.invited_role,
    invited.invited_status,
    invited.invite_created_at,
    invited.invite_updated_at
  from public.employer_accounts account
  join invited_memberships invited
    on lower(invited.invited_email) = lower(account.owner_email)
   and invited.invited_account_id <> account.id
  where invited.invite_created_at <= account.created_at
)
select
  suspected.suspected_account_id,
  suspected.suspected_owner_user_id,
  suspected.suspected_owner_email,
  suspected.suspected_account_name,
  suspected.suspected_restaurant_brand_name,
  suspected.suspected_company_name,
  suspected.suspected_account_created_at,
  suspected.suspected_account_updated_at,
  suspected.invited_member_id,
  suspected.invited_account_id,
  legitimate_account.account_name as invited_account_name,
  legitimate_account.restaurant_brand_name as invited_restaurant_brand_name,
  legitimate_account.company_name as invited_company_name,
  suspected.invited_role,
  suspected.invited_status,
  suspected.invite_created_at,
  suspected.invite_updated_at,
  coalesce(profile_counts.profile_count, 0) as suspected_profile_count,
  coalesce(billing_counts.billing_count, 0) as suspected_billing_count,
  coalesce(job_counts.job_count, 0) as suspected_job_count,
  coalesce(owner_member_counts.owner_member_count, 0) as suspected_account_owner_member_count
from suspected_accounts suspected
join public.employer_accounts legitimate_account
  on legitimate_account.id = suspected.invited_account_id
left join lateral (
  select count(*) as profile_count
  from public.employer_profiles profile
  where profile.employer_account_id = suspected.suspected_account_id
     or profile.user_id = suspected.suspected_owner_user_id
) profile_counts on true
left join lateral (
  select count(*) as billing_count
  from public.employer_billing billing
  where billing.employer_account_id = suspected.suspected_account_id
     or billing.user_id = suspected.suspected_owner_user_id
) billing_counts on true
left join lateral (
  select count(*) as job_count
  from public.jobs job
  where job.employer_account_id = suspected.suspected_account_id
) job_counts on true
left join lateral (
  select count(*) as owner_member_count
  from public.employer_team_members member
  where member.account_id = suspected.suspected_account_id
    and member.role = 'account_owner'
    and lower(member.email) = lower(suspected.suspected_owner_email)
) owner_member_counts on true
order by suspected.suspected_account_created_at desc, suspected.suspected_owner_email;

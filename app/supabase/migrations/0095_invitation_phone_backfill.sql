-- =====================================================================
-- 0095_invitation_phone_backfill.sql   (Platform layer — Auth)
--
-- Two latent format bugs surfaced when an invite staged as a bare national
-- number ("6305295757") hit the invitation-aware login:
--   1) invitation_for_phone() compared raw digits, so "916305295757" (the
--      E.164 form the app passes) did NOT match "6305295757".
--   2) handle_new_auth_user() joins invites on exact `phone = auth.users.phone`
--      (which is E.164 without '+': "916305295757"), so even a matched login
--      would have missed the invite and provisioned the user as pending_review.
--
-- This migration (a) re-normalizes every staged invite to canonical E.164
-- digits without '+', and (b) makes invitation_for_phone() tolerant of either
-- form (national vs. country-prefixed) so a stray separator or prefix can
-- never strand an invite again.
-- =====================================================================

-- (a) Backfill: any pending/taken invite whose digits look like a bare
--     national mobile (starts 6-9, exactly 10 digits) -> prefix '91'.
--     Anything already E.164 or odd-shaped is reduced to digits unchanged.
with n as (
  select id, regexp_replace(phone, '\D', '', 'g') as d
  from public.user_invitations
)
update public.user_invitations i
set phone = case
  when n.d ~ '^[6-9][0-9]{9}$' then '91' || n.d
  else n.d
end
from n
where i.id = n.id;

-- (b) Tolerant matching: compare both sides, accepting a country-code prefix
--     on either side. equal forms match directly; otherwise the shorter side
--     is the suffix of the longer side (drop the leading CC).
create or replace function public.invitation_for_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with d as (
    select regexp_replace(i.phone, '\D', '', 'g') as a,
           regexp_replace(p_phone, '\D', '', 'g') as b
      from public.user_invitations i
     where i.status = 'pending'
       and i.expires_at > now()
  )
  select exists (
    select 1 from d
     where a = b
        or a = right(b, least(length(a), 10))
        or b = right(a, least(length(b), 10))
  );
$$;

alter function public.invitation_for_phone(text) set search_path = public;

revoke execute on function public.invitation_for_phone(text) from public;
grant  execute on function public.invitation_for_phone(text) to anon, authenticated;
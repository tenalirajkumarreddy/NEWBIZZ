-- =====================================================================
-- 0094_invitation_phone_rpc.sql   (Platform layer — Auth)
--
-- Invitation-aware OTP login. The app is invitation-only (OTP login never
-- self-creates an account by default), but an invited person has NO Supabase
-- auth identity yet — admin_create_user only stages a user_invitations row.
-- That meant their first OTP attempt hit "Signups not allowed for otp"
-- (shouldCreateUser=false + no existing user) and the bridge trigger never
-- fired.
--
-- This RPC lets the (anonymous) login screen ask "does a live pending invite
-- exist for this phone?" and set shouldCreateUser=true only then. Enrollment
-- stays restricted to invited phones; the trigger consumes the invite and
-- provisions the active profile + roles exactly as before.
--
-- Phone matching mirrors auth.users.phone (E.164 digits WITHOUT '+') and the
-- handle_new_auth_user exact-equality join. Digits-only comparison tolerates
-- invites staged with '+91 …' / formatting so a stray separator can't strand
-- an invite.
-- =====================================================================

create or replace function public.invitation_for_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.user_invitations
     where regexp_replace(phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
       and status = 'pending'
       and expires_at > now()
  );
$$;

alter function public.invitation_for_phone(text) set search_path = public;

revoke execute on function public.invitation_for_phone(text) from public;
grant  execute on function public.invitation_for_phone(text) to anon, authenticated;
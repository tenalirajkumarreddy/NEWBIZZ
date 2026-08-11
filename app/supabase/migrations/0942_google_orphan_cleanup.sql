-- =====================================================================
-- 0942_google_orphan_cleanup.sql
--
-- Self-service cleanup for orphaned Google sign-ins. A fresh Google OAuth
-- sign-in creates an auth.users row + a public.users row (status
-- pending_review, phone NULL). That account can never be signed into, so
-- instead of leaving a zombie in the admin Pending queue, the OAuth callback
-- calls this RPC to delete both rows for the just-signed-in caller.
--
-- Guards: only ever deletes the CALLER's own row (auth.uid()), and only when
-- phone IS NULL — real identities sign up by phone, so a phone-bearing row
-- can never be touched here. Security definer so it can write auth.users;
-- the caller never passes an id. Idempotent: calling twice just returns
-- false the second time (the rows are gone).
-- =====================================================================

create or replace function public.cleanup_orphan_google_user()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := public.current_app_user();
  v_phone text;
begin
  if v_uid is null then
    return false;
  end if;

  -- Only a phone-less row is an orphan; anything else must not be touched.
  select u.phone into v_phone
    from public.users u
   where u.id = v_uid;

  if v_phone is not null then
    return false;
  end if;

  delete from public.users where id = v_uid;
  delete from auth.users where id = v_uid;

  return true;
end $$;

alter function public.cleanup_orphan_google_user() set search_path = public;

revoke execute on function public.cleanup_orphan_google_user() from anon, public;
grant  execute on function public.cleanup_orphan_google_user() to authenticated;

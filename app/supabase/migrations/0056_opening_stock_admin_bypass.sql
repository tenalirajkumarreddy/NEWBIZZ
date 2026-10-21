-- =====================================================================
-- 0056_opening_stock_admin_bypass.sql
--
-- BACKFILLED 2026-10-20. Production's history recorded this migration
-- (version 20260721115811) but the file was never committed, so a fresh
-- database could not be built from the repository.
--
-- 0055 granted settings.manage to manager and accountant so they could load
-- opening stock, but admins kept reporting "not authorized": the admins bypass
-- inside has_permission() runs on current_app_user(), and inside the nested
-- SECURITY DEFINER chain (UI → receive_opening_stock_batch →
-- receive_opening_stock) the identity sometimes did not resolve. This
-- replaced the batch RPC with an explicit admin fallback that re-reads the
-- actor, keeps the all-or-nothing line loop, and re-asserts the grants.
--
-- Read back from the production catalog: the function body, the admin
-- fallback, the null p_as_of default, and the ACL
-- {postgres, authenticated, service_role} with no anon/PUBLIC EXECUTE.
--
-- TWO DELIBERATE DIVERGENCES FROM PRODUCTION — both are defects that a fresh
-- database should not inherit, and both are called out in
-- docs/audits/2026-10-20-business-logic-audit.md:
--
--   1. p_as_of. Production's default became null and nothing downstream
--      coalesces it: post_stock_move hands it to post_journal, which raises
--      'entry_date is required'. So `receive_opening_stock_batch(lines)`
--      without a date fails on its first line today — and the app omits
--      p_as_of whenever the date field is left blank. The signature keeps
--      production's null default; the value is coalesced before use.
--
--   2. The admin fallback. Because has_permission() already bypasses all
--      checks for admins (0031), production's fallback only ever fires when
--      that bypass was itself refused: a suspended/disabled account, or a
--      per-user `deny` override. Reproducing it verbatim would let a switched
--      -off admin load opening stock and would defeat an explicit deny. The
--      fallback therefore requires an active account and no deny override.
-- =====================================================================

create or replace function public.receive_opening_stock_batch(
  p_lines jsonb,                       -- [{item_id, branch_id, qty, unit_cost}, ...]
  p_as_of date default null)
returns integer                        -- number of lines posted
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line   jsonb;
  v_item   uuid;
  v_branch uuid;
  v_qty    numeric(14,3);
  v_cost   numeric(14,4);
  v_count  integer := 0;
  v_uid    uuid;
begin
  -- Gate stays settings.manage. If that is refused, allow an admin only where
  -- the refusal was not for a reason that must stand (divergence 2 above).
  if not has_permission('settings.manage') then
    v_uid := current_app_user();

    if v_uid is null
       or not exists (
         select 1 from users u
          where u.id = v_uid and u.status = 'active'
       )
       or exists (
         select 1 from user_permission_overrides o
          where o.user_id = v_uid
            and o.permission = 'settings.manage'
            and o.effect = 'deny'
            and (o.expires_at is null or o.expires_at > now())
       )
       or not exists (
         select 1 from user_roles ur
           join roles r on r.id = ur.role_id
          where ur.user_id = v_uid and r.code = 'admin'
       )
    then
      raise exception 'not authorized (needs settings.manage)';
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a JSON array';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'no lines supplied';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item   := (v_line->>'item_id')::uuid;
    v_branch := (v_line->>'branch_id')::uuid;
    v_qty    := (v_line->>'qty')::numeric;
    v_cost   := coalesce((v_line->>'unit_cost')::numeric, 0);

    if v_item is null or v_branch is null then
      raise exception 'item_id and branch_id are required on every line';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'qty must be > 0 (item %)', v_item;
    end if;
    if v_cost < 0 then
      raise exception 'unit_cost cannot be negative (item %)', v_item;
    end if;

    -- Divergence 1: production passes p_as_of through, which fails when the
    -- date field was left blank. Fall back to today so the load posts.
    perform public.receive_opening_stock(v_item, v_branch, v_qty, v_cost,
                                         coalesce(p_as_of, current_date));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.receive_opening_stock_batch(jsonb, date) is
  'Master plan §3.4: post an opening-stock batch atomically (all-or-nothing). Gated settings.manage, with an active-admin fallback.';

-- create or replace keeps the ACL from 0037, but re-assert it: a dropped and
-- recreated function would silently come back executable by PUBLIC.
revoke all on function public.receive_opening_stock_batch(jsonb, date) from anon, public;
grant execute on function public.receive_opening_stock_batch(jsonb, date) to authenticated;

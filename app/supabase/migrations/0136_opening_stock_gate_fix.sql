-- =====================================================================
-- 0136_opening_stock_gate_fix.sql
--
-- Closes the two defects 0056 left in production (see
-- docs/audits/2026-10-20-business-logic-audit.md, "Two live defects found in
-- 0056"):
--
--   1. The admin fallback only checked user_roles for role 'admin'. Because
--      has_permission() already bypasses every check for admins (0031), the
--      fallback's only effect was to re-admit an admin after a legitimate
--      refusal — a suspended/disabled account, or a per-user `deny` override.
--      Verified in a clone with production's verbatim body: a suspended admin
--      posted an opening batch. Opening stock is an inventory write plus a
--      journal entry, so that is a money-and-stock hole, not a UX wrinkle.
--
--   2. p_as_of defaulted to null and nothing downstream coalesced it:
--      post_stock_move → post_journal raises 'entry_date is required'. The app
--      omits p_as_of when the date field is left blank, so that path failed.
--
-- The gate stays settings.manage. The fallback now requires an active account
-- and no explicit deny, and the date falls back to today. Behaviour for every
-- other caller — including the null signature default — is unchanged.
--
-- Covered by tests/0965_opening_stock_authorization.sql.
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
  if not has_permission('settings.manage') then
    v_uid := current_app_user();

    -- Re-admit an admin only where nothing says the account must stay out:
    -- the status kill-switch and an explicit deny both outrank the role.
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

    -- A blank date means "as of today", not "no date".
    perform public.receive_opening_stock(v_item, v_branch, v_qty, v_cost,
                                         coalesce(p_as_of, current_date));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.receive_opening_stock_batch(jsonb, date) is
  'Master plan §3.4: post an opening-stock batch atomically (all-or-nothing). Gated settings.manage; an admin fallback applies only to an active account with no deny override.';

-- create or replace preserves the ACL, but a dropped-and-recreated function
-- would come back executable by PUBLIC. Re-assert on every deploy.
revoke all on function public.receive_opening_stock_batch(jsonb, date) from anon, public;
grant execute on function public.receive_opening_stock_batch(jsonb, date) to authenticated;

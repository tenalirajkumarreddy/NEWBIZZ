-- =====================================================================
-- 0037_opening_stock_batch.sql
-- Master plan §3.4 (Data Migration & Opening Balances) — opening stock load.
--
-- The per-item receive_opening_stock() already exists (0007). §3.4 requires
-- a batch commit that is ALL-OR-NOTHING in one transaction (Invariant 4):
-- either every opening line posts or none does. This wrapper provides that,
-- gated to admin setup (settings.manage), and tags each move source='opening'
-- so opening loads are distinguishable and auditable.
--
-- Accounting per line (via post_stock_move → post_journal):
--   Dr <inventory account for item type>   qty * unit_cost
--     Cr 3900 Opening Balance Equity        qty * unit_cost
-- so the Trial Balance stays balanced after an opening load.
-- =====================================================================

create or replace function receive_opening_stock_batch(
  p_lines jsonb,                       -- [{item_id, branch_id, qty, unit_cost}, ...]
  p_as_of date default current_date)
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
begin
  -- Authorization (Invariant 3): opening load is an admin setup action.
  if not has_permission('settings.manage') then
    raise exception 'receive_opening_stock_batch: not authorized (needs settings.manage)';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'receive_opening_stock_batch: p_lines must be a JSON array';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'receive_opening_stock_batch: no lines supplied';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item   := (v_line->>'item_id')::uuid;
    v_branch := (v_line->>'branch_id')::uuid;
    v_qty    := (v_line->>'qty')::numeric;
    v_cost   := coalesce((v_line->>'unit_cost')::numeric, 0);

    if v_item is null or v_branch is null then
      raise exception 'receive_opening_stock_batch: item_id and branch_id are required on every line';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'receive_opening_stock_batch: qty must be > 0 (item %)', v_item;
    end if;
    if v_cost < 0 then
      raise exception 'receive_opening_stock_batch: unit_cost cannot be negative (item %)', v_item;
    end if;

    -- Reuses the audited, WAC-aware primitive; source tag = 'opening'.
    perform receive_opening_stock(v_item, v_branch, v_qty, v_cost, p_as_of);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function receive_opening_stock_batch is
  'Master plan §3.4: post an opening-stock batch atomically (all-or-nothing). Gated settings.manage.';

-- Hardening (mirror 0012): pin search_path already set; revoke anon/public.
revoke all on function receive_opening_stock_batch(jsonb, date) from anon, public;
grant execute on function receive_opening_stock_batch(jsonb, date) to authenticated;

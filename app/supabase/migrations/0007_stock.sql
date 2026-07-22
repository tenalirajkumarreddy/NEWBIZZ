-- =====================================================================
-- 0007_stock.sql  ·  Phase 1 — inventory quantity + weighted-average value
--
-- Invariant 2: `stock` (+ user_stock_holdings) is the ONLY source of truth
--   for physical QUANTITY. Invariant 1: journal_lines is truth for VALUE.
-- This module keeps the two tied: every value-bearing move calls post_journal
-- AND updates stock in the SAME transaction via post_stock_move (Invariant 3,4).
--
-- Valuation method: weighted-average cost (WAC) per (item, branch).
--   new_avg = (qty_on_hand*avg + in_qty*in_cost) / (qty_on_hand + in_qty)
--   issues leave avg unchanged and value out at the current avg.
-- =====================================================================

-- movement reasons — drive which ledger accounts a move touches.
create type stock_move_type as enum (
  'opening',          -- initial load        Dr inventory / Cr opening equity
  'purchase_in',      -- GRN receipt         Dr inventory / Cr GRN-clearing (Phase 2)
  'sale_out',         -- delivery/invoice    Dr COGS / Cr inventory
  'production_in',    -- output of a run     Dr FG/WIP / Cr WIP-clearing (Phase 3)
  'production_out',   -- consumption in run  Dr WIP / Cr RM (Phase 3)
  'adjust_in',        -- positive adjustment Dr inventory / Cr adjustment
  'adjust_out',       -- shrinkage/damage    Dr adjustment / Cr inventory
  'transfer_out',     -- branch transfer     Cr inventory @ from-branch
  'transfer_in'       -- branch transfer     Dr inventory @ to-branch
);

-- ---------------------------------------------------------------------
-- stock  (on-hand qty + running WAC, per item per branch) — Invariant 2
-- ---------------------------------------------------------------------
create table stock (
  item_id       uuid not null references items(id),
  branch_id     uuid not null references branches(id),
  qty_on_hand   numeric(14,3) not null default 0,   -- TRUTH for quantity
  avg_cost      numeric(14,4) not null default 0,    -- weighted-average unit cost
  -- value = qty_on_hand * avg_cost is the carrying value; it must tie to the
  -- inventory control accounts in journal_lines (checked by a reconcile view).
  updated_at    timestamptz not null default now(),
  primary key (item_id, branch_id),
  check (qty_on_hand >= 0),                          -- no negative stock in v1
  check (avg_cost   >= 0)
);
comment on table stock is 'Source of truth for physical quantity (Invariant 2). avg_cost = weighted-average unit cost.';

-- ---------------------------------------------------------------------
-- stock_ledger  (immutable, append-only movement log) — the audit trail
-- of every quantity change; mirrors journal_lines for physical goods.
-- ---------------------------------------------------------------------
create table stock_ledger (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id),
  branch_id     uuid not null references branches(id),
  move_type     stock_move_type not null,
  qty_delta     numeric(14,3) not null,             -- signed: + in, - out
  unit_cost     numeric(14,4) not null,             -- cost used for this move
  value_delta   numeric(14,2) not null,             -- qty_delta * unit_cost (rounded)
  qty_after     numeric(14,3) not null,             -- on-hand after this move
  avg_after     numeric(14,4) not null,             -- WAC after this move
  journal_entry_id uuid references journal_entries(id),  -- the value posting, if any
  source        text,                               -- 'invoice','grn','adjustment',...
  source_id     uuid,
  moved_by      uuid references users(id),
  moved_at      timestamptz not null default now(),
  check (qty_delta <> 0)
);
create index stock_ledger_item_idx   on stock_ledger (item_id, branch_id, moved_at);
create index stock_ledger_source_idx on stock_ledger (source, source_id);
comment on table stock_ledger is 'Append-only physical movement log; qty_after/avg_after snapshot WAC after each move.';

-- append-only guard (Invariant 6 spirit for physical ledger)
create or replace function stock_ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'stock_ledger is append-only; reverse with an offsetting move';
end $$;
create trigger stock_ledger_no_change before update or delete on stock_ledger
  for each row execute function stock_ledger_immutable();

-- ---------------------------------------------------------------------
-- inventory_account_for(item_type) -> chart_of_accounts.code
-- Maps an item's type to its inventory control account.
-- ---------------------------------------------------------------------
create or replace function inventory_account_for(p_type item_type)
returns text
language sql immutable as $$
  select case p_type
    when 'raw_material'  then '1210'
    when 'wip'           then '1220'
    when 'finished_good' then '1230'
    when 'consumable'    then '1240'
    else null                       -- service: not stocked
  end;
$$;

-- ---------------------------------------------------------------------
-- post_stock_move — the ONLY way stock quantity changes (Invariant 3).
-- One transaction: update stock (qty + WAC), append stock_ledger, and post
-- the paired journal entry so value ties to the ledger (Invariants 1,2,4).
--
--   p_item, p_branch, p_move_type, p_qty(+in/-out), p_unit_cost
--   p_contra_account : the OTHER side of the value posting
--                      (COGS 5100 for sale_out, opening equity 3900 for opening,
--                       a clearing account for purchase/production, etc.)
--   p_source, p_source_id, p_entry_date
--
-- Returns the stock_ledger row id.
-- For issues (qty<0) the unit_cost used is the CURRENT avg_cost (WAC), so the
-- caller's p_unit_cost is ignored on the way out.
-- ---------------------------------------------------------------------
create or replace function post_stock_move(
  p_item uuid, p_branch uuid, p_move_type stock_move_type,
  p_qty numeric, p_unit_cost numeric default 0,
  p_contra_account text default null,
  p_source text default null, p_source_id uuid default null,
  p_entry_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type      item_type;
  v_inv_acct  text;
  v_cur_qty   numeric(14,3);
  v_cur_avg   numeric(14,4);
  v_new_qty   numeric(14,3);
  v_new_avg   numeric(14,4);
  v_unit      numeric(14,4);
  v_value     numeric(14,2);
  v_entry     uuid;
  v_ledger    uuid;
  v_actor     uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_qty = 0 then raise exception 'post_stock_move: qty cannot be zero'; end if;

  select type into v_type from items where id = p_item;
  if v_type is null then raise exception 'post_stock_move: unknown item %', p_item; end if;
  v_inv_acct := inventory_account_for(v_type);
  if v_inv_acct is null then
    raise exception 'post_stock_move: item type % is not stocked', v_type;
  end if;

  -- lock the stock row (create at zero if first move for this item/branch)
  insert into stock (item_id, branch_id) values (p_item, p_branch)
    on conflict (item_id, branch_id) do nothing;
  select qty_on_hand, avg_cost into v_cur_qty, v_cur_avg
    from stock where item_id = p_item and branch_id = p_branch for update;

  if p_qty > 0 then
    ------------------------------------------------ receipt: recompute WAC
    v_unit    := p_unit_cost;
    v_new_qty := v_cur_qty + p_qty;
    v_new_avg := case when v_new_qty = 0 then 0
                 else round(((v_cur_qty * v_cur_avg) + (p_qty * v_unit)) / v_new_qty, 4) end;
  else
    ------------------------------------------------ issue: value at current WAC
    if (v_cur_qty + p_qty) < 0 then
      raise exception 'post_stock_move: insufficient stock for item % at branch % (have %, need %)',
        p_item, p_branch, v_cur_qty, (-p_qty);
    end if;
    v_unit    := v_cur_avg;                 -- WAC, ignore caller cost on the way out
    v_new_qty := v_cur_qty + p_qty;
    v_new_avg := case when v_new_qty = 0 then 0 else v_cur_avg end;
  end if;

  v_value := round(p_qty * v_unit, 2);      -- signed money value of this move

  -- 1) update the truth (Invariant 2)
  update stock set qty_on_hand = v_new_qty, avg_cost = v_new_avg, updated_at = now()
    where item_id = p_item and branch_id = p_branch;

  -- 2) post the paired value entry (Invariant 1 & 3) if a contra account is given.
  --    inventory side carries the stock_item_id + signed stock_qty so value ties out.
  if p_contra_account is not null and v_value <> 0 then
    if p_qty > 0 then
      -- receipt: Dr inventory / Cr contra
      v_entry := post_journal(
        jsonb_build_object('entry_date', p_entry_date, 'source', coalesce(p_source,'stock'),
                           'source_id', p_source_id::text, 'narration','Stock '||p_move_type),
        jsonb_build_array(
          jsonb_build_object('account_code', v_inv_acct, 'debit', v_value, 'credit', 0,
                             'stock_item_id', p_item::text, 'stock_qty', p_qty, 'branch_id', p_branch::text),
          jsonb_build_object('account_code', p_contra_account, 'debit', 0, 'credit', v_value)));
    else
      -- issue: Dr contra (e.g. COGS) / Cr inventory
      v_entry := post_journal(
        jsonb_build_object('entry_date', p_entry_date, 'source', coalesce(p_source,'stock'),
                           'source_id', p_source_id::text, 'narration','Stock '||p_move_type),
        jsonb_build_array(
          jsonb_build_object('account_code', p_contra_account, 'debit', abs(v_value), 'credit', 0),
          jsonb_build_object('account_code', v_inv_acct, 'debit', 0, 'credit', abs(v_value),
                             'stock_item_id', p_item::text, 'stock_qty', p_qty, 'branch_id', p_branch::text)));
    end if;
  end if;

  -- 3) append the physical ledger row
  insert into stock_ledger
      (item_id, branch_id, move_type, qty_delta, unit_cost, value_delta,
       qty_after, avg_after, journal_entry_id, source, source_id, moved_by)
  values
      (p_item, p_branch, p_move_type, p_qty, v_unit, v_value,
       v_new_qty, v_new_avg, v_entry, p_source, p_source_id, v_actor)
  returning id into v_ledger;

  return v_ledger;
end $$;
comment on function post_stock_move is
  'Single gateway for quantity change. Updates WAC stock, appends stock_ledger, posts paired value entry. Invariants 1-4.';

-- ---------------------------------------------------------------------
-- receive_opening_stock(item, branch, qty, unit_cost, as_of)
-- Convenience wrapper for initial stock load: Dr inventory / Cr 3900.
-- ---------------------------------------------------------------------
create or replace function receive_opening_stock(
  p_item uuid, p_branch uuid, p_qty numeric, p_unit_cost numeric, p_as_of date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return post_stock_move(p_item, p_branch, 'opening', p_qty, p_unit_cost,
                         '3900', 'opening', null, p_as_of);
end $$;

-- ---------------------------------------------------------------------
-- stock_value_reconcile  (view) — proves qty*avg ties to ledger inventory.
-- Invariant 5 style check: physical carrying value vs journal_lines value.
-- ---------------------------------------------------------------------
create or replace view stock_value_reconcile as
with carry as (
  select inventory_account_for(i.type) as inv_account,
         round(sum(s.qty_on_hand * s.avg_cost), 2) as stock_carrying_value
    from stock s join items i on i.id = s.item_id
   group by inventory_account_for(i.type)
),
ledger as (
  select a.code as inv_account, round(sum(l.debit - l.credit), 2) as ledger_value
    from journal_lines l join chart_of_accounts a on a.id = l.account_id
   where a.code in ('1210','1220','1230','1240')
   group by a.code
)
select coalesce(c.inv_account, g.inv_account)          as inv_account,
       coalesce(c.stock_carrying_value, 0)             as stock_carrying_value,
       coalesce(g.ledger_value, 0)                     as ledger_value,
       coalesce(c.stock_carrying_value,0) - coalesce(g.ledger_value,0) as difference
  from carry c full outer join ledger g on g.inv_account = c.inv_account;
comment on view stock_value_reconcile is 'difference should be ~0: WAC carrying value vs inventory control accounts. Sides aggregated separately to avoid cross-join fan-out.';

-- =====================================================================
-- 0043_avl_debit_notes.sql  ·  Phase 2 — Approved Vendor List + Purchase
-- Returns (Debit Notes)  (§5.3, §5.5)
--
-- Two gaps in the buy-side: the AVL that links items to the suppliers that
-- sell them (with price/lead-time), and purchase returns as debit notes that
-- reduce the payable and reverse RM inventory + input GST.
--
-- Also seeds explicit number-series prefixes for the existing buy-side docs
-- (PO/GRN/BILL/PAY) — their RPCs used next_number() with the default blank
-- prefix; giving them readable prefixes is harmless (no rows exist yet).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Number-series prefixes for buy-side documents (per FY, gap-free — Inv 8).
-- ---------------------------------------------------------------------
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select d.doc_type, fy.id, d.prefix, 4, 1
from financial_years fy
cross join (values ('po','PO'), ('grn','GRN'), ('bill','BILL'),
                   ('payment','PAY'), ('debit_note','DN')) as d(doc_type, prefix)
on conflict (doc_type, fy_id) do nothing;

-- ---------------------------------------------------------------------
-- item_suppliers — the Approved Vendor List (§5.3). Which suppliers sell an
-- item, at what price/terms. `preferred` marks the default source; a partial
-- unique index enforces AT MOST ONE preferred supplier per item (audit AC).
-- INR only (no currency column, audit 3.8). BOM references items, purchases
-- reference items — the AVL is the sourcing bridge, not a BOM dependency.
-- ---------------------------------------------------------------------
create table item_suppliers (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items(id) on delete cascade,
  supplier_id    uuid not null references suppliers(id) on delete cascade,
  unit_price     numeric(14,2) not null default 0 check (unit_price >= 0),
  lead_time_days int not null default 0 check (lead_time_days >= 0),
  min_order_qty  numeric(14,3) not null default 0 check (min_order_qty >= 0),
  preferred      boolean not null default false,
  is_active      boolean not null default true,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  unique (item_id, supplier_id)
);
create index item_suppliers_item_idx on item_suppliers (item_id) where is_active;
create index item_suppliers_supplier_idx on item_suppliers (supplier_id);
-- at most one preferred supplier per item
create unique index item_suppliers_one_preferred on item_suppliers (item_id) where preferred;
comment on table item_suppliers is 'Approved Vendor List: item→supplier price/terms. One preferred per item. §5.3.';

create trigger item_suppliers_touch before update on item_suppliers
  for each row execute function touch_updated_at();

alter table item_suppliers enable row level security;
create policy read_all_auth on item_suppliers for select to authenticated using (true);
create policy manage_avl on item_suppliers for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));

-- ---------------------------------------------------------------------
-- debit_notes — purchase returns (§5.5). Reduces the supplier payable and
-- reverses RM inventory + input GST. journal_entry_id carries the truth.
-- ---------------------------------------------------------------------
create type debit_note_reason as enum ('return','rate_difference','shortage','other');
create type debit_note_status as enum ('posted','cancelled');

create table debit_notes (
  id               uuid primary key default gen_random_uuid(),
  debit_note_no    text not null,
  fy_id            uuid not null references financial_years(id),
  supplier_id      uuid not null references suppliers(id),
  purchase_bill_id uuid references supplier_bills(id),      -- optional source bill
  branch_id        uuid references branches(id),
  amount           numeric(14,2) not null check (amount > 0),   -- gross (base+tax)
  base_amount      numeric(14,2) not null default 0,            -- goods value reversed
  tax_amount       numeric(14,2) not null default 0,            -- input GST reversed
  reason           debit_note_reason not null default 'return',
  narration        text,
  status           debit_note_status not null default 'posted',
  journal_entry_id uuid references journal_entries(id),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (fy_id, debit_note_no)
);
create index debit_notes_supplier_idx on debit_notes (supplier_id, created_at);
comment on table debit_notes is 'Purchase returns: Dr AP / Cr RM inventory + input-GST reversal. §5.5.';

create table debit_note_lines (
  id             uuid primary key default gen_random_uuid(),
  debit_note_id  uuid not null references debit_notes(id) on delete cascade,
  item_id        uuid not null references items(id),
  qty            numeric(14,3) not null check (qty > 0),
  unit_cost      numeric(14,4) not null default 0,   -- WA cost at return time
  taxable_amount numeric(14,2) not null default 0,
  gst_rate       numeric(5,2) not null default 0,
  tax_amount     numeric(14,2) not null default 0,
  line_no        int not null
);
create index debit_note_lines_dn_idx on debit_note_lines (debit_note_id);

alter table debit_notes      enable row level security;
alter table debit_note_lines enable row level security;
create policy read_all_auth on debit_notes      for select to authenticated using (true);
create policy read_all_auth on debit_note_lines for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- record_purchase_return(p_supplier, p_lines, p_opts) -> debit_note id  (§5.5)
--   p_lines: [{ item_id, qty, gst_rate? }, ...]
--   p_opts:  { date?, branch_id?, purchase_bill_id?, reason?, narration? }
--
-- One transaction. Per line: move stock OUT at the current WA cost (qty only,
-- no journal — we post the value entry once, explicitly), compute the input-GST
-- to reverse at the line's gst_rate. Then post the debit-note journal:
--   Dr 2110 Accounts Payable (supplier)   gross (goods + tax)
--      Cr 1210 Raw Materials              Σ(qty × WA cost)   [goods reversed]
--      Cr 1140 Input GST Credit           Σ tax              [ITC reversed]
-- Gated on purchase.manage. Stock cannot go negative (post_stock_move guards).
-- ---------------------------------------------------------------------
create or replace function record_purchase_return(
  p_supplier uuid, p_lines jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date    date := coalesce(nullif(p_opts->>'date','')::date, current_date);
  v_fy      uuid;
  v_branch  uuid;
  v_supp_st text;
  v_line    jsonb;
  v_item    uuid; v_qty numeric(14,3); v_rate numeric(5,2);
  v_type    item_type;
  v_wac     numeric(14,4);
  v_lval    numeric(14,2); v_ltax numeric(14,2);
  v_inv_acct text;
  v_sum_goods numeric(14,2) := 0; v_sum_tax numeric(14,2) := 0;
  v_gross   numeric(14,2);
  v_ln      int := 0;
  v_je      uuid; v_dn uuid;
  v_no      text;
  v_jlines  jsonb;
  v_rlines  jsonb := '[]'::jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('purchase.manage') then
    raise exception 'record_purchase_return: not authorized (purchase.manage required)';
  end if;
  select state_code into v_supp_st from suppliers where id = p_supplier;
  if v_supp_st is null then raise exception 'record_purchase_return: unknown supplier %', p_supplier; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'record_purchase_return: at least one line required';
  end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_opts->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select gst_rate, type into v_rate, v_type from items where id = v_item;
    if v_type is null then raise exception 'record_purchase_return: unknown item %', v_item; end if;
    if v_type = 'service' then raise exception 'record_purchase_return: service item % has no stock', v_item; end if;
    v_rate := coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0);

    -- current WA cost at the branch (the value we reverse out of inventory)
    select avg_cost into v_wac from stock where item_id = v_item and branch_id = v_branch;
    v_wac := coalesce(v_wac, 0);

    -- move qty OUT, no journal (NULL contra) — value posted explicitly below.
    perform post_stock_move(v_item, v_branch, 'adjust_out', (-1 * v_qty), 0,
                            null, 'debit_note', null, v_date);

    v_inv_acct := inventory_account_for(v_type);
    v_lval := round(v_qty * v_wac, 2);
    v_ltax := round(v_lval * v_rate / 100, 2);
    v_ln   := v_ln + 1;
    v_sum_goods := v_sum_goods + v_lval;
    v_sum_tax   := v_sum_tax + v_ltax;

    v_rlines := v_rlines || jsonb_build_array(jsonb_build_object(
      'item_id', v_item::text, 'qty', v_qty, 'unit_cost', v_wac,
      'taxable_amount', v_lval, 'gst_rate', v_rate, 'tax_amount', v_ltax,
      'inv_acct', v_inv_acct, 'line_no', v_ln));
  end loop;

  if v_ln = 0 then raise exception 'record_purchase_return: nothing to return'; end if;
  v_gross := v_sum_goods + v_sum_tax;
  if v_gross <= 0 then raise exception 'record_purchase_return: zero-value return'; end if;

  v_no := next_number('debit_note', v_date);
  insert into debit_notes (debit_note_no, fy_id, supplier_id, purchase_bill_id, branch_id,
                           amount, base_amount, tax_amount, reason, narration, status,
                           created_by)
  values (v_no, v_fy, p_supplier, nullif(p_opts->>'purchase_bill_id','')::uuid, v_branch,
          v_gross, v_sum_goods, v_sum_tax,
          coalesce(nullif(p_opts->>'reason','')::debit_note_reason, 'return'),
          nullif(p_opts->>'narration',''), 'posted', v_actor)
  returning id into v_dn;

  -- value entry: Dr AP (gross) / Cr inventory (goods) + Cr Input GST (tax)
  v_jlines := jsonb_build_array(
    jsonb_build_object('account_code','2110','debit', v_gross, 'credit', 0,
                       'party_type','supplier','party_id', p_supplier::text));
  for v_line in select * from jsonb_array_elements(v_rlines) loop
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code', v_line->>'inv_acct', 'debit', 0,
                         'credit', (v_line->>'taxable_amount')::numeric,
                         'stock_item_id', v_line->>'item_id',
                         'stock_qty', -1 * (v_line->>'qty')::numeric,
                         'branch_id', v_branch::text));
  end loop;
  if v_sum_tax > 0 then
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code','1140','debit', 0, 'credit', v_sum_tax));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','debit_note', 'source_id', v_dn::text,
                       'narration', coalesce(nullif(p_opts->>'narration',''),
                         'Purchase return / debit note '||v_no)),
    v_jlines);

  update debit_notes set journal_entry_id = v_je where id = v_dn;

  for v_line in select * from jsonb_array_elements(v_rlines) loop
    insert into debit_note_lines (debit_note_id, item_id, qty, unit_cost,
                                  taxable_amount, gst_rate, tax_amount, line_no)
    values (v_dn, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
            (v_line->>'unit_cost')::numeric, (v_line->>'taxable_amount')::numeric,
            (v_line->>'gst_rate')::numeric, (v_line->>'tax_amount')::numeric,
            (v_line->>'line_no')::int);
  end loop;

  perform write_audit('post','debit_notes', v_dn::text,
            format('Debit note %s to supplier: %s', v_no, v_gross),
            jsonb_build_object('debit_note_no', v_no, 'amount', v_gross, 'lines', v_ln), v_actor);
  return v_dn;
end $$;
comment on function record_purchase_return is 'Purchase return: stock out at WAC, Dr AP / Cr RM inventory + Cr input-GST reversal, as a debit note. §5.5.';

revoke all on function record_purchase_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function record_purchase_return(uuid, jsonb, jsonb) to authenticated;

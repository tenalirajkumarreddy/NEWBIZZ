-- =====================================================================
-- 0014_purchases.sql  ·  Phase 2 — purchase orders + goods receipt (GRN)
--
-- Buy-side three-way flow (mirror of the sell side):
--   place_purchase_order  -> demand only, NO ledger, NO stock (like place_order)
--   post_grn (goods in)   -> the STOCK event:
--        stock IN at purchase cost via post_stock_move, recompute WAC
--        Dr inventory (1210/1230/1240) / Cr GRN-clearing 2115   (no tax here)
--   post_supplier_bill    -> the LIABILITY event (0015): clears 2115 + Input GST
--
-- Splitting goods-in (GRN) from the bill via a GRN-clearing (GRNI) account is
-- the clean three-way-match pattern: stock value enters when goods arrive; the
-- payable + GST credit enter when the invoice arrives; 2115 nets to zero once
-- both sides are booked. Valuation stays weighted-average (Invariant 1/2).
-- =====================================================================

-- --- GRN-clearing (Goods Received Not Invoiced) control account --------
-- Interim liability: goods received but supplier bill not yet booked.
insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system)
values ('2115','Goods Received Not Invoiced','liability','credit', true, null, true)
on conflict (code) do nothing;
-- parent rollup (2100 Current Liabilities)
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p where p.code = '2100' and c.code = '2115' and c.parent_id is null;

create type purchase_status as enum ('draft','confirmed','received','closed','cancelled');
create type grn_status      as enum ('received','billed','cancelled');

-- ---------------------------------------------------------------------
-- purchase_orders  (demand to a supplier; no accounting impact)
-- ---------------------------------------------------------------------
create table purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_no         text not null,
  fy_id         uuid not null references financial_years(id),
  supplier_id   uuid not null references suppliers(id),
  branch_id     uuid not null references branches(id),        -- receiving branch
  po_date       date not null default current_date,
  expected_date date,
  status        purchase_status not null default 'draft',
  notes         text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  unique (fy_id, po_no)
);
create index purchase_orders_supplier_idx on purchase_orders (supplier_id, po_date);
create index purchase_orders_status_idx   on purchase_orders (status);

create table purchase_order_lines (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references purchase_orders(id) on delete cascade,
  item_id       uuid not null references items(id),
  qty           numeric(14,3) not null check (qty > 0),
  unit_cost     numeric(14,2) not null,             -- GST-exclusive purchase price / base unit
  gst_rate      numeric(5,2)  not null,             -- snapshot at PO time
  line_no       int not null default 1
);
create index purchase_order_lines_po_idx on purchase_order_lines (po_id);

-- ---------------------------------------------------------------------
-- purchase_receipts  (GRN — the physical goods-in document / stock event)
-- ---------------------------------------------------------------------
create table purchase_receipts (
  id             uuid primary key default gen_random_uuid(),
  grn_no         text not null,
  fy_id          uuid not null references financial_years(id),
  po_id          uuid references purchase_orders(id),     -- nullable: direct receipt
  supplier_id    uuid not null references suppliers(id),
  branch_id      uuid not null references branches(id),
  grn_date       date not null default current_date,
  supplier_dc_no text,                                     -- supplier delivery challan ref
  -- goods value received (ex-tax), = Σ line cost; ties to 2115 credit + inventory debit
  goods_value    numeric(14,2) not null default 0,
  journal_entry_id uuid references journal_entries(id),    -- the Dr inventory / Cr 2115 entry
  status         grn_status not null default 'received',
  billed_bill_id uuid,                                      -- set when a bill consumes this GRN
  notes          text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (fy_id, grn_no)
);
create index purchase_receipts_supplier_idx on purchase_receipts (supplier_id, grn_date);
create index purchase_receipts_status_idx    on purchase_receipts (status) where status = 'received';

create table purchase_receipt_lines (
  id           uuid primary key default gen_random_uuid(),
  grn_id       uuid not null references purchase_receipts(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_cost    numeric(14,2) not null,              -- cost used for WAC on receipt
  line_value   numeric(14,2) not null,              -- qty * unit_cost (ex-tax)
  gst_rate     numeric(5,2)  not null,              -- carried for the later bill
  line_no      int not null default 1
);
create index purchase_receipt_lines_grn_idx on purchase_receipt_lines (grn_id);

-- ---------------------------------------------------------------------
-- place_purchase_order(header jsonb, lines jsonb) -> purchase_orders.id
--   header: { supplier_id, po_date?, branch_id?, expected_date?, notes? }
--   lines : [ { item_id, qty, unit_cost, gst_rate? }, ... ]
-- Pure demand capture; no ledger, no stock.
-- ---------------------------------------------------------------------
create or replace function place_purchase_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'po_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_po       uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_supplier is null then raise exception 'place_purchase_order: supplier_id required'; end if;
  if not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'place_purchase_order: unknown supplier %', v_supplier;
  end if;
  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('po', v_date);

  insert into purchase_orders (po_no, fy_id, supplier_id, branch_id, po_date,
                               expected_date, status, notes, created_by)
  values (v_no, v_fy, v_supplier, v_branch, v_date,
          nullif(p_header->>'expected_date','')::date, 'confirmed',
          p_header->>'notes', v_actor)
  returning id into v_po;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_purchase_order: qty must be > 0'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'place_purchase_order: unit_cost required'; end if;
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into purchase_order_lines (po_id, item_id, qty, unit_cost, gst_rate, line_no)
      values (v_po, v_item, v_qty, v_cost,
              coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0), v_ln);
  end loop;

  if v_ln = 0 then raise exception 'place_purchase_order: at least one line required'; end if;

  perform write_audit('insert','purchase_orders', v_po::text,
            format('PO %s for supplier %s', v_no, v_supplier), null, v_actor);
  return v_po;
end $$;

-- ---------------------------------------------------------------------
-- post_grn(header jsonb, lines jsonb) -> purchase_receipts.id
--   header: { supplier_id, grn_date?, branch_id?, po_id?, supplier_dc_no?, notes? }
--   lines : [ { item_id, qty, unit_cost, gst_rate? }, ... ]
-- The STOCK event: brings goods in at cost, recomputes WAC per item, and posts
--   Dr inventory (per item type) / Cr GRN-clearing 2115  (ex-tax; no GST here).
-- One transaction (Invariant 4). The bill (0015) later clears 2115 and books GST.
-- ---------------------------------------------------------------------
create or replace function post_grn(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'grn_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_grn      uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_type     item_type;
  v_lval     numeric(14,2);
  v_goods    numeric(14,2) := 0;
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_supplier is null then raise exception 'post_grn: supplier_id required'; end if;
  if not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'post_grn: unknown supplier %', v_supplier;
  end if;
  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('grn', v_date);

  insert into purchase_receipts (grn_no, fy_id, po_id, supplier_id, branch_id, grn_date,
                                 supplier_dc_no, status, notes, created_by)
  values (v_no, v_fy, nullif(p_header->>'po_id','')::uuid, v_supplier, v_branch, v_date,
          p_header->>'supplier_dc_no', 'received', p_header->>'notes', v_actor)
  returning id into v_grn;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_grn: qty must be > 0'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'post_grn: unit_cost required'; end if;
    select gst_rate, type into v_rate, v_type from items where id = v_item;
    if v_type is null then raise exception 'post_grn: unknown item %', v_item; end if;
    if v_type = 'service' then
      raise exception 'post_grn: service item % cannot be received into stock', v_item;
    end if;
    v_lval := round(v_qty * v_cost, 2);
    v_ln   := v_ln + 1;

    insert into purchase_receipt_lines (grn_id, item_id, qty, unit_cost, line_value, gst_rate, line_no)
      values (v_grn, v_item, v_qty, v_cost, v_lval,
              coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0), v_ln);

    -- stock IN at cost: Dr inventory / Cr 2115 GRN-clearing; recomputes WAC.
    perform post_stock_move(v_item, v_branch, 'purchase_in', v_qty, v_cost,
                            '2115', 'grn', v_grn, v_date);
    v_goods := v_goods + v_lval;
  end loop;

  if v_ln = 0 then raise exception 'post_grn: at least one line required'; end if;

  -- the value entry(ies) were posted per line by post_stock_move; record the total.
  update purchase_receipts set goods_value = v_goods where id = v_grn;

  -- mark the source PO received
  if nullif(p_header->>'po_id','') is not null then
    update purchase_orders set status='received', updated_at=now()
      where id = (p_header->>'po_id')::uuid;
  end if;

  perform write_audit('post','purchase_receipts', v_grn::text,
            format('GRN %s goods %s from supplier', v_no, v_goods),
            jsonb_build_object('grn_no', v_no, 'goods_value', v_goods), v_actor);
  return v_grn;
end $$;
comment on function post_grn is
  'Goods-in: stock IN at cost (WAC), Dr inventory / Cr 2115 GRN-clearing. Ex-tax. One transaction.';

-- ---------------------------------------------------------------------
-- post_grn_from_po(po_id, grn_date?) -> grn id
-- Receives a confirmed PO in full: copies its lines into a GRN payload.
-- ---------------------------------------------------------------------
create or replace function post_grn_from_po(p_po uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po    purchase_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_po from purchase_orders where id = p_po;
  if not found then raise exception 'post_grn_from_po: PO % not found', p_po; end if;
  if v_po.status = 'received' then raise exception 'PO % already received', v_po.po_no; end if;
  if v_po.status = 'cancelled' then raise exception 'PO % is cancelled', v_po.po_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty,
                                      'unit_cost', unit_cost, 'gst_rate', gst_rate)
                   order by line_no)
    into v_lines
    from purchase_order_lines where po_id = p_po;

  return post_grn(
    jsonb_build_object('supplier_id', v_po.supplier_id::text, 'branch_id', v_po.branch_id::text,
                       'grn_date', p_date, 'po_id', p_po::text),
    v_lines);
end $$;

-- ---------------------------------------------------------------------
-- RLS for purchase demand/goods-in tables. Reads open to authenticated;
-- PO + GRN header/lines writable via the RPCs (definer) — but PO is plain
-- demand so we also allow direct writes with purchase.manage. GRN and its
-- lines have NO write policy: only post_grn (definer) writes them (the value
-- event), same as invoices on the sell side.
-- ---------------------------------------------------------------------
alter table purchase_orders       enable row level security;
alter table purchase_order_lines  enable row level security;
alter table purchase_receipts     enable row level security;
alter table purchase_receipt_lines enable row level security;

create policy read_all_auth on purchase_orders        for select to authenticated using (true);
create policy read_all_auth on purchase_order_lines   for select to authenticated using (true);
create policy read_all_auth on purchase_receipts      for select to authenticated using (true);
create policy read_all_auth on purchase_receipt_lines for select to authenticated using (true);

create policy manage_pos on purchase_orders for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));
create policy manage_po_lines on purchase_order_lines for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));

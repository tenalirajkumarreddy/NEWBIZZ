-- =====================================================================
-- 0008_sales.sql  ·  Phase 1 — sales orders, invoices, GST, delivery
--
-- Flow:  place_order (draft demand, no ledger impact)
--        -> post_invoice (the value event):
--             * stock OUT at WAC via post_stock_move  -> Dr COGS / Cr FG
--             * revenue + GST + AR via post_journal     -> Dr AR / Cr Sales / Cr Output GST
--        Everything in one transaction (Invariant 4). No direct table money writes.
--
-- GST: intra-state (supplier state == place of supply) splits CGST+SGST;
--      inter-state uses IGST. Place of supply = store.state_code.
-- =====================================================================

create type order_status   as enum ('draft','confirmed','invoiced','cancelled');
create type invoice_status as enum ('posted','paid','part_paid','void');

-- ---------------------------------------------------------------------
-- sales_orders  (demand; no accounting impact until invoiced)
-- ---------------------------------------------------------------------
create table sales_orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     text not null,
  fy_id        uuid not null references financial_years(id),
  store_id     uuid not null references customer_stores(id),
  customer_id  uuid not null references customers(id),
  order_date   date not null default current_date,
  price_list_id uuid references price_lists(id),
  branch_id    uuid not null references branches(id),       -- fulfilling branch
  status       order_status not null default 'draft',
  notes        text,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (fy_id, order_no)
);
create index sales_orders_store_idx on sales_orders (store_id, order_date);
create index sales_orders_status_idx on sales_orders (status);

create table sales_order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references sales_orders(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,             -- GST-exclusive, per base unit
  gst_rate     numeric(5,2)  not null,             -- snapshot at order time
  line_no      int not null default 1
);
create index sales_order_lines_order_idx on sales_order_lines (order_id);

-- ---------------------------------------------------------------------
-- invoices  (tax invoice — the value document)
-- ---------------------------------------------------------------------
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null,
  fy_id         uuid not null references financial_years(id),
  order_id      uuid references sales_orders(id),  -- nullable: direct/counter sale
  store_id      uuid not null references customer_stores(id),
  customer_id   uuid not null references customers(id),
  branch_id     uuid not null references branches(id),
  invoice_date  date not null default current_date,
  place_of_supply text not null,                   -- state_code driving CGST/SGST vs IGST
  is_interstate boolean not null default false,
  -- money (all derived from lines; stored for the printed document)
  taxable_amount numeric(14,2) not null default 0,
  cgst_amount    numeric(14,2) not null default 0,
  sgst_amount    numeric(14,2) not null default 0,
  igst_amount    numeric(14,2) not null default 0,
  cess_amount    numeric(14,2) not null default 0,
  round_off      numeric(14,2) not null default 0,
  grand_total    numeric(14,2) not null default 0,
  -- linkage to the accounting entry (Invariant: value lives in journal_lines)
  journal_entry_id uuid references journal_entries(id),
  cogs_entry_id    uuid references journal_entries(id),
  status         invoice_status not null default 'posted',
  amount_paid    numeric(14,2) not null default 0, -- read-model, maintained by receipts
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (fy_id, invoice_no)
);
create index invoices_customer_idx on invoices (customer_id, invoice_date);
create index invoices_store_idx    on invoices (store_id);
create index invoices_status_idx   on invoices (status) where status in ('posted','part_paid');
comment on column invoices.amount_paid is 'Read-model (Invariant 5); truth is receipt_allocations sum.';

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,             -- GST-exclusive
  taxable_amount numeric(14,2) not null,           -- qty * unit_price
  gst_rate     numeric(5,2)  not null,
  cgst_amount  numeric(14,2) not null default 0,
  sgst_amount  numeric(14,2) not null default 0,
  igst_amount  numeric(14,2) not null default 0,
  cess_amount  numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null,             -- taxable + taxes
  line_no      int not null default 1
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- ---------------------------------------------------------------------
-- place_order(header jsonb, lines jsonb) -> sales_orders.id
--   header: { store_id, order_date?, branch_id?, notes? }
--   lines : [ { item_id, qty, unit_price? }, ... ]  (price auto-resolved if omitted)
-- Pure demand capture; no ledger, no stock impact.
-- ---------------------------------------------------------------------
create or replace function place_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_pl       uuid;
  v_date     date := coalesce((p_header->>'order_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_order    uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_price    numeric(14,2);
  v_rate     numeric(5,2);
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_store is null then raise exception 'place_order: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'place_order: unknown store %', v_store; end if;
  v_fy     := fy_for_date(v_date);
  v_pl     := resolve_price_list(v_store);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('order', v_date);

  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by)
  values (v_no, v_fy, v_store, v_cust, v_date, v_pl, v_branch, 'confirmed',
          p_header->>'notes', v_actor)
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_order: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into sales_order_lines (order_id, item_id, qty, unit_price, gst_rate, line_no)
      values (v_order, v_item, v_qty, v_price, coalesce(v_rate,0), v_ln);
  end loop;

  perform write_audit('insert','sales_orders', v_order::text,
            format('Order %s for store %s', v_no, v_store), null, v_actor);
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- post_invoice(p_order uuid | p_header jsonb, p_lines jsonb) -> invoices.id
-- The value event. Computes GST (CGST/SGST or IGST by place of supply),
-- posts revenue+tax+AR, and issues stock at WAC (COGS). One transaction.
--
-- Two call styles:
--   * from an order:   post_invoice_from_order(order_id, invoice_date?)
--   * direct sale:     post_invoice(header, lines)  (header like place_order)
-- ---------------------------------------------------------------------
create or replace function post_invoice(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_date     date := coalesce((p_header->>'invoice_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_supply   text;                 -- place of supply (store state)
  v_home     text;                 -- our state (company / branch)
  v_inter    boolean;
  v_pl       uuid;
  v_inv      uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_price numeric(14,2); v_rate numeric(5,2);
  v_cess_r   numeric(5,2);
  v_taxable  numeric(14,2); v_cgst numeric(14,2); v_sgst numeric(14,2);
  v_igst     numeric(14,2); v_cess numeric(14,2); v_ltot numeric(14,2);
  v_sum_tax  numeric(14,2) := 0; v_sum_cgst numeric(14,2) := 0; v_sum_sgst numeric(14,2) := 0;
  v_sum_igst numeric(14,2) := 0; v_sum_cess numeric(14,2) := 0;
  v_grand    numeric(14,2);
  v_round    numeric(14,2);
  v_ln       int := 0;
  v_je       uuid; v_cogs_je uuid;
  v_ar_lines jsonb := '[]'::jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_type     item_type;
begin
  if v_store is null then raise exception 'post_invoice: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'post_invoice: unknown store %', v_store; end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_pl     := resolve_price_list(v_store);
  v_supply := coalesce(nullif(p_header->>'place_of_supply',''),
                       (select state_code from customer_stores where id = v_store));
  select state_code into v_home from branches where id = v_branch;
  v_home   := coalesce(v_home, (select state_code from company_settings limit 1), '33');
  v_inter  := (v_supply is distinct from v_home);
  v_no     := next_number('invoice', v_date);

  -- header shell (money filled after lines)
  insert into invoices (invoice_no, fy_id, order_id, store_id, customer_id, branch_id,
                        invoice_date, place_of_supply, is_interstate, status, created_by)
  values (v_no, v_fy, nullif(p_header->>'order_id','')::uuid, v_store, v_cust, v_branch,
          v_date, v_supply, v_inter, 'posted', v_actor)
  returning id into v_inv;

  ------------------------------------------------------------------- lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_invoice: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate, cess_rate, type into v_rate, v_cess_r, v_type from items where id = v_item;
    v_rate := coalesce(v_rate,0); v_cess_r := coalesce(v_cess_r,0);

    v_taxable := round(v_qty * v_price, 2);
    v_cess    := round(v_taxable * v_cess_r / 100, 2);
    if v_inter then
      v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
    else
      v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_igst := 0;
    end if;
    v_ltot := v_taxable + v_cgst + v_sgst + v_igst + v_cess;
    v_ln := v_ln + 1;

    insert into invoice_lines (invoice_id, item_id, qty, unit_price, taxable_amount, gst_rate,
                               cgst_amount, sgst_amount, igst_amount, cess_amount, line_total, line_no)
    values (v_inv, v_item, v_qty, v_price, v_taxable, v_rate,
            v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    v_sum_tax  := v_sum_tax + v_taxable; v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;   v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;

    -- issue stock at WAC for stocked items (Dr COGS 5100 / Cr FG 1230…).
    if v_type <> 'service' then
      perform post_stock_move(v_item, v_branch, 'sale_out', (-1 * v_qty), 0,
                              '5100', 'invoice', v_inv, v_date);
    end if;
  end loop;

  if v_ln = 0 then raise exception 'post_invoice: at least one line required'; end if;

  -- rounding to whole rupee on the grand total
  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  ------------------------------------------------------------ revenue posting
  -- Dr AR (customer) grand_total ; Cr Sales taxable ; Cr Output GST ; +round-off
  v_ar_lines := jsonb_build_array(
    jsonb_build_object('account_code','1130','debit', v_grand,'credit',0,
                       'party_type','customer','party_id', v_cust::text),
    jsonb_build_object('account_code','4100','debit',0,'credit', v_sum_tax));
  if (v_sum_cgst + v_sum_sgst + v_sum_igst) > 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,
                         'credit', v_sum_cgst + v_sum_sgst + v_sum_igst));
  end if;
  if v_sum_cess <> 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,'credit', v_sum_cess));
  end if;
  if v_round <> 0 then
    -- positive round_off = income to us => credit 5700; negative => debit 5700
    if v_round > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', v_round));
    else
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', abs(v_round),'credit',0));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','sale', 'source_id', v_inv::text,
                       'narration','Invoice '||v_no),
    v_ar_lines);

  -- fill header money + linkage
  update invoices set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_inv;

  -- mark source order invoiced
  if (p_header ? 'order_id') and nullif(p_header->>'order_id','') is not null then
    update sales_orders set status='invoiced', updated_at=now()
      where id = (p_header->>'order_id')::uuid;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('Invoice %s total %s', v_no, v_grand),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand), v_actor);
  return v_inv;
end $$;
comment on function post_invoice is
  'Value event: computes GST, posts revenue+tax+AR, issues stock at WAC (COGS). One transaction.';

-- ---------------------------------------------------------------------
-- post_invoice_from_order(order_id, invoice_date?) -> invoice id
-- Copies confirmed order lines into an invoice payload and posts it.
-- ---------------------------------------------------------------------
create or replace function post_invoice_from_order(p_order uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o    sales_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_o from sales_orders where id = p_order;
  if not found then raise exception 'post_invoice_from_order: order % not found', p_order; end if;
  if v_o.status = 'invoiced' then raise exception 'order % already invoiced', v_o.order_no; end if;
  if v_o.status = 'cancelled' then raise exception 'order % is cancelled', v_o.order_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)
                   order by line_no)
    into v_lines
    from sales_order_lines where order_id = p_order;

  return post_invoice(
    jsonb_build_object('store_id', v_o.store_id::text, 'branch_id', v_o.branch_id::text,
                       'invoice_date', p_date, 'order_id', p_order::text),
    v_lines);
end $$;

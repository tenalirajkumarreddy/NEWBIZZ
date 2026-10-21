-- =====================================================================
-- 0133_delivery_is_the_value_event.sql
--
-- H4 / H8 / M7 / M9 remediation. Delivery and invoice could both post the
-- same money and stock:
--
--   post_delivery()            → stock out, AR, revenue/GST, ledger sale
--   post_invoice_from_order()  → accepts a 'fulfilled' order, so the same
--                                order posts stock, AR and revenue a second
--                                time (or drives stock negative);
--   generate_gst_invoice()     → the intended document-only path, but it
--                                happily runs on an 'approved' order with no
--                                delivery at all, producing an invoice whose
--                                journal_entry_id is NULL — a receivable that
--                                exists in the subledger and nowhere in the GL;
--   void_invoice()             → reverses whatever journal the invoice
--                                points at, so voiding a document-only GST
--                                invoice reversed the *delivery* (AR, revenue,
--                                GST) without restocking, leaving delivered
--                                goods with no receivable.
--
-- Decision (Option A in the audit): the delivery is the value event. An
-- invoice after delivery is a DOCUMENT that links to the delivery journal.
--
-- This migration:
--   1. locks the order in post_delivery / post_invoice_from_order /
--      generate_gst_invoice and moves status with a compare-and-set, so two
--      concurrent clicks cannot deliver or invoice twice;
--   2. refuses post_invoice_from_order on a fulfilled order and points at
--      generate_gst_invoice;
--   3. requires a delivered order (and its journal) in generate_gst_invoice,
--      and refuses a second live invoice for the same order;
--   4. makes void_invoice recognise a document-only invoice: it marks the
--      document void and puts the order back to 'fulfilled' without touching
--      the delivery's journal, stock or ledger;
--   5. records fulfilment per order LINE (remaining-qty aware) instead of
--      overwriting every line of that item with the last quantity;
--   6. adds a unique partial index so an order can never hold two live
--      invoices (skipped with a notice if the data already has duplicates).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. One live invoice per order
--    Existing data may predate the rule; never fail the whole migration for
--    it — report and skip, and let the operator clean the duplicates.
-- ---------------------------------------------------------------------
do $mig$
declare
  v_dupes int;
begin
  select count(*) into v_dupes from (
    select order_id from public.invoices
     where order_id is not null and status <> 'void'
     group by order_id having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise notice '0133: % order(s) already have more than one live invoice; unique index skipped', v_dupes;
  else
    execute 'create unique index if not exists invoices_one_live_per_order
               on public.invoices (order_id)
               where order_id is not null and status <> ''void''';
  end if;
end $mig$;

-- ---------------------------------------------------------------------
-- 2. post_invoice_from_order — refuses a delivered order
-- ---------------------------------------------------------------------
create or replace function public.post_invoice_from_order(
  p_order uuid,
  p_lines jsonb default null,             -- null → use order lines as-is
  p_is_official boolean default true,
  p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o        sales_orders%rowtype;
  v_lines    jsonb;
  v_line     jsonb;
  v_ol       record;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_apply    numeric(14,3);
  v_inv      uuid;
  v_actor    uuid := public.current_app_user();
begin
  select * into v_o from sales_orders where id = p_order for update;
  if not found then
    raise exception 'post_invoice_from_order: order % not found', p_order;
  end if;

  if v_o.status in ('invoiced', 'cancelled') then
    raise exception 'post_invoice_from_order: order % is %', v_o.order_no, v_o.status;
  end if;

  -- Delivery is the value event: the stock, AR and revenue of a delivered
  -- order are already posted. Invoicing it again would double everything.
  if v_o.status = 'fulfilled' then
    raise exception 'post_invoice_from_order: order % is already delivered — raise the GST document with generate_gst_invoice instead',
      v_o.order_no;
  end if;

  if exists (select 1 from invoices i where i.order_id = p_order and i.status <> 'void') then
    raise exception 'post_invoice_from_order: order % already has a live invoice', v_o.order_no;
  end if;

  -- Lines: explicit payload (edited) or copy from the order's confirmed lines.
  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    v_lines := p_lines;
  else
    select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)
                     order by line_no)
      into v_lines
      from sales_order_lines
     where order_id = p_order;
  end if;

  -- Post the invoice (revenue + GST + AR + COGS + stock + customer_ledger).
  v_inv := post_invoice(
    jsonb_build_object(
      'store_id',    v_o.store_id::text,
      'branch_id',   v_o.branch_id::text,
      'invoice_date', p_date,
      'order_id',    p_order::text,
      'is_official', p_is_official
    ),
    v_lines
  );

  -- Mark the order lines as fulfilled, PER LINE. An order may hold two lines
  -- of the same item (different price or batch); the old code matched by
  -- item_id and stamped the last quantity onto both.
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := coalesce((v_line->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    if nullif(v_line->>'order_line_id','') is not null then
      update sales_order_lines
         set qty_fulfilled = least(qty, coalesce(qty_fulfilled, 0) + v_qty)
       where id = (v_line->>'order_line_id')::uuid
         and order_id = p_order;
    else
      for v_ol in
        select id, qty - coalesce(qty_fulfilled, 0) as remaining
          from sales_order_lines
         where order_id = p_order
           and item_id = v_item
           and qty - coalesce(qty_fulfilled, 0) > 0
         order by line_no, id
      loop
        exit when v_qty <= 0.0005;
        v_apply := least(v_ol.remaining, v_qty);
        update sales_order_lines
           set qty_fulfilled = coalesce(qty_fulfilled, 0) + v_apply
         where id = v_ol.id;
        v_qty := v_qty - v_apply;
      end loop;
    end if;
  end loop;

  -- post_invoice sets 'invoiced' for any order with order_id. For an
  -- unofficial (cash memo) sale the order is delivered, not invoiced.
  if not p_is_official then
    update sales_orders
       set status = 'fulfilled', updated_at = now(), version = version + 1
     where id = p_order;
  end if;

  perform write_audit('post','invoices', v_inv::text,
    format('Order %s fulfilled via %s %s',
      v_o.order_no,
      case when p_is_official then 'invoice' else 'cash memo' end,
      v_inv),
    jsonb_build_object('order_id', p_order, 'invoice_id', v_inv, 'is_official', p_is_official),
    v_actor);

  return v_inv;
end $$;

comment on function post_invoice_from_order(uuid, jsonb, boolean, date) is
  'Fulfil an order by posting the sale (invoice or cash memo). Refuses a delivered order: delivery is the value event and a GST document is raised with generate_gst_invoice. Updates qty_fulfilled per order line.';

-- ---------------------------------------------------------------------
-- 3. post_delivery — lock the order, compare-and-set its status
-- ---------------------------------------------------------------------
create or replace function public.post_delivery(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o            sales_orders%rowtype;
  v_cust         uuid;
  v_store_state  text;
  v_home_state   text;
  v_inter        boolean;
  v_fy           uuid;
  v_branch       uuid;
  v_challan      uuid;
  v_challan_no   text;
  v_date         date := current_date;
  v_actor        uuid;
  v_line         record;
  v_qty_delivering numeric(14,3);
  v_prev_bal     numeric(14,2);
  v_sum_tax      numeric(14,2) := 0;
  v_sum_cgst     numeric(14,2) := 0;
  v_sum_sgst     numeric(14,2) := 0;
  v_sum_igst     numeric(14,2) := 0;
  v_sum_cess     numeric(14,2) := 0;
  v_grand        numeric(14,2);
  v_round        numeric(14,2);
  v_je           uuid;
  v_cogs_je      uuid;
  v_ar_lines     jsonb := '[]'::jsonb;
  v_type         item_type;
  v_rate         numeric(5,2);
  v_cess_r       numeric(5,2);
  v_taxable      numeric(14,2);
  v_cgst         numeric(14,2);
  v_sgst         numeric(14,2);
  v_igst         numeric(14,2);
  v_cess         numeric(14,2);
  v_ln           int := 0;
begin
  if not has_permission('challan.record') then
    raise exception 'post_delivery: not authorized (challan.record required)';
  end if;

  -- Serialise on the order: two concurrent deliveries must not both see the
  -- same remaining quantity.
  select * into v_o from sales_orders where id = p_order for update;
  if not found then raise exception 'post_delivery: order % not found', p_order; end if;
  if v_o.status = 'invoiced'  then raise exception 'post_delivery: order % already invoiced', v_o.order_no; end if;
  if v_o.status = 'cancelled' then raise exception 'post_delivery: order % is cancelled', v_o.order_no; end if;
  if v_o.status = 'fulfilled' then raise exception 'post_delivery: order % already fulfilled', v_o.order_no; end if;
  if v_o.status = 'draft'     then raise exception 'post_delivery: order % is draft — confirm first', v_o.order_no; end if;
  if exists (select 1 from invoices i where i.order_id = p_order and i.status <> 'void') then
    raise exception 'post_delivery: order % already has a live invoice', v_o.order_no;
  end if;

  v_actor  := public.current_app_user();
  v_fy     := v_o.fy_id;
  v_branch := v_o.branch_id;
  v_cust   := v_o.customer_id;

  select state_code into v_store_state from customer_stores where id = v_o.store_id;
  select state_code into v_home_state from branches where id = v_branch;
  v_home_state := coalesce(v_home_state, (select state_code from company_settings limit 1), '33');
  v_inter := (v_store_state is distinct from v_home_state);

  -- create challan for all remaining qty
  v_challan_no := next_number('challan', v_date);
  insert into delivery_challans (challan_no, fy_id, order_id, branch_id, status, printed_at, delivered_at, created_by)
    values (v_challan_no, v_fy, p_order, v_branch, 'delivered', now(), now(), v_actor)
    returning id into v_challan;

  for v_line in
    select l.*, i.type, i.gst_rate, i.cess_rate
    from sales_order_lines l
    join items i on i.id = l.item_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_qty_delivering := v_line.qty - coalesce(v_line.qty_fulfilled, 0);
    if v_qty_delivering <= 0 then continue; end if;

    v_ln := v_ln + 1;
    insert into delivery_challan_lines (challan_id, order_line_id, item_id, qty, line_no)
      values (v_challan, v_line.id, v_line.item_id, v_qty_delivering, v_ln);

    update sales_order_lines set qty_fulfilled = coalesce(qty_fulfilled, 0) + v_qty_delivering
      where id = v_line.id;

    v_rate   := coalesce(v_line.gst_rate, 0);
    v_cess_r := coalesce(v_line.cess_rate, 0);
    v_type   := v_line.type;
    v_taxable := round(v_qty_delivering * v_line.unit_price, 2);
    v_cess    := round(v_taxable * v_cess_r / 100, 2);
    if v_inter then
      v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
    else
      v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_igst := 0;
    end if;

    v_sum_tax  := v_sum_tax + v_taxable;
    v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;
    v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;

    if v_type <> 'service' then
      perform post_stock_move(v_line.item_id, v_branch, 'sale_out', (-1 * v_qty_delivering), 0,
                              '5100', 'challan', v_challan, v_date);
    end if;
  end loop;

  if v_ln = 0 then
    update delivery_challans set status = 'cancelled' where id = v_challan;
    raise exception 'post_delivery: order % has nothing left to deliver', v_o.order_no;
  end if;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

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
    if v_round > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', v_round));
    else
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', abs(v_round),'credit',0));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','delivery', 'source_id', v_challan::text,
                       'narration','Delivery '||v_challan_no),
    v_ar_lines);

  select journal_entry_id into v_cogs_je
    from stock_ledger
   where source = 'challan' and source_id = v_challan
     and move_type = 'sale_out'
   order by moved_at desc
   limit 1;

  update delivery_challans set journal_entry_id = v_je, cogs_entry_id = v_cogs_je
    where id = v_challan;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_o.store_id, v_cust, 'sale', v_challan, 'delivery_challans', v_grand, v_prev_bal + v_grand);

  -- Compare-and-set: if another session moved the order while we held the
  -- lock (it cannot, but a caller may have passed a stale status), fail loudly
  -- instead of overwriting.
  update sales_orders set status='fulfilled', updated_at=now(), version = version + 1
    where id = p_order and status = v_o.status;
  if not found then
    raise exception 'post_delivery: order % changed concurrently (was %)', v_o.order_no, v_o.status;
  end if;

  perform write_audit('post','delivery_challans', v_challan::text,
            format('Delivery %s total %s from order %s', v_challan_no, v_grand, v_o.order_no),
            jsonb_build_object('challan_no', v_challan_no, 'grand_total', v_grand,
                               'order_no', v_o.order_no), v_actor);

  return v_challan;
end $$;

comment on function post_delivery(uuid) is
  'Fulfil an order: deliver all remaining qty, post revenue + stock + customer_ledger under an order row lock. No invoice created. For GST docs, call generate_gst_invoice.';

-- ---------------------------------------------------------------------
-- 4. generate_gst_invoice — a document for a DELIVERED order only
-- ---------------------------------------------------------------------
create or replace function public.generate_gst_invoice(p_order uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o            sales_orders%rowtype;
  v_cust         uuid;
  v_store_state  text;
  v_home_state   text;
  v_inter        boolean;
  v_branch       uuid;
  v_inv          uuid;
  v_no           text;
  v_fy           uuid;
  v_line         record;
  v_rate         numeric(5,2);
  v_cess_r       numeric(5,2);
  v_taxable      numeric(14,2);
  v_cgst         numeric(14,2);
  v_sgst         numeric(14,2);
  v_igst         numeric(14,2);
  v_cess         numeric(14,2);
  v_ltot         numeric(14,2);
  v_sum_tax      numeric(14,2) := 0;
  v_sum_cgst     numeric(14,2) := 0;
  v_sum_sgst     numeric(14,2) := 0;
  v_sum_igst     numeric(14,2) := 0;
  v_sum_cess     numeric(14,2) := 0;
  v_grand        numeric(14,2);
  v_round        numeric(14,2);
  v_ln           int := 0;
  v_je           uuid;
  v_actor        uuid := public.current_app_user();
begin
  if not has_permission('invoice.create') then
    raise exception 'generate_gst_invoice: not authorized (invoice.create required)';
  end if;

  select * into v_o from sales_orders where id = p_order for update;
  if not found then raise exception 'generate_gst_invoice: order % not found', p_order; end if;
  if v_o.status = 'cancelled' then raise exception 'generate_gst_invoice: order % is cancelled', v_o.order_no; end if;
  if v_o.status = 'draft'     then raise exception 'generate_gst_invoice: order % is draft — fulfil first', v_o.order_no; end if;
  if v_o.status = 'confirmed' then raise exception 'generate_gst_invoice: order % must be fulfilled first (status: confirmed)', v_o.order_no; end if;
  if v_o.status = 'invoiced'  then raise exception 'generate_gst_invoice: order % already invoiced', v_o.order_no; end if;
  -- Anything other than a delivered order would produce a document with no
  -- delivery journal behind it: a receivable that exists only in the subledger.
  if v_o.status <> 'fulfilled' then
    raise exception 'generate_gst_invoice: order % is % — deliver it first', v_o.order_no, v_o.status;
  end if;
  if exists (select 1 from invoices i where i.order_id = p_order and i.status <> 'void') then
    raise exception 'generate_gst_invoice: order % already has a live invoice', v_o.order_no;
  end if;

  v_fy     := v_o.fy_id;
  v_branch := v_o.branch_id;
  v_cust   := v_o.customer_id;

  select journal_entry_id into v_je
    from delivery_challans
   where order_id = p_order and status = 'delivered'
     and journal_entry_id is not null
   order by delivered_at desc
   limit 1;
  if v_je is null then
    raise exception 'generate_gst_invoice: order % has no delivery journal to attach to', v_o.order_no;
  end if;

  select state_code into v_store_state from customer_stores where id = v_o.store_id;
  select state_code into v_home_state from branches where id = v_branch;
  v_home_state := coalesce(v_home_state, (select state_code from company_settings limit 1), '33');
  v_inter := (v_store_state is distinct from v_home_state);

  v_no := next_number('invoice', p_date);

  -- This is the one path allowed to attach an invoice to a delivered order:
  -- the invoice row is a document pointing at the delivery's journal, so it
  -- posts no value of its own. Flag it for the guard trigger below.
  perform set_config('app.doc_invoice', 'on', true);

  insert into invoices (invoice_no, fy_id, order_id, store_id, customer_id, branch_id,
                         invoice_date, place_of_supply, is_interstate, status, created_by)
    values (v_no, v_fy, p_order, v_o.store_id, v_cust, v_branch,
            p_date, coalesce(v_store_state, '33'), v_inter, 'posted', v_actor)
    returning id into v_inv;

  for v_line in
    select l.*, i.gst_rate, i.cess_rate
    from sales_order_lines l
    join items i on i.id = l.item_id
    where l.order_id = p_order
    order by l.line_no
  loop
    v_rate   := coalesce(v_line.gst_rate, 0);
    v_cess_r := coalesce(v_line.cess_rate, 0);
    v_taxable := round(v_line.qty * v_line.unit_price, 2);
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
      values (v_inv, v_line.item_id, v_line.qty, v_line.unit_price, v_taxable, v_rate,
              v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    v_sum_tax  := v_sum_tax + v_taxable;
    v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;
    v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;
  end loop;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  update invoices set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_inv;

  update sales_orders set status='invoiced', updated_at=now(), version = version + 1
    where id = p_order and status = 'fulfilled';
  if not found then
    raise exception 'generate_gst_invoice: order % changed concurrently', v_o.order_no;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('GST invoice %s for order %s (linked to delivery journal)', v_no, v_o.order_no),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand,
                               'order_no', v_o.order_no,
                               'document_only', true), v_actor);

  return v_inv;
end $$;

comment on function generate_gst_invoice(uuid, date) is
  'Generate the GST document for a delivered order. No accounting entry — it links to the delivery journal. Requires status fulfilled and no live invoice.';

-- ---------------------------------------------------------------------
-- 5. void_invoice — a document-only invoice must not reverse the delivery
-- ---------------------------------------------------------------------
create or replace function public.void_invoice(
  p_invoice uuid,
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv      invoices%rowtype;
  v_line     record;
  v_type     item_type;
  v_actor    uuid := public.current_app_user();
  v_prev     numeric(14,2);
  v_released numeric(14,2);
  v_doc_only boolean;
begin
  if not has_permission('invoice.void') then
    raise exception 'void_invoice: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'void_invoice: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'void_invoice: invoice % is already void', v_inv.invoice_no;
  end if;

  -- A document-only invoice is attached to the delivery's journal. Reversing
  -- that journal would cancel the delivery itself (AR, revenue, GST) while the
  -- goods stay gone — the exact double-count this migration removes.
  v_doc_only := v_inv.journal_entry_id is not null
    and exists (select 1 from delivery_challans dc
                 where dc.journal_entry_id = v_inv.journal_entry_id);

  v_released := public._release_invoice_allocations(p_invoice, p_reason);

  if v_doc_only then
    -- Cancel the paper, keep the delivery. Payments already applied come back
    -- as customer advance (the delivery's receivable is intact).
    if v_released > 0.005 then
      perform post_journal(
        jsonb_build_object('entry_date', current_date, 'source','invoice_void',
                           'source_id', p_invoice::text,
                           'narration', format('Release %s paid on cancelled document %s to customer advance',
                                               v_released, v_inv.invoice_no)),
        jsonb_build_array(
          jsonb_build_object('account_code','1130','debit', v_released,'credit',0,
                             'party_type','customer','party_id', v_inv.customer_id::text),
          jsonb_build_object('account_code','2100','debit',0,'credit', v_released,
                             'party_type','customer','party_id', v_inv.customer_id::text)));
    end if;

    update invoices set status = 'void', amount_paid = 0 where id = p_invoice;

    -- Back to delivered so a corrected document can be raised.
    if v_inv.order_id is not null then
      update sales_orders set status = 'fulfilled', updated_at = now(), version = version + 1
        where id = v_inv.order_id and status = 'invoiced';
    end if;

    perform write_audit('void', 'invoices', p_invoice::text,
              format('Cancelled GST document %s for delivered order %s (delivery untouched)%s',
                     v_inv.invoice_no, coalesce(v_inv.order_id::text, '—'),
                     case when p_reason is null then '' else ': ' || p_reason end),
              jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                                 'reason', p_reason, 'document_only', true,
                                 'released_to_advance', v_released),
              v_actor);
    return p_invoice;
  end if;

  -- 1) Reverse the sale journal (AR / Sales / GST)
  if v_inv.journal_entry_id is not null then
    perform reverse_journal(v_inv.journal_entry_id,
      coalesce('Void ' || v_inv.invoice_no || ': ' || p_reason, 'Void of ' || v_inv.invoice_no));
  end if;

  -- 2) Restore stock for each stocked line. adjust_in at the original unit_cogs
  --    re-adds qty AND posts Dr Inventory / Cr COGS(5100), reversing the sale COGS.
  for v_line in
    select il.item_id, il.qty, il.unit_cogs
      from invoice_lines il where il.invoice_id = p_invoice
  loop
    select type into v_type from items where id = v_line.item_id;
    if v_type is distinct from 'service' and v_line.qty > 0 then
      perform post_stock_move(v_line.item_id, v_inv.branch_id, 'adjust_in',
                              v_line.qty, coalesce(v_line.unit_cogs, 0),
                              '5100', 'invoice_void', p_invoice, current_date);
    end if;
  end loop;

  -- 3) Reverse the customer ledger running balance
  v_prev := coalesce(previous_customer_balance(v_inv.customer_id), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_inv.store_id, v_inv.customer_id, 'sale_void', p_invoice, 'invoices',
            -1 * v_inv.grand_total, v_prev - v_inv.grand_total);

  -- 4) Reclass the released payments from AR to customer advance, so the
  --    invoice's AR is fully cleared and the money is not lost in a credit
  --    balance nobody can apply.
  if v_released > 0.005 then
    perform post_journal(
      jsonb_build_object('entry_date', current_date, 'source','invoice_void',
                         'source_id', p_invoice::text,
                         'narration', format('Release %s paid on voided invoice %s to customer advance',
                                             v_released, v_inv.invoice_no)),
      jsonb_build_array(
        jsonb_build_object('account_code','1130','debit', v_released,'credit',0,
                           'party_type','customer','party_id', v_inv.customer_id::text),
        jsonb_build_object('account_code','2100','debit',0,'credit', v_released,
                           'party_type','customer','party_id', v_inv.customer_id::text)));
  end if;

  -- 5) Mark the invoice void
  update invoices set status = 'void', amount_paid = 0 where id = p_invoice;

  -- 6) Release a linked order back to approved so it can be re-invoiced
  if v_inv.order_id is not null then
    update sales_orders set status = 'approved', updated_at = now(), version = version + 1
      where id = v_inv.order_id and status = 'invoiced';
  end if;

  perform write_audit('void', 'invoices', p_invoice::text,
            format('Voided %s (total %s)%s', v_inv.invoice_no, v_inv.grand_total,
                   case when p_reason is null then '' else ': ' || p_reason end),
            jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                               'is_official', v_inv.is_official, 'reason', p_reason,
                               'released_to_advance', v_released),
            v_actor);
  return p_invoice;
end $$;

comment on function void_invoice(uuid, text) is
  'Void a posted invoice: reverse the journal, restock, reverse the ledger, and release allocated payments to customer advance. A document-only invoice (attached to a delivery journal) is cancelled without touching the delivery.';

-- ---------------------------------------------------------------------
-- 6. convert_invoice_type — a delivery document cannot be "converted"
--    Converting voids the invoice and re-issues it as a value sale, which
--    for a document-only invoice would post AR a second time on top of the
--    delivery. Refuse and let the operator cancel + re-raise.
-- ---------------------------------------------------------------------
create or replace function public.convert_invoice_type(
  p_invoice uuid,
  p_reason  text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    invoices%rowtype;
  v_lines  jsonb;
  v_header jsonb;
  v_new    uuid;
  v_reason text;
begin
  if not has_permission('cashmemo.edit') then
    raise exception 'convert_invoice_type: not authorized (cashmemo.edit required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'convert_invoice_type: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'convert_invoice_type: % is already void', v_inv.invoice_no;
  end if;

  if v_inv.journal_entry_id is not null
     and exists (select 1 from delivery_challans dc
                  where dc.journal_entry_id = v_inv.journal_entry_id) then
    raise exception 'convert_invoice_type: % documents a delivery — cancel it and raise a new GST invoice instead',
      v_inv.invoice_no;
  end if;

  v_reason := coalesce(p_reason,
    format('Re-issued as %s', case when v_inv.is_official then 'cash memo' else 'tax invoice' end));

  -- Snapshot the lines before the void (item_id, qty, and the exact unit_price)
  select jsonb_agg(jsonb_build_object(
           'item_id', il.item_id::text,
           'qty', il.qty,
           'unit_price', il.unit_price) order by il.line_no)
    into v_lines
    from invoice_lines il where il.invoice_id = p_invoice;

  if v_lines is null then
    raise exception 'convert_invoice_type: % has no lines', v_inv.invoice_no;
  end if;

  -- Void the wrong-type document (reverses journals, restocks, ledger)
  perform void_invoice(p_invoice, v_reason);

  -- Re-issue with the opposite is_official, preserving store/date/order/pos/prices
  v_header := jsonb_build_object(
    'store_id', v_inv.store_id::text,
    'invoice_date', v_inv.invoice_date::text,
    'place_of_supply', v_inv.place_of_supply,
    'is_official', (not v_inv.is_official),
    'branch_id', v_inv.branch_id::text);
  if v_inv.order_id is not null then
    v_header := v_header || jsonb_build_object('order_id', v_inv.order_id::text);
  end if;

  v_new := post_invoice(v_header, v_lines);

  perform write_audit('update', 'invoices', p_invoice::text,
            format('Converted %s -> %s (new doc)',
                   v_inv.invoice_no,
                   case when v_inv.is_official then 'cash memo' else 'tax invoice' end),
            jsonb_build_object('old_invoice', v_inv.invoice_no,
                               'old_is_official', v_inv.is_official,
                               'new_invoice_id', v_new, 'reason', p_reason),
            current_app_user());
  return v_new;
end $$;

comment on function convert_invoice_type(uuid, text) is
  'Void a wrong-type sale and re-issue it as the opposite document type. Refuses a document-only invoice attached to a delivery.';

-- ---------------------------------------------------------------------
-- 7. Guard every insert path into invoices
--    post_invoice_from_order is not the only writer: post_invoice can be
--    called straight from the client with an order_id, and PostgREST can
--    insert into invoices directly. The rule belongs in the table.
-- ---------------------------------------------------------------------
create or replace function public.invoices_order_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
  v_no     text;
begin
  if new.order_id is null then
    return new;
  end if;

  select status, order_no into v_status, v_no
    from sales_orders where id = new.order_id;
  if v_status is null then
    raise exception 'invoice refused: order % not found', new.order_id;
  end if;

  if v_status = 'cancelled' then
    raise exception 'invoice refused: order % is cancelled', v_no;
  end if;

  -- Delivery is the value event. Only generate_gst_invoice may attach a
  -- document to a delivered order (it sets app.doc_invoice for its insert).
  if v_status = 'fulfilled'
     and coalesce(current_setting('app.doc_invoice', true), 'off') <> 'on' then
    raise exception 'invoice refused for order %: it is already delivered — raise the GST document instead of a second sale',
      v_no;
  end if;

  if exists (
    select 1 from invoices i
     where i.order_id = new.order_id
       and i.status <> 'void'
       and i.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'invoice refused: order % already has a live invoice', v_no;
  end if;

  return new;
end $$;

drop trigger if exists invoices_order_guard on public.invoices;
create trigger invoices_order_guard
  before insert on public.invoices
  for each row execute function public.invoices_order_guard();

comment on function public.invoices_order_guard() is
  'Refuses a second live invoice for an order, and any sale invoice for an already-delivered order. generate_gst_invoice sets app.doc_invoice to attach its document.';

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------
revoke all on function public.post_invoice_from_order(uuid, jsonb, boolean, date) from public, anon;
grant execute on function public.post_invoice_from_order(uuid, jsonb, boolean, date)
  to authenticated, service_role;

revoke all on function public.post_delivery(uuid) from public, anon;
grant execute on function public.post_delivery(uuid) to authenticated, service_role;

revoke all on function public.generate_gst_invoice(uuid, date) from public, anon;
grant execute on function public.generate_gst_invoice(uuid, date) to authenticated, service_role;

revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated, service_role;

revoke all on function public.convert_invoice_type(uuid, text) from public, anon;
grant execute on function public.convert_invoice_type(uuid, text) to authenticated, service_role;

revoke all on function public.invoices_order_guard() from public, anon, authenticated;
grant execute on function public.invoices_order_guard() to service_role;

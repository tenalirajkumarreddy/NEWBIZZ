-- =====================================================================
-- 0009_collections.sql  ·  Phase 1 — customer collections (receipts)
--
-- record_receipt: Dr Cash/Bank (or user custody) / Cr AR (customer). One
-- transaction via post_journal (Invariants 1,3,4). Allocations knock down
-- specific invoices and maintain the invoices.amount_paid read-model (Inv 5).
--
-- If the receipt is collected in the field by a staff member holding cash,
-- the debit lands in 2140 (User Custody / Float) keyed to that user, until
-- they deposit it (a later cash-deposit move clears 2140 into bank 1120).
-- =====================================================================

create type receipt_mode as enum ('cash','upi','bank','cheque','card','adjustment');

-- ---------------------------------------------------------------------
-- customer_receipts  (money in)
-- ---------------------------------------------------------------------
create table customer_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null,
  fy_id         uuid not null references financial_years(id),
  customer_id   uuid not null references customers(id),
  store_id      uuid references customer_stores(id),      -- where it was collected
  receipt_date  date not null default current_date,
  mode          receipt_mode not null,
  amount        numeric(14,2) not null check (amount > 0),
  reference     text,                                     -- UPI ref / cheque no / txn id
  -- where the debit landed:
  deposit_account text not null default '1110',           -- 1110 cash, 1120 bank, or 2140 custody
  collected_by  uuid references users(id),                -- staff who took custody (for 2140)
  journal_entry_id uuid references journal_entries(id),
  allocated_amount numeric(14,2) not null default 0,      -- read-model: sum of allocations
  status        text not null default 'posted',           -- posted | void
  notes         text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (fy_id, receipt_no)
);
create index customer_receipts_customer_idx on customer_receipts (customer_id, receipt_date);
comment on column customer_receipts.allocated_amount is 'Read-model; unallocated = amount - allocated_amount (on-account).';

-- ---------------------------------------------------------------------
-- receipt_allocations  (which invoices a receipt paid down)
-- ---------------------------------------------------------------------
create table receipt_allocations (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references customer_receipts(id) on delete cascade,
  invoice_id   uuid not null references invoices(id),
  amount       numeric(14,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);
create index receipt_allocations_invoice_idx on receipt_allocations (invoice_id);

-- ---------------------------------------------------------------------
-- invoice_outstanding(invoice) -> amount still due (from truth: allocations)
-- ---------------------------------------------------------------------
create or replace function invoice_outstanding(p_invoice uuid)
returns numeric
language sql stable as $$
  select i.grand_total
       - coalesce((select sum(a.amount) from receipt_allocations a
                    join customer_receipts r on r.id = a.receipt_id
                   where a.invoice_id = p_invoice and r.status = 'posted'), 0)
    from invoices i where i.id = p_invoice;
$$;

-- ---------------------------------------------------------------------
-- record_receipt(header jsonb, allocations jsonb) -> receipt id
--   header: { customer_id, store_id?, receipt_date?, mode, amount,
--             reference?, deposit_account?, collected_by?, notes? }
--   allocations: [ { invoice_id, amount }, ... ]  (optional; rest = on-account)
--
-- Posts Dr deposit_account / Cr AR(customer). Validates allocations don't
-- exceed the receipt or an invoice's outstanding. Updates read-models.
-- ---------------------------------------------------------------------
create or replace function record_receipt(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid := (p_header->>'customer_id')::uuid;
  v_date    date := coalesce((p_header->>'receipt_date')::date, current_date);
  v_fy      uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_mode    receipt_mode := (p_header->>'mode')::receipt_mode;
  v_deposit text := coalesce(nullif(p_header->>'deposit_account',''), '1110');
  v_staff   uuid := nullif(p_header->>'collected_by','')::uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_inv     uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_dr_lines jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  insert into customer_receipts (receipt_no, fy_id, customer_id, store_id, receipt_date,
                                 mode, amount, reference, deposit_account, collected_by, notes, created_by)
  values (v_rno, v_fy, v_cust, nullif(p_header->>'store_id','')::uuid, v_date,
          v_mode, v_amount, p_header->>'reference', v_deposit, v_staff, p_header->>'notes', v_actor)
  returning id into v_rcpt;

  ------------------------------------------------------------ value posting
  -- Dr deposit account (cash/bank/custody) / Cr AR (customer control)
  -- custody (2140) carries the collecting user as its party.
  v_dr_lines := jsonb_build_array(
    case when v_deposit = '2140' then
      jsonb_build_object('account_code','2140','debit', v_amount,'credit',0,
                         'party_type','user','party_id', coalesce(v_staff, v_actor)::text)
    else
      jsonb_build_object('account_code', v_deposit,'debit', v_amount,'credit',0)
    end,
    jsonb_build_object('account_code','1130','debit',0,'credit', v_amount,
                       'party_type','customer','party_id', v_cust::text));

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_dr_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  ------------------------------------------------------------- allocations
  if jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_inv  := (v_alloc->>'invoice_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      -- guard: cannot pay an invoice belonging to another customer
      if (select customer_id from invoices where id = v_inv) is distinct from v_cust then
        raise exception 'allocation invoice % is not for customer %', v_inv, v_cust;
      end if;
      v_out := invoice_outstanding(v_inv);
      if v_aamt > v_out then
        raise exception 'allocation % exceeds invoice % outstanding %', v_aamt, v_inv, v_out;
      end if;

      insert into receipt_allocations (receipt_id, invoice_id, amount)
        values (v_rcpt, v_inv, v_aamt);
      v_sum_alloc := v_sum_alloc + v_aamt;

      -- maintain invoice read-model (Invariant 5)
      update invoices set
          amount_paid = amount_paid + v_aamt,
          status = (case when (amount_paid + v_aamt) >= grand_total then 'paid'
                        else 'part_paid' end)::invoice_status
        where id = v_inv;
    end loop;
  end if;

  if v_sum_alloc > v_amount then
    raise exception 'record_receipt: allocations % exceed receipt amount %', v_sum_alloc, v_amount;
  end if;
  update customer_receipts set allocated_amount = v_sum_alloc where id = v_rcpt;

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;
comment on function record_receipt is
  'Money in: Dr cash/bank/custody, Cr AR. Allocates to invoices, updates read-models. One transaction.';

-- ---------------------------------------------------------------------
-- customer_outstanding(customer) -> total AR due (from posted invoices)
-- ---------------------------------------------------------------------
create or replace function customer_outstanding(p_customer uuid)
returns numeric
language sql stable as $$
  select coalesce(sum(invoice_outstanding(i.id)), 0)
    from invoices i
   where i.customer_id = p_customer and i.status in ('posted','part_paid');
$$;

-- =====================================================================
-- RLS for Phase 1 tables — reads open to authenticated; writes go through
-- the security-definer RPCs above (Invariant 3). Config/master tables
-- (items, customers, price lists) are directly writable with permission.
-- =====================================================================
alter table units                enable row level security;
alter table item_categories      enable row level security;
alter table items                enable row level security;
alter table price_lists          enable row level security;
alter table price_list_items     enable row level security;
alter table customers            enable row level security;
alter table customer_stores      enable row level security;
alter table stock                enable row level security;
alter table stock_ledger         enable row level security;
alter table sales_orders         enable row level security;
alter table sales_order_lines    enable row level security;
alter table invoices             enable row level security;
alter table invoice_lines        enable row level security;
alter table customer_receipts    enable row level security;
alter table receipt_allocations  enable row level security;

-- read access for any authenticated user
create policy read_all_auth on units             for select to authenticated using (true);
create policy read_all_auth on item_categories   for select to authenticated using (true);
create policy read_all_auth on items             for select to authenticated using (true);
create policy read_all_auth on price_lists       for select to authenticated using (true);
create policy read_all_auth on price_list_items  for select to authenticated using (true);
create policy read_all_auth on customers         for select to authenticated using (true);
create policy read_all_auth on customer_stores   for select to authenticated using (true);
create policy read_all_auth on stock             for select to authenticated using (true);
create policy read_all_auth on stock_ledger      for select to authenticated using (true);
create policy read_all_auth on sales_orders      for select to authenticated using (true);
create policy read_all_auth on sales_order_lines for select to authenticated using (true);
create policy read_all_auth on invoices          for select to authenticated using (true);
create policy read_all_auth on invoice_lines     for select to authenticated using (true);
create policy read_all_auth on customer_receipts for select to authenticated using (true);
create policy read_all_auth on receipt_allocations for select to authenticated using (true);

-- master-data writes gated by permission (these are not money tables)
create policy manage_items on items for all to authenticated
  using (has_permission('customer.manage') or has_permission('inventory.view'))
  with check (has_permission('customer.manage') or has_permission('inventory.view'));
create policy manage_units on units for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_item_cats on item_categories for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_price_lists on price_lists for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_price_items on price_list_items for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_customers on customers for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_stores on customer_stores for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));

-- orders may be created by sales staff directly (demand, not money); the value
-- events (invoice/receipt/stock) have NO write policy => only definer RPCs write.
create policy manage_orders on sales_orders for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));
create policy manage_order_lines on sales_order_lines for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));

-- =====================================================================
-- 0131_returns_and_ledger_rebuild.sql
--
-- C5 / H6 remediation:
--   * returns and credit notes now reduce the invoice and write a negative
--     customer_ledger row instead of leaving the invoice fully outstanding;
--   * credit_note_allocations records how much of a credit cleared which
--     invoice, and invoice_outstanding() subtracts it;
--   * rebuild_customer_ledger() becomes the inverse of posting: void invoices
--     are excluded, credit notes are included as negatives, and a delivered
--     challan is only counted when its order has no live invoice;
--   * customer_ledger gets a monotonic `seq`, and every latest-balance read
--     orders by it instead of the non-unique (created_at, id);
--   * void_invoice() has been failing since 0102 because it writes the
--     txn_type 'sale_void' that the 0051 CHECK constraint rejects. The
--     constraint now allows it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Monotonic ledger order
-- ---------------------------------------------------------------------
alter table public.customer_ledger
  add column if not exists seq bigserial;

create index if not exists idx_customer_ledger_customer_seq
  on public.customer_ledger (customer_id, seq desc);

comment on column public.customer_ledger.seq is
  'Monotonic insertion order. Sole ordering key for latest-balance reads: created_at is not unique inside one transaction.';

-- void_invoice() writes 'sale_void'; 0051's CHECK never allowed it, so every
-- void attempt rolled back on the ledger insert.
alter table public.customer_ledger
  drop constraint if exists customer_ledger_txn_type_check;
alter table public.customer_ledger
  add constraint customer_ledger_txn_type_check
  check (txn_type in ('sale','payment','credit_note','debit_note','scheme','opening','sale_void'));

-- ---------------------------------------------------------------------
-- 2. Credit-note allocations
-- ---------------------------------------------------------------------
create table if not exists public.credit_note_allocations (
  id             uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  invoice_id     uuid not null references public.invoices(id),
  amount         numeric(14,2) not null check (amount > 0),
  created_at     timestamptz not null default now(),
  unique (credit_note_id, invoice_id)
);
create index if not exists credit_note_allocations_invoice_idx
  on public.credit_note_allocations (invoice_id);

alter table public.credit_note_allocations enable row level security;
drop policy if exists read_credit_note_allocations on public.credit_note_allocations;
create policy read_credit_note_allocations on public.credit_note_allocations
  for select to authenticated using (public.is_staff_principal());

-- Reads must work for every caller of customer_outstanding(), including
-- portal principals, so this stays SECURITY DEFINER and bypasses that RLS.
create or replace function public.invoice_outstanding(p_invoice uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    i.grand_total
    - coalesce((select sum(a.amount) from receipt_allocations a
                  join customer_receipts r on r.id = a.receipt_id
                 where a.invoice_id = p_invoice and r.status = 'posted'), 0)
    - coalesce((select sum(ca.amount) from credit_note_allocations ca
                  join credit_notes cn on cn.id = ca.credit_note_id
                 where ca.invoice_id = p_invoice and cn.status = 'posted'), 0),
  0)
  from invoices i where i.id = p_invoice;
$$;
comment on function invoice_outstanding is
  'Invoice due = grand_total - posted receipt allocations - posted credit-note allocations. Never negative.';

-- ---------------------------------------------------------------------
-- 3. _post_credit_note — allocate to the referenced invoice + ledger row
-- ---------------------------------------------------------------------
create or replace function public._post_credit_note(
  p_store uuid, p_amount numeric, p_reason credit_note_reason, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid;
  v_date    date := coalesce((p_opts->>'date')::date, current_date);
  v_fy      uuid := fy_for_date(coalesce((p_opts->>'date')::date, current_date));
  v_gstadj  boolean := coalesce((p_opts->>'gst_adjusted')::boolean, false);
  v_base    numeric(14,2);
  v_tax     numeric(14,2) := coalesce((p_opts->>'tax_amount')::numeric, 0);
  v_ref     uuid := nullif(p_opts->>'reference_sale_id','')::uuid;
  v_ref_cust uuid;
  v_alloc   numeric(14,2);
  v_prev_bal numeric(14,2);
  v_no      text;
  v_je      uuid;
  v_cn      uuid;
  v_lines   jsonb;
  v_actor   uuid := public.current_app_user();
begin
  if p_amount is null or p_amount <= 0 then raise exception '_post_credit_note: amount must be > 0'; end if;
  select customer_id into v_cust from customer_stores where id = p_store;
  if v_cust is null then raise exception '_post_credit_note: unknown store %', p_store; end if;

  if v_gstadj then
    v_base := coalesce((p_opts->>'base_amount')::numeric, p_amount - v_tax);
    if round(v_base + v_tax, 2) <> round(p_amount, 2) then
      raise exception '_post_credit_note: base %+tax % <> amount %', v_base, v_tax, p_amount;
    end if;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5180','debit', v_base, 'credit', 0),
      jsonb_build_object('account_code','2120','debit', v_tax,  'credit', 0),
      jsonb_build_object('account_code','1130','debit', 0, 'credit', p_amount,
                         'party_type','customer','party_id', v_cust::text));
  else
    v_base := p_amount; v_tax := 0;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5180','debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code','1130','debit', 0, 'credit', p_amount,
                         'party_type','customer','party_id', v_cust::text));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','credit_note',
                       'source','credit_note',
                       'narration', coalesce(p_opts->>'narration',
                         format('Credit note (%s) to store %s', p_reason, p_store))),
    v_lines);

  v_no := next_number('credit_note', v_date);
  insert into credit_notes (credit_note_no, fy_id, customer_store_id, customer_id,
                            amount, base_amount, tax_amount, reason, reference_sale_id,
                            scheme_eligibility_id, complaint_id, narration, status,
                            journal_entry_id, approved_by, created_by)
  values (v_no, v_fy, p_store, v_cust, p_amount, v_base, v_tax, p_reason, v_ref,
          nullif(p_opts->>'scheme_eligibility_id','')::uuid,
          nullif(p_opts->>'complaint_id','')::uuid,
          p_opts->>'narration', 'posted', v_je, v_actor, v_actor)
  returning id into v_cn;

  update journal_entries set source_id = v_cn where id = v_je;

  -- Apply the credit to the referenced invoice, capped at what is still due.
  -- Any excess stays as an unapplied customer credit (negative ledger).
  if v_ref is not null then
    select customer_id into v_ref_cust from invoices where id = v_ref for update;
    if v_ref_cust is null then
      raise exception '_post_credit_note: unknown invoice %', v_ref;
    end if;
    if v_ref_cust <> v_cust then
      raise exception '_post_credit_note: invoice % is not for the credit-note customer', v_ref;
    end if;
    v_alloc := least(p_amount, invoice_outstanding(v_ref));
    if v_alloc > 0.005 then
      insert into credit_note_allocations (credit_note_id, invoice_id, amount)
        values (v_cn, v_ref, v_alloc);
      update invoices
         set amount_paid = amount_paid + v_alloc,
             status = (case when amount_paid + v_alloc >= grand_total then 'paid'
                            when amount_paid + v_alloc > 0 then 'part_paid'
                            else 'posted' end)::invoice_status
       where id = v_ref;
    end if;
  end if;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (p_store, v_cust, 'credit_note', v_cn, 'credit_notes',
            -p_amount, v_prev_bal - p_amount);

  perform write_audit('post','credit_notes', v_cn::text,
            format('Credit note %s: %s to store %s', v_no, p_amount, p_store),
            jsonb_build_object('credit_note_no', v_no, 'amount', p_amount,
                               'gst_adjusted', v_gstadj,
                               'allocated', coalesce(v_alloc, 0)), v_actor);
  return v_cn;
end $$;

-- ---------------------------------------------------------------------
-- 4. record_sales_return — lock the invoice, allocate the credit, ledger it
-- ---------------------------------------------------------------------
create or replace function public.record_sales_return(
  p_invoice uuid, p_lines jsonb, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     invoices%rowtype;
  v_cust    uuid;
  v_date    date := coalesce(nullif(p_opts->>'date','')::date, current_date);
  v_fy      uuid;
  v_line    jsonb;
  v_il      invoice_lines%rowtype;
  v_ilid    uuid; v_qty numeric(14,3);
  v_returned numeric(14,3);
  v_frac    numeric;
  v_base    numeric(14,2); v_tax numeric(14,2);
  v_cogs_u  numeric(14,4);
  v_sum_base numeric(14,2) := 0; v_sum_tax numeric(14,2) := 0;
  v_gross   numeric(14,2);
  v_je      uuid; v_cn uuid;
  v_no      text;
  v_ln      int := 0;
  v_jlines  jsonb := '[]'::jsonb;
  v_rlines  jsonb := '[]'::jsonb;
  v_alloc   numeric(14,2);
  v_prev_bal numeric(14,2);
  v_actor   uuid := public.current_app_user();
begin
  if not has_permission('invoice.void') then
    raise exception 'record_sales_return: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'record_sales_return: unknown invoice %', p_invoice; end if;
  if v_inv.status = 'void' then raise exception 'record_sales_return: invoice % is void', p_invoice; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'record_sales_return: at least one line required';
  end if;

  v_cust := v_inv.customer_id;
  v_fy   := fy_for_date(v_date);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ilid := (v_line->>'invoice_line_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    -- Lock the line so two concurrent returns cannot both pass the check.
    select * into v_il from invoice_lines
     where id = v_ilid and invoice_id = p_invoice
     for update;
    if not found then
      raise exception 'record_sales_return: line % not on invoice %', v_ilid, p_invoice;
    end if;

    select coalesce(sum(qty),0) into v_returned
      from sales_return_lines where invoice_line_id = v_ilid;
    if v_returned + v_qty > v_il.qty + 1e-6 then
      raise exception 'record_sales_return: line % over-returned (sold %, already %, now %)',
        v_ilid, v_il.qty, v_returned, v_qty;
    end if;

    v_frac := v_qty / v_il.qty;
    v_base := round(v_il.taxable_amount * v_frac, 2);
    v_tax  := round((coalesce(v_il.cgst_amount,0) + coalesce(v_il.sgst_amount,0)
                   + coalesce(v_il.igst_amount,0) + coalesce(v_il.cess_amount,0)) * v_frac, 2);

    select unit_cost into v_cogs_u
      from stock_ledger
     where source = 'invoice' and source_id = p_invoice
       and item_id = v_il.item_id and move_type = 'sale_out'
     order by moved_at limit 1;
    v_cogs_u := coalesce(v_cogs_u, 0);

    v_ln := v_ln + 1;
    v_sum_base := v_sum_base + v_base;
    v_sum_tax  := v_sum_tax  + v_tax;

    v_rlines := v_rlines || jsonb_build_array(jsonb_build_object(
      'invoice_line_id', v_ilid::text, 'item_id', v_il.item_id::text,
      'qty', v_qty, 'unit_cogs', v_cogs_u,
      'taxable_amount', v_base, 'tax_amount', v_tax, 'line_no', v_ln));
  end loop;

  if v_ln = 0 then raise exception 'record_sales_return: nothing to return'; end if;
  v_gross := v_sum_base + v_sum_tax;
  if v_gross <= 0 then raise exception 'record_sales_return: zero-value return'; end if;

  v_jlines := jsonb_build_array(
    jsonb_build_object('account_code','4900','debit', v_sum_base, 'credit', 0));
  if v_sum_tax > 0 then
    v_jlines := v_jlines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit', v_sum_tax, 'credit', 0));
  end if;
  v_jlines := v_jlines || jsonb_build_array(
    jsonb_build_object('account_code','1130','debit', 0, 'credit', v_gross,
                       'party_type','customer','party_id', v_cust::text));

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','credit_note',
                       'narration', coalesce(nullif(p_opts->>'narration',''),
                         'Sales return against '||v_inv.invoice_no)),
    v_jlines);

  v_no := next_number('credit_note', v_date);
  insert into credit_notes (credit_note_no, fy_id, customer_store_id, customer_id,
                            amount, base_amount, tax_amount, reason, reference_sale_id,
                            narration, status, journal_entry_id, approved_by, created_by)
  values (v_no, v_fy, v_inv.store_id, v_cust, v_gross, v_sum_base, v_sum_tax,
          'sales_adjustment', p_invoice,
          coalesce(nullif(p_opts->>'narration',''), 'Sales return against '||v_inv.invoice_no),
          'posted', v_je, v_actor, v_actor)
  returning id into v_cn;

  update journal_entries set source_id = v_cn where id = v_je;

  -- Reduce what the customer owes on this invoice. Capped at the current due,
  -- so a return of already-paid goods leaves an unapplied customer credit.
  v_alloc := least(v_gross, invoice_outstanding(p_invoice));
  if v_alloc > 0.005 then
    insert into credit_note_allocations (credit_note_id, invoice_id, amount)
      values (v_cn, p_invoice, v_alloc);
    update invoices
       set amount_paid = amount_paid + v_alloc,
           status = (case when amount_paid + v_alloc >= grand_total then 'paid'
                          when amount_paid + v_alloc > 0 then 'part_paid'
                          else 'posted' end)::invoice_status
     where id = p_invoice;
  end if;

  v_prev_bal := coalesce(previous_customer_balance(v_cust), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_inv.store_id, v_cust, 'credit_note', v_cn, 'credit_notes',
            -v_gross, v_prev_bal - v_gross);

  for v_line in select * from jsonb_array_elements(v_rlines) loop
    if (v_line->>'unit_cogs')::numeric > 0 then
      perform post_stock_move(
        (v_line->>'item_id')::uuid, v_inv.branch_id, 'adjust_in',
        (v_line->>'qty')::numeric, (v_line->>'unit_cogs')::numeric,
        '5100', 'credit_note', v_cn, v_date);
    end if;
    insert into sales_return_lines (credit_note_id, invoice_id, invoice_line_id, item_id,
                                    qty, unit_cogs, taxable_amount, tax_amount, line_no)
    values (v_cn, p_invoice, (v_line->>'invoice_line_id')::uuid, (v_line->>'item_id')::uuid,
            (v_line->>'qty')::numeric, (v_line->>'unit_cogs')::numeric,
            (v_line->>'taxable_amount')::numeric, (v_line->>'tax_amount')::numeric,
            (v_line->>'line_no')::int);
  end loop;

  perform write_audit('post','credit_notes', v_cn::text,
            format('Sales return %s against %s: %s', v_no, v_inv.invoice_no, v_gross),
            jsonb_build_object('credit_note_no', v_no, 'invoice_no', v_inv.invoice_no,
                               'amount', v_gross, 'lines', v_ln, 'allocated', v_alloc),
            v_actor);
  return v_cn;
end $$;

-- ---------------------------------------------------------------------
-- 5. rebuild_customer_ledger — inverse of posting
-- ---------------------------------------------------------------------
create or replace function public.rebuild_customer_ledger(
  p_customer_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_bal numeric(14,2) := 0;
  v_count int := 0;
  v_scope text;
begin
  if p_customer_id is not null then
    delete from customer_ledger where customer_id = p_customer_id;
    v_scope := 'customer ' || p_customer_id;
  else
    delete from customer_ledger;
    v_scope := 'all customers';
  end if;

  for v_rec in (
    -- Sales: posted/part-paid/paid invoices only. Void invoices are excluded;
    -- the runtime void row is a reversal of a row that no longer exists here.
    select 'sale' as txn_type, i.id as ref_id, 'invoices' as ref_type,
           i.grand_total as amount, i.customer_id, i.store_id,
           coalesce(i.invoice_date::timestamptz, i.created_at) as txn_time
      from invoices i
     where (p_customer_id is null or i.customer_id = p_customer_id)
       and i.status <> 'void'
       and i.grand_total > 0
    union all
    -- Delivery is the value event only while its order has no live invoice.
    select 'sale' as txn_type, dc.id as ref_id, 'delivery_challans' as ref_type,
           coalesce((
             select sum(jl.debit)
               from journal_lines jl
              where jl.entry_id = dc.journal_entry_id and jl.account_code = '1130'
           ), 0)
           - coalesce((
             select abs(jl2.credit) from journal_lines jl2
              where jl2.entry_id = dc.journal_entry_id and jl2.account_code = '5700'
           ), 0) as amount,
           so.customer_id, so.store_id,
           coalesce(dc.delivered_at::timestamptz, dc.created_at) as txn_time
      from delivery_challans dc
      join sales_orders so on so.id = dc.order_id
     where (p_customer_id is null or so.customer_id = p_customer_id)
       and dc.status = 'delivered'
       and so.status = 'fulfilled'   -- void_invoice() resets the order to approved
       and dc.journal_entry_id is not null
       and not exists (
         select 1 from invoices i
          where i.order_id = dc.order_id and i.status <> 'void'
       )
    union all
    select 'payment' as txn_type, r.id as ref_id, 'customer_receipts' as ref_type,
           -r.amount as amount, r.customer_id, r.store_id,
           coalesce(r.receipt_date::timestamptz, r.created_at) as txn_time
      from customer_receipts r
     where (p_customer_id is null or r.customer_id = p_customer_id)
       and r.amount > 0
       and r.status = 'posted'
    union all
    select 'credit_note' as txn_type, cn.id as ref_id, 'credit_notes' as ref_type,
           -cn.amount as amount, cn.customer_id, cn.customer_store_id,
           cn.created_at as txn_time
      from credit_notes cn
     where (p_customer_id is null or cn.customer_id = p_customer_id)
       and cn.status = 'posted'
    order by txn_time, ref_id
  ) loop
    v_bal := v_bal + v_rec.amount;
    insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                                 reference_type, amount, balance_after, created_at)
    values (v_rec.store_id, v_rec.customer_id, v_rec.txn_type, v_rec.ref_id,
            v_rec.ref_type, v_rec.amount, v_bal, v_rec.txn_time);
    v_count := v_count + 1;
  end loop;

  return format('Rebuilt customer_ledger for %s: %s entries, final balance %s', v_scope, v_count, v_bal);
end $$;

comment on function rebuild_customer_ledger is
  'Recomputed customer_ledger from non-void invoices, delivery-only challans, posted receipts and posted credit notes. Idempotent; service-role only.';

-- ---------------------------------------------------------------------
-- 6. Latest-balance reads order by the monotonic seq
--    Only functions that actually touch customer_ledger are rewritten, and
--    within them the only (created_at, id) ordering is a ledger read.
-- ---------------------------------------------------------------------
do $mig$
declare
  r record;
  v_def text;
  v_new text;
  v_count int := 0;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname <> 'rebuild_customer_ledger'
       and p.prosrc like '%customer_ledger%'
       and (p.prosrc like '%created_at desc, id desc%'
            or p.prosrc like '%created_at desc, cl.id desc%')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'created_at desc, cl.id desc', 'seq desc');
    v_new := replace(v_new, 'created_at desc, id desc', 'seq desc');
    if v_new <> v_def then
      execute v_new;
      v_count := v_count + 1;
    end if;
  end loop;
  raise notice '0131: reordered % ledger function(s) by seq', v_count;
end $mig$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
revoke all on function public._post_credit_note(uuid, numeric, credit_note_reason, jsonb)
  from public, anon, authenticated;
grant execute on function public._post_credit_note(uuid, numeric, credit_note_reason, jsonb)
  to service_role;

revoke all on function public.record_sales_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_sales_return(uuid, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.rebuild_customer_ledger(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_customer_ledger(uuid) to service_role;

revoke all on function public.invoice_outstanding(uuid) from public, anon;
grant execute on function public.invoice_outstanding(uuid) to authenticated, service_role;

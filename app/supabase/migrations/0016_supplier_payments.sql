-- =====================================================================
-- 0016_supplier_payments.sql  ·  Phase 2 — money out to suppliers
--
-- Mirror of record_receipt (0009), sides swapped: Dr 2110 AP (supplier) /
-- Cr cash/bank. One transaction via post_journal (Invariants 1,3,4). Allocations
-- knock down specific bills and maintain the supplier_bills.amount_paid
-- read-model (Invariant 5). Unallocated = advance to supplier (on-account).
-- =====================================================================

create type payment_mode as enum ('cash','upi','bank','cheque','card','adjustment');

create table supplier_payments (
  id             uuid primary key default gen_random_uuid(),
  payment_no     text not null,
  fy_id          uuid not null references financial_years(id),
  supplier_id    uuid not null references suppliers(id),
  payment_date   date not null default current_date,
  mode           payment_mode not null,
  amount         numeric(14,2) not null check (amount > 0),
  reference      text,                                     -- UTR / cheque no / txn id
  -- where the credit came from (money leaving us):
  source_account text not null default '1120',             -- 1120 bank, 1110 cash, 2140 custody
  paid_by        uuid references users(id),                -- staff who paid from custody (2140)
  journal_entry_id uuid references journal_entries(id),
  allocated_amount numeric(14,2) not null default 0,       -- read-model: sum of allocations
  status         text not null default 'posted',           -- posted | void
  notes          text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (fy_id, payment_no)
);
create index supplier_payments_supplier_idx on supplier_payments (supplier_id, payment_date);
comment on column supplier_payments.allocated_amount is 'Read-model; unallocated = amount - allocated_amount (advance).';

create table payment_allocations (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references supplier_payments(id) on delete cascade,
  bill_id      uuid not null references supplier_bills(id),
  amount       numeric(14,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (payment_id, bill_id)
);
create index payment_allocations_bill_idx on payment_allocations (bill_id);

-- ---------------------------------------------------------------------
-- bill_outstanding(bill) -> amount still due (from truth: allocations)
-- ---------------------------------------------------------------------
create or replace function bill_outstanding(p_bill uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select b.grand_total
       - coalesce((select sum(a.amount) from payment_allocations a
                    join supplier_payments p on p.id = a.payment_id
                   where a.bill_id = p_bill and p.status = 'posted'), 0)
    from supplier_bills b where b.id = p_bill;
$$;

-- ---------------------------------------------------------------------
-- pay_supplier(header jsonb, allocations jsonb) -> payment id
--   header: { supplier_id, payment_date?, mode, amount, reference?,
--             source_account?, paid_by?, notes? }
--   allocations: [ { bill_id, amount }, ... ]  (optional; rest = advance)
--
-- Posts Dr AP(supplier) / Cr source_account. Validates allocations don't
-- exceed the payment or a bill's outstanding. Updates read-models.
-- ---------------------------------------------------------------------
create or replace function pay_supplier(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supp    uuid := (p_header->>'supplier_id')::uuid;
  v_date    date := coalesce((p_header->>'payment_date')::date, current_date);
  v_fy      uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_mode    payment_mode := (p_header->>'mode')::payment_mode;
  v_source  text := coalesce(nullif(p_header->>'source_account',''), '1120');
  v_staff   uuid := nullif(p_header->>'paid_by','')::uuid;
  v_pno     text;
  v_pay     uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_bill    uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_cr_line jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_supp is null then raise exception 'pay_supplier: supplier_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'pay_supplier: amount must be > 0'; end if;
  v_fy  := fy_for_date(v_date);
  v_pno := next_number('payment', v_date);

  insert into supplier_payments (payment_no, fy_id, supplier_id, payment_date, mode, amount,
                                 reference, source_account, paid_by, notes, created_by)
  values (v_pno, v_fy, v_supp, v_date, v_mode, v_amount,
          p_header->>'reference', v_source, v_staff, p_header->>'notes', v_actor)
  returning id into v_pay;

  ------------------------------------------------------------ value posting
  -- Dr AP (supplier control) / Cr source account (bank/cash/custody).
  -- custody (2140) carries the paying user as its party.
  if v_source = '2140' then
    v_cr_line := jsonb_build_object('account_code','2140','debit',0,'credit', v_amount,
                                    'party_type','user','party_id', coalesce(v_staff, v_actor)::text);
  else
    v_cr_line := jsonb_build_object('account_code', v_source,'debit',0,'credit', v_amount);
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','payment', 'source_id', v_pay::text,
                       'narration','Payment '||v_pno),
    jsonb_build_array(
      jsonb_build_object('account_code','2110','debit', v_amount,'credit',0,
                         'party_type','supplier','party_id', v_supp::text),
      v_cr_line));

  update supplier_payments set journal_entry_id = v_je where id = v_pay;

  ------------------------------------------------------------- allocations
  if jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_bill := (v_alloc->>'bill_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      -- guard: cannot pay a bill belonging to another supplier
      if (select supplier_id from supplier_bills where id = v_bill) is distinct from v_supp then
        raise exception 'allocation bill % is not for supplier %', v_bill, v_supp;
      end if;
      v_out := bill_outstanding(v_bill);
      if v_aamt > v_out then
        raise exception 'allocation % exceeds bill % outstanding %', v_aamt, v_bill, v_out;
      end if;

      insert into payment_allocations (payment_id, bill_id, amount)
        values (v_pay, v_bill, v_aamt);
      v_sum_alloc := v_sum_alloc + v_aamt;

      -- maintain bill read-model (Invariant 5); cast to bill_status (0010 lesson)
      update supplier_bills set
          amount_paid = amount_paid + v_aamt,
          status = (case when (amount_paid + v_aamt) >= grand_total then 'paid'
                        else 'part_paid' end)::bill_status
        where id = v_bill;
    end loop;
  end if;

  if v_sum_alloc > v_amount then
    raise exception 'pay_supplier: allocations % exceed payment amount %', v_sum_alloc, v_amount;
  end if;
  update supplier_payments set allocated_amount = v_sum_alloc where id = v_pay;

  perform write_audit('post','supplier_payments', v_pay::text,
            format('Payment %s %s to supplier', v_pno, v_amount),
            jsonb_build_object('payment_no', v_pno, 'amount', v_amount, 'allocated', v_sum_alloc), v_actor);
  return v_pay;
end $$;
comment on function pay_supplier is
  'Money out: Dr AP, Cr cash/bank/custody. Allocates to bills, updates read-models. One transaction.';

-- ---------------------------------------------------------------------
-- supplier_outstanding(supplier) -> total AP due (from posted bills)
-- ---------------------------------------------------------------------
create or replace function supplier_outstanding(p_supplier uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(bill_outstanding(b.id)), 0)
    from supplier_bills b
   where b.supplier_id = p_supplier and b.status in ('posted','part_paid');
$$;

-- ---------------------------------------------------------------------
-- RLS: reads open to authenticated; payments + allocations have NO write
-- policy — only pay_supplier (definer) writes them (value event).
-- ---------------------------------------------------------------------
alter table supplier_payments   enable row level security;
alter table payment_allocations enable row level security;
create policy read_all_auth on supplier_payments   for select to authenticated using (true);
create policy read_all_auth on payment_allocations for select to authenticated using (true);

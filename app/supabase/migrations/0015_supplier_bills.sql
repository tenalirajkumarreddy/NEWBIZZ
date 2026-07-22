-- =====================================================================
-- 0015_supplier_bills.sql  ·  Phase 2 — supplier bills (purchase invoices)
--
-- The LIABILITY event, mirror of post_invoice on the sell side. A GRN already
-- brought stock in (Dr inventory / Cr 2115 GRNI). The bill now:
--   * clears the GRN-clearing:   Dr 2115 GRNI (goods value, ex-tax)
--   * books the input tax credit: Dr 1140 Input GST Credit (CGST+SGST or IGST)
--   * raises the payable:         Cr 2110 AP (party=supplier)  = goods + tax
--   One transaction (Invariant 4). NO stock move here — goods already in at GRN.
--
-- GST: interstate = supplier.state_code <> our state -> IGST; else CGST+SGST.
-- Input GST posts to a single credit account (1140); we don't split the asset
-- by CGST/SGST/IGST in v1 (the return breaks it out from journal_lines memos).
-- =====================================================================

create type bill_status as enum ('posted','paid','part_paid','void');

-- ---------------------------------------------------------------------
-- supplier_bills  (purchase invoice — the payable document)
-- ---------------------------------------------------------------------
create table supplier_bills (
  id             uuid primary key default gen_random_uuid(),
  bill_no        text not null,                     -- our internal number
  supplier_bill_no text,                            -- the supplier's invoice number
  fy_id          uuid not null references financial_years(id),
  supplier_id    uuid not null references suppliers(id),
  branch_id      uuid not null references branches(id),
  bill_date      date not null default current_date,
  due_date       date,
  is_interstate  boolean not null default false,
  -- money (derived from lines)
  taxable_amount numeric(14,2) not null default 0,
  cgst_amount    numeric(14,2) not null default 0,
  sgst_amount    numeric(14,2) not null default 0,
  igst_amount    numeric(14,2) not null default 0,
  cess_amount    numeric(14,2) not null default 0,
  round_off      numeric(14,2) not null default 0,
  grand_total    numeric(14,2) not null default 0,  -- goods + tax = AP raised
  journal_entry_id uuid references journal_entries(id),
  status         bill_status not null default 'posted',
  amount_paid    numeric(14,2) not null default 0,  -- read-model, maintained by payments
  notes          text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (fy_id, bill_no)
);
create index supplier_bills_supplier_idx on supplier_bills (supplier_id, bill_date);
create index supplier_bills_status_idx   on supplier_bills (status) where status in ('posted','part_paid');
comment on column supplier_bills.amount_paid is 'Read-model (Invariant 5); truth is payment_allocations sum.';

create table supplier_bill_lines (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references supplier_bills(id) on delete cascade,
  item_id      uuid references items(id),           -- nullable: expense/charge lines
  expense_account text,                             -- for non-stock charges (e.g. freight 5530)
  description  text,
  qty          numeric(14,3) not null default 1 check (qty > 0),
  unit_cost    numeric(14,2) not null,
  taxable_amount numeric(14,2) not null,            -- qty * unit_cost
  gst_rate     numeric(5,2)  not null,
  cgst_amount  numeric(14,2) not null default 0,
  sgst_amount  numeric(14,2) not null default 0,
  igst_amount  numeric(14,2) not null default 0,
  cess_amount  numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null,
  line_no      int not null default 1,
  check (item_id is not null or expense_account is not null)  -- either stock or an expense
);
create index supplier_bill_lines_bill_idx on supplier_bill_lines (bill_id);

-- ---------------------------------------------------------------------
-- post_supplier_bill(header jsonb, lines jsonb) -> supplier_bills.id
--   header: { supplier_id, bill_date?, branch_id?, supplier_bill_no?, due_date?,
--             grn_id?, clearing_account? (default 2115), notes? }
--   lines : [ { item_id?|expense_account?, description?, qty?, unit_cost, gst_rate? }, ... ]
--
-- Posts: Dr clearing/expense (goods, ex-tax) + Dr 1140 Input GST / Cr 2110 AP.
-- For a bill matched to a GRN, item lines debit 2115 (clearing the GRNI booked
-- at receipt). Pure expense lines (freight, etc.) debit their expense account.
-- ---------------------------------------------------------------------
create or replace function post_supplier_bill(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_date     date := coalesce((p_header->>'bill_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_home     text;
  v_supp_st  text;
  v_inter    boolean;
  v_clearing text := coalesce(nullif(p_header->>'clearing_account',''), '2115');
  v_grn      uuid := nullif(p_header->>'grn_id','')::uuid;
  v_bill     uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_expacct text; v_qty numeric(14,3); v_cost numeric(14,2); v_rate numeric(5,2);
  v_cess_r   numeric(5,2); v_type item_type;
  v_taxable  numeric(14,2); v_cgst numeric(14,2); v_sgst numeric(14,2);
  v_igst     numeric(14,2); v_cess numeric(14,2); v_ltot numeric(14,2);
  v_dr_acct  text;
  v_sum_tax  numeric(14,2) := 0; v_sum_cgst numeric(14,2) := 0; v_sum_sgst numeric(14,2) := 0;
  v_sum_igst numeric(14,2) := 0; v_sum_cess numeric(14,2) := 0;
  v_input_gst numeric(14,2);
  v_grand    numeric(14,2); v_round numeric(14,2);
  v_ln       int := 0;
  v_je       uuid;
  v_lines    jsonb := '[]'::jsonb;     -- debit lines (goods/expense per account), built up
  v_dr_map   jsonb := '{}'::jsonb;     -- account_code -> accumulated debit (merge same accounts)
  v_key      text;
  v_je_lines jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_supplier is null then raise exception 'post_supplier_bill: supplier_id required'; end if;
  select state_code into v_supp_st from suppliers where id = v_supplier;
  if v_supp_st is null then raise exception 'post_supplier_bill: unknown supplier %', v_supplier; end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  select state_code into v_home from branches where id = v_branch;
  v_home   := coalesce(v_home, (select state_code from company_settings limit 1), '33');
  v_inter  := (v_supp_st is distinct from v_home);
  v_no     := next_number('bill', v_date);

  insert into supplier_bills (bill_no, supplier_bill_no, fy_id, supplier_id, branch_id,
                              bill_date, due_date, is_interstate, status, notes, created_by)
  values (v_no, p_header->>'supplier_bill_no', v_fy, v_supplier, v_branch,
          v_date, nullif(p_header->>'due_date','')::date, v_inter, 'posted',
          p_header->>'notes', v_actor)
  returning id into v_bill;

  ------------------------------------------------------------------- lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item    := nullif(v_line->>'item_id','')::uuid;
    v_expacct := nullif(v_line->>'expense_account','');
    v_qty     := coalesce(nullif(v_line->>'qty','')::numeric, 1);
    v_cost    := (v_line->>'unit_cost')::numeric;
    if v_cost is null then raise exception 'post_supplier_bill: unit_cost required'; end if;
    if v_qty <= 0 then raise exception 'post_supplier_bill: qty must be > 0'; end if;

    if v_item is not null then
      select gst_rate, cess_rate, type into v_rate, v_cess_r, v_type from items where id = v_item;
      -- stock item -> debit the clearing account (clears the GRNI from the GRN)
      v_dr_acct := v_clearing;
    else
      -- pure expense/charge line -> debit its expense account
      v_dr_acct := v_expacct;
      v_rate    := coalesce(nullif(v_line->>'gst_rate','')::numeric, 0);
      v_cess_r  := 0;
    end if;
    v_rate := coalesce(nullif(v_line->>'gst_rate','')::numeric, v_rate, 0);
    v_cess_r := coalesce(v_cess_r, 0);

    v_taxable := round(v_qty * v_cost, 2);
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

    insert into supplier_bill_lines (bill_id, item_id, expense_account, description, qty, unit_cost,
                                     taxable_amount, gst_rate, cgst_amount, sgst_amount,
                                     igst_amount, cess_amount, line_total, line_no)
    values (v_bill, v_item, v_expacct, v_line->>'description', v_qty, v_cost,
            v_taxable, v_rate, v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    -- accumulate the debit for this account (merge lines hitting the same account)
    v_key := v_dr_acct;
    v_dr_map := jsonb_set(v_dr_map, array[v_key],
                  to_jsonb(coalesce((v_dr_map->>v_key)::numeric, 0) + v_taxable));

    v_sum_tax  := v_sum_tax + v_taxable; v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;   v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;
  end loop;

  if v_ln = 0 then raise exception 'post_supplier_bill: at least one line required'; end if;

  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;
  v_input_gst := v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;

  ------------------------------------------------------------ payable posting
  -- Dr goods/expense (per account) ; Dr 1140 Input GST ; Cr 2110 AP (supplier) ; round-off
  v_je_lines := '[]'::jsonb;
  for v_key in select jsonb_object_keys(v_dr_map) loop
    v_je_lines := v_je_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_key, 'debit', (v_dr_map->>v_key)::numeric, 'credit', 0));
  end loop;
  if v_input_gst > 0 then
    v_je_lines := v_je_lines || jsonb_build_array(
      jsonb_build_object('account_code','1140','debit', v_input_gst,'credit',0,
                         'memo', format('CGST %s SGST %s IGST %s CESS %s',
                                        v_sum_cgst, v_sum_sgst, v_sum_igst, v_sum_cess)));
  end if;
  v_je_lines := v_je_lines || jsonb_build_array(
    jsonb_build_object('account_code','2110','debit',0,'credit', v_grand,
                       'party_type','supplier','party_id', v_supplier::text));
  if v_round <> 0 then
    if v_round > 0 then
      -- grand rounded up: extra credit needs a matching debit to Rounding Off
      v_je_lines := v_je_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', v_round,'credit',0));
    else
      v_je_lines := v_je_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', abs(v_round)));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','purchase', 'source_id', v_bill::text,
                       'narration','Bill '||v_no),
    v_je_lines);

  update supplier_bills set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_bill;

  -- link the GRN (mark billed) if this bill matches one
  if v_grn is not null then
    update purchase_receipts set status='billed', billed_bill_id = v_bill where id = v_grn;
  end if;

  perform write_audit('post','supplier_bills', v_bill::text,
            format('Bill %s total %s', v_no, v_grand),
            jsonb_build_object('bill_no', v_no, 'grand_total', v_grand), v_actor);
  return v_bill;
end $$;
comment on function post_supplier_bill is
  'Liability event: Dr clearing/expense + Input GST, Cr AP. Clears GRNI 2115. One transaction.';

-- ---------------------------------------------------------------------
-- post_bill_from_grn(grn_id, supplier_bill_no?, bill_date?) -> bill id
-- Bills a received GRN in full at the GRN''s costs; clears its 2115 GRNI.
-- ---------------------------------------------------------------------
create or replace function post_bill_from_grn(
  p_grn uuid, p_supplier_bill_no text default null, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grn   purchase_receipts%rowtype;
  v_lines jsonb;
begin
  select * into v_grn from purchase_receipts where id = p_grn;
  if not found then raise exception 'post_bill_from_grn: GRN % not found', p_grn; end if;
  if v_grn.status = 'billed' then raise exception 'GRN % already billed', v_grn.grn_no; end if;
  if v_grn.status = 'cancelled' then raise exception 'GRN % is cancelled', v_grn.grn_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty,
                                      'unit_cost', unit_cost, 'gst_rate', gst_rate)
                   order by line_no)
    into v_lines
    from purchase_receipt_lines where grn_id = p_grn;

  return post_supplier_bill(
    jsonb_build_object('supplier_id', v_grn.supplier_id::text, 'branch_id', v_grn.branch_id::text,
                       'bill_date', p_date, 'grn_id', p_grn::text,
                       'supplier_bill_no', p_supplier_bill_no),
    v_lines);
end $$;

-- ---------------------------------------------------------------------
-- RLS: reads open to authenticated; bills + lines have NO write policy —
-- only post_supplier_bill (definer) writes them (value event). Same as invoices.
-- ---------------------------------------------------------------------
alter table supplier_bills      enable row level security;
alter table supplier_bill_lines enable row level security;
create policy read_all_auth on supplier_bills      for select to authenticated using (true);
create policy read_all_auth on supplier_bill_lines for select to authenticated using (true);

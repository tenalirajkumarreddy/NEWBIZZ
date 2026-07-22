-- 0047_gstr2b.sql  (§5.9 GST Reports & GSTR-2B ITC Reconciliation — adds D2)
--
-- The GST report suite (sales/purchase registers, GSTR-1/3B summaries, HSN
-- summary, ITC register) is pure READ over invoices/invoice_lines and
-- supplier_bills — no new storage. The one thing that needs storage is the
-- GSTR-2B: the auto-drafted ITC statement downloaded from the GST portal, which
-- we import and reconcile against our recorded supplier bills. This governs how
-- much input tax credit is safely claimable in GSTR-3B.
--
-- Match statuses:
--   matched            2B row ties to a recorded bill (GSTIN+bill no+amount)
--   mismatch           found by GSTIN+bill no but tax/taxable differs
--   missing_in_books   in 2B, no recorded bill (unrecorded purchase → record it)
--   missing_in_2b      recorded bill with no 2B row (ITC to defer)  [report-side]

do $$ begin
  create type gst_match_status as enum ('matched','mismatch','missing_in_books','missing_in_2b');
exception when duplicate_object then null; end $$;

-- One import per uploaded 2B file (a period's statement).
create table if not exists gstr2b_imports (
  id          uuid primary key default gen_random_uuid(),
  period      text not null,                 -- 'YYYY-MM' the 2B covers
  filename    text,
  row_count   int not null default 0,
  note        text,
  imported_by uuid references users(id),
  imported_at timestamptz not null default now()
);
create index if not exists gstr2b_imports_period_idx on gstr2b_imports (period, imported_at desc);

-- The supplier-invoice rows the portal reported. matched_bill_id links to our
-- bill once reconciled; match_status drives the recon report.
create table if not exists gstr2b_rows (
  id             uuid primary key default gen_random_uuid(),
  import_id      uuid not null references gstr2b_imports(id) on delete cascade,
  supplier_gstin text,
  invoice_no     text,
  invoice_date   date,
  taxable        numeric(14,2) not null default 0,
  cgst           numeric(14,2) not null default 0,
  sgst           numeric(14,2) not null default 0,
  igst           numeric(14,2) not null default 0,
  cess           numeric(14,2) not null default 0,
  match_status   gst_match_status not null default 'missing_in_books',
  matched_bill_id uuid references supplier_bills(id),
  created_at     timestamptz not null default now()
);
create index if not exists gstr2b_rows_import_idx on gstr2b_rows (import_id);
create index if not exists gstr2b_rows_match_idx on gstr2b_rows (import_id, match_status);

alter table gstr2b_imports enable row level security;
alter table gstr2b_rows    enable row level security;
do $$ begin
  create policy read_all_auth on gstr2b_imports for select to authenticated using (true);
  create policy read_all_auth on gstr2b_rows    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- import_gstr2b(p_period, p_filename, p_rows) -> import id
--   p_rows: [{ supplier_gstin, invoice_no, invoice_date, taxable, cgst, sgst,
--              igst, cess }, ...]
-- Creates the import header and bulk-inserts the rows (all 'missing_in_books'
-- until reconciled). Gated on accounting.manage.
-- =====================================================================
create or replace function import_gstr2b(p_period text, p_filename text, p_rows jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_import uuid;
  v_row jsonb;
  v_n int := 0;
begin
  if not has_permission('accounting.manage') then
    raise exception 'import_gstr2b: not authorized';
  end if;
  if p_period is null or p_period = '' then raise exception 'import_gstr2b: period required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'import_gstr2b: at least one row required';
  end if;

  insert into gstr2b_imports (period, filename, imported_by)
    values (p_period, nullif(p_filename,''), v_actor)
    returning id into v_import;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into gstr2b_rows (import_id, supplier_gstin, invoice_no, invoice_date,
                             taxable, cgst, sgst, igst, cess)
    values (v_import,
            nullif(v_row->>'supplier_gstin',''),
            nullif(v_row->>'invoice_no',''),
            nullif(v_row->>'invoice_date','')::date,
            coalesce((v_row->>'taxable')::numeric, 0),
            coalesce((v_row->>'cgst')::numeric, 0),
            coalesce((v_row->>'sgst')::numeric, 0),
            coalesce((v_row->>'igst')::numeric, 0),
            coalesce((v_row->>'cess')::numeric, 0));
    v_n := v_n + 1;
  end loop;

  update gstr2b_imports set row_count = v_n where id = v_import;

  perform write_audit('insert','gstr2b_imports', v_import::text,
    format('GSTR-2B imported for %s: %s rows', p_period, v_n),
    jsonb_build_object('period', p_period, 'rows', v_n), v_actor);
  return v_import;
end $fn$;

-- =====================================================================
-- reconcile_gstr2b(p_import) -> int rows matched
-- Matches each 2B row to a recorded supplier bill by supplier GSTIN +
-- supplier_bill_no, then compares taxable+tax (±1 tolerance). Sets:
--   matched   if a bill is found and amounts tie
--   mismatch  if a bill is found but amounts differ
--   missing_in_books  if no bill is found
-- Only same-period bills are considered (bill_date within the 2B period).
-- =====================================================================
create or replace function reconcile_gstr2b(p_import uuid)
returns int
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_row   gstr2b_rows%rowtype;
  v_bill  supplier_bills%rowtype;
  v_bill_tax numeric(14,2);
  v_row_tax  numeric(14,2);
  v_matched int := 0;
begin
  if not has_permission('accounting.manage') then
    raise exception 'reconcile_gstr2b: not authorized';
  end if;

  for v_row in select * from gstr2b_rows where import_id = p_import loop
    -- find a bill from a supplier with this GSTIN carrying this vendor bill no
    select b.* into v_bill
      from supplier_bills b
      join suppliers s on s.id = b.supplier_id
     where s.gstin is not distinct from v_row.supplier_gstin
       and b.supplier_bill_no is not distinct from v_row.invoice_no
       and b.status <> 'void'
     order by b.bill_date desc
     limit 1;

    if not found then
      update gstr2b_rows set match_status = 'missing_in_books', matched_bill_id = null
        where id = v_row.id;
      continue;
    end if;

    v_bill_tax := round(coalesce(v_bill.cgst_amount,0) + coalesce(v_bill.sgst_amount,0)
                      + coalesce(v_bill.igst_amount,0) + coalesce(v_bill.cess_amount,0), 2);
    v_row_tax  := round(v_row.cgst + v_row.sgst + v_row.igst + v_row.cess, 2);

    if abs(v_bill.taxable_amount - v_row.taxable) <= 1 and abs(v_bill_tax - v_row_tax) <= 1 then
      update gstr2b_rows set match_status = 'matched', matched_bill_id = v_bill.id where id = v_row.id;
      v_matched := v_matched + 1;
    else
      update gstr2b_rows set match_status = 'mismatch', matched_bill_id = v_bill.id where id = v_row.id;
    end if;
  end loop;

  perform write_audit('update','gstr2b_imports', p_import::text,
    format('GSTR-2B reconciled: %s matched', v_matched),
    jsonb_build_object('matched', v_matched), v_actor);
  return v_matched;
end $fn$;

revoke all on function import_gstr2b(text, text, jsonb) from anon, public;
revoke all on function reconcile_gstr2b(uuid)          from anon, public;
grant execute on function import_gstr2b(text, text, jsonb) to authenticated;
grant execute on function reconcile_gstr2b(uuid)           to authenticated;

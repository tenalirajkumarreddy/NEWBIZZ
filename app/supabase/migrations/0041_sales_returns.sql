-- =====================================================================
-- 0041_sales_returns.sql  ·  Phase 4 — Sales Returns (§4.5)
--
-- A sales return reverses part (or all) of a posted invoice: it reverses the
-- exact tax, reverses COGS at the ORIGINAL unit cost, restocks the goods, and
-- issues a customer CREDIT NOTE that reduces AR (never a cash payout). The
-- credit note reuses the 0023 credit_notes document (reason 'sales_adjustment');
-- the physical/value reversal is layered here.
--
-- Journal templates (authoritative, per §4.5):
--   Value + tax reversal (the credit note's journal):
--     Dr 4900 Sales Returns            taxable(returned)
--     Dr 2120 Output GST Payable       tax(returned)          (cgst+sgst+igst+cess)
--        Cr 1130 Accounts Receivable   total(returned)        party = customer
--   Stock/COGS reversal at ORIGINAL unit_cogs (via post_stock_move adjust_in):
--     Dr 1230 Finished Goods           Σ(returned_qty × unit_cogs)
--        Cr 5100 Cost of Goods Sold    Σ(returned_qty × unit_cogs)
--
-- Invariants preserved: the money/stock truth lives in journal_lines + the
-- stock ledger (Inv 1/3); credit_notes + sales_return_lines are AUTH docs that
-- carry the posted journal_entry_id. The whole reversal is one transaction
-- (Inv 4). Over-return is rejected (cumulative returned qty per line ≤ sold).
-- Tax is reversed PROPORTIONALLY from the stored invoice-line amounts, so it is
-- exact and handles interstate (IGST) vs intrastate (CGST+SGST) automatically.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Credit-note number series (prefix CN). next_number() auto-creates a row on
-- first use, but with the table defaults; seed an explicit CN prefix per FY so
-- return credit notes read as CN0001, CN0002, … gap-free per FY (Inv 8).
-- ---------------------------------------------------------------------
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select 'credit_note', fy.id, 'CN', 4, 1 from financial_years fy
on conflict (doc_type, fy_id) do nothing;

-- ---------------------------------------------------------------------
-- sales_return_lines — the per-line record of what came back and at what cost.
-- One header credit_notes row (reason 'sales_adjustment') owns many lines.
-- unit_cogs captures the original weighted-average cost so the COGS reversal
-- is at the exact cost the sale expensed (audit 2.3).
-- ---------------------------------------------------------------------
create table sales_return_lines (
  id              uuid primary key default gen_random_uuid(),
  credit_note_id  uuid not null references credit_notes(id) on delete cascade,
  invoice_id      uuid not null references invoices(id),
  invoice_line_id uuid not null references invoice_lines(id),
  item_id         uuid not null references items(id),
  qty             numeric(14,3) not null check (qty > 0),
  unit_cogs       numeric(14,4) not null default 0,
  taxable_amount  numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  line_no         int not null
);
create index sales_return_lines_cn_idx   on sales_return_lines (credit_note_id);
create index sales_return_lines_line_idx on sales_return_lines (invoice_line_id);
comment on table sales_return_lines is 'Per-line sales returns; reverses tax + COGS at original unit cost. §4.5.';

-- ---------------------------------------------------------------------
-- record_sales_return(p_invoice, p_lines, p_opts) -> credit_note id
--   p_lines: [{ "invoice_line_id": uuid, "qty": numeric }, ...]
--   p_opts:  { "date"?: date, "narration"?: text }
--
-- One transaction: validate each returned line against its invoice line and
-- the already-returned balance, reverse tax proportionally, restock at the
-- original WA cost (COGS reversal), post the AR-reducing credit-note journal,
-- and write the credit_notes header + sales_return_lines. Gated on
-- accounting.manage. Official invoices stay immutable — correction is the
-- credit note (§4.5 edge case).
-- ---------------------------------------------------------------------
create or replace function record_sales_return(
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
  v_rlines  jsonb := '[]'::jsonb;   -- staged return-line rows (post COGS after header exists)
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'record_sales_return: not authorized (accounting.manage required)';
  end if;

  select * into v_inv from invoices where id = p_invoice;
  if not found then raise exception 'record_sales_return: unknown invoice %', p_invoice; end if;
  if v_inv.status = 'void' then raise exception 'record_sales_return: invoice % is void', p_invoice; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'record_sales_return: at least one line required';
  end if;

  v_cust := v_inv.customer_id;
  v_fy   := fy_for_date(v_date);
  -- Tax reversal below rolls CGST+SGST+IGST+cess up to the single 2120 Output
  -- GST account, so interstate (IGST) and intrastate (CGST/SGST) both reverse
  -- correctly with one debit line.

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ilid := (v_line->>'invoice_line_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;

    select * into v_il from invoice_lines where id = v_ilid and invoice_id = p_invoice;
    if not found then
      raise exception 'record_sales_return: line % not on invoice %', v_ilid, p_invoice;
    end if;

    -- already-returned qty on this invoice line across prior returns
    select coalesce(sum(qty),0) into v_returned
      from sales_return_lines where invoice_line_id = v_ilid;
    if v_returned + v_qty > v_il.qty + 1e-6 then
      raise exception 'record_sales_return: line % over-returned (sold %, already %, now %)',
        v_ilid, v_il.qty, v_returned, v_qty;
    end if;

    -- proportional reversal of this line's taxable + tax by returned fraction
    v_frac := v_qty / v_il.qty;
    v_base := round(v_il.taxable_amount * v_frac, 2);
    v_tax  := round((coalesce(v_il.cgst_amount,0) + coalesce(v_il.sgst_amount,0)
                   + coalesce(v_il.igst_amount,0) + coalesce(v_il.cess_amount,0)) * v_frac, 2);

    -- original WA cost the sale expensed: the sale_out ledger row for this item
    -- on this invoice (outflows post at avg_cost, identical across same-item
    -- lines of one invoice, so item-level match is exact).
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

  -- ---- value + tax reversal journal (Dr 4900 base, Dr 2120 tax, Cr 1130 AR) ----
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

  -- ---- credit-note header (reason sales_adjustment) ----
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

  -- ---- per-line restock (COGS reversal at original cost) + return-line rows ----
  for v_line in select * from jsonb_array_elements(v_rlines) loop
    -- restock: Dr 1230 FG / Cr 5100 COGS at original unit cost (adjust_in)
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
                               'amount', v_gross, 'lines', v_ln), v_actor);
  return v_cn;
end $$;
comment on function record_sales_return is 'Reverse part/all of a posted invoice: exact tax reversal + COGS at original cost + restock, issued as a credit note. §4.5.';

-- ---------------------------------------------------------------------
-- RLS + grants. sales_return_lines readable by any authenticated user; writes
-- happen only inside the definer RPC (money/stock doc — no write policy).
-- ---------------------------------------------------------------------
alter table sales_return_lines enable row level security;
create policy read_all_auth on sales_return_lines for select to authenticated using (true);

revoke all on function record_sales_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function record_sales_return(uuid, jsonb, jsonb) to authenticated;

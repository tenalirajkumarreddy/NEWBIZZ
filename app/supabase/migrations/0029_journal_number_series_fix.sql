-- =====================================================================
-- 0029_journal_number_series_fix.sql
--
-- FIX (latent, caught pre-production by the Phase-4 smoke test):
-- journal_entries has UNIQUE(fy_id, entry_no) — entry_no must be unique across
-- ALL document types within a financial year. But post_journal was minting
-- entry_no from next_number(doc_type), a PER-doc-type counter whose prefix
-- column defaults to blank. Every poster in Phases 1-4 used the default
-- 'voucher' series EXCEPT the credit-note path (0023), which passes
-- doc_type='credit_note'. The first time a credit note and any voucher post in
-- the same FY, both mint a blank-prefixed '0001' and collide on the unique key
-- (duplicate key value violates journal_entries_fy_id_entry_no_key).
--
-- Correct model (Invariant 8 — gap-free number series per FY): a journal
-- entry's entry_no is a JOURNAL sequence, one gap-free series per financial
-- year, INDEPENDENT of the business document type. Business document numbers
-- (invoice_no, credit_note_no, GRN no, ...) are already minted separately by
-- their own RPCs via their own doc_type series — those are unaffected.
--
-- post_journal still ACCEPTS doc_type in the header (all callers unchanged, it
-- retains header/reporting meaning) but no longer derives entry_no from it;
-- entry_no now comes from the single per-FY 'journal' series. Applied while
-- journal_entries is empty, so there is nothing to renumber.
-- =====================================================================

-- Seed the 'journal' series per open FY with a readable prefix (entries render
-- as JV0001, JV0002, ...). Idempotent.
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select 'journal', fy.id, 'JV', 4, 1 from financial_years fy
on conflict (doc_type, fy_id) do nothing;

create or replace function post_journal(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fy         uuid;
  v_date       date;
  v_doc_type   text;
  v_entry_no   text;
  v_entry_id   uuid;
  v_actor      uuid;
  v_line       jsonb;
  v_acct       uuid;
  v_cc         uuid;
  v_dr         numeric(14,2);
  v_cr         numeric(14,2);
  v_sum_dr     numeric(16,2) := 0;
  v_sum_cr     numeric(16,2) := 0;
  v_count      int := 0;
begin
  v_date     := (p_header->>'entry_date')::date;
  if v_date is null then
    raise exception 'post_journal: entry_date is required';
  end if;
  -- doc_type is retained for header/reporting semantics but no longer drives the
  -- ledger entry_no (which must be unique across doc types within the FY).
  v_doc_type := coalesce(p_header->>'doc_type', 'voucher');
  v_fy       := fy_for_date(v_date);              -- also enforces OPEN fy
  v_actor    := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'post_journal: at least two lines required';
  end if;

  -- entry_no from the single per-FY JOURNAL series (gap-free, doc-type agnostic)
  v_entry_no := next_number('journal', v_date);

  -- 1) header as DRAFT so the immutability guard permits line inserts
  insert into journal_entries
      (entry_no, fy_id, entry_date, source, source_id, narration, status, posted_by)
  values
      (v_entry_no, v_fy, v_date,
       coalesce(p_header->>'source','manual'),
       nullif(p_header->>'source_id','')::uuid,
       p_header->>'narration',
       'draft', v_actor)
  returning id into v_entry_id;

  -- 2) lines
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if (v_line ? 'account_id') and nullif(v_line->>'account_id','') is not null then
      v_acct := (v_line->>'account_id')::uuid;
    else
      select id into v_acct from chart_of_accounts
        where code = v_line->>'account_code';
      if v_acct is null then
        raise exception 'post_journal: unknown account_code %', v_line->>'account_code';
      end if;
    end if;

    v_cc := null;
    if nullif(v_line->>'cost_center_code','') is not null then
      select id into v_cc from cost_centers where code = v_line->>'cost_center_code';
    elsif nullif(v_line->>'cost_center_id','') is not null then
      v_cc := (v_line->>'cost_center_id')::uuid;
    end if;

    v_dr := coalesce((v_line->>'debit')::numeric, 0);
    v_cr := coalesce((v_line->>'credit')::numeric, 0);

    insert into journal_lines
        (entry_id, account_id, debit, credit, cost_center_id,
         party_type, party_id, stock_item_id, stock_qty, branch_id, memo)
    values
        (v_entry_id, v_acct, v_dr, v_cr, v_cc,
         nullif(v_line->>'party_type',''),
         nullif(v_line->>'party_id','')::uuid,
         nullif(v_line->>'stock_item_id','')::uuid,
         coalesce((v_line->>'stock_qty')::numeric, 0),
         nullif(v_line->>'branch_id','')::uuid,
         v_line->>'memo');

    v_sum_dr := v_sum_dr + v_dr;
    v_sum_cr := v_sum_cr + v_cr;
    v_count  := v_count + 1;
  end loop;

  if v_sum_dr <> v_sum_cr then
    raise exception 'post_journal: unbalanced entry (debit % <> credit %)', v_sum_dr, v_sum_cr;
  end if;
  if v_sum_dr = 0 then
    raise exception 'post_journal: zero-value entry refused';
  end if;

  update journal_entries set status = 'posted', posted_at = now()
    where id = v_entry_id;

  insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
  select l.account_id, v_fy, sum(l.debit), sum(l.credit), now()
    from journal_lines l
   where l.entry_id = v_entry_id
   group by l.account_id
  on conflict (account_id, fy_id) do update
     set debit_total  = account_balances.debit_total  + excluded.debit_total,
         credit_total = account_balances.credit_total + excluded.credit_total,
         updated_at   = now();

  perform write_audit('post', 'journal_entries', v_entry_id::text,
            format('%s %s: %s lines, %s', p_header->>'source', v_entry_no, v_count, v_sum_dr),
            jsonb_build_object('entry_no', v_entry_no, 'amount', v_sum_dr), v_actor);

  return v_entry_id;
end $function$;

-- Re-harden the recreated function (CREATE OR REPLACE re-grants EXECUTE to public).
alter function public.post_journal(jsonb, jsonb) set search_path = public;
revoke execute on function public.post_journal(jsonb, jsonb) from anon, public;

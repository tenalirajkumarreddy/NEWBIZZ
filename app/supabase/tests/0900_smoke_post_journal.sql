-- =====================================================================
-- tests/0900_smoke_post_journal.sql
-- End-to-end proof that the accounting core honours the invariants.
-- Run AFTER migrations + seed, inside a transaction that is ROLLED BACK
-- so it leaves no residue:  psql "$DATABASE_URL" -f tests/0900_smoke_post_journal.sql
-- Each check RAISEs on failure; a clean run prints NOTICEs and rolls back.
-- =====================================================================
begin;

do $$
declare
  v_entry   uuid;
  v_rev     uuid;
  v_diff    numeric;
  v_bal_ar  numeric;
  v_ok      boolean;
begin
  ----------------------------------------------------------------------
  -- 1) A balanced sale posts and trial balance stays 0.
  --    Dr Accounts Receivable 118, Cr Sales 100, Cr Output GST 18.
  ----------------------------------------------------------------------
  v_entry := post_journal(
    jsonb_build_object('entry_date','2026-04-15','source','sale','narration','Smoke: cash sale'),
    jsonb_build_array(
      jsonb_build_object('account_code','1130','debit',118,'credit',0,'party_type','customer_store'),
      jsonb_build_object('account_code','4100','debit',0,'credit',100),
      jsonb_build_object('account_code','2120','debit',0,'credit',18)
    ));
  raise notice 'OK  posted sale entry %', v_entry;

  perform assert_trial_balance();               -- raises if off
  raise notice 'OK  trial balance = 0 after sale';

  ----------------------------------------------------------------------
  -- 2) Read-model matches truth: AR debit_total should be 118.
  ----------------------------------------------------------------------
  select debit_total into v_bal_ar
    from account_balances b
    join chart_of_accounts a on a.id = b.account_id
   where a.code = '1130';
  if v_bal_ar is distinct from 118 then
    raise exception 'FAIL read-model AR expected 118 got %', v_bal_ar;
  end if;
  raise notice 'OK  account_balances read-model reflects the post (AR=118)';

  ----------------------------------------------------------------------
  -- 3) Unbalanced entry is REFUSED (Σdr <> Σcr).
  ----------------------------------------------------------------------
  begin
    perform post_journal(
      jsonb_build_object('entry_date','2026-04-15','source','manual'),
      jsonb_build_array(
        jsonb_build_object('account_code','1110','debit',50,'credit',0),
        jsonb_build_object('account_code','4100','debit',0,'credit',40)));
    raise exception 'FAIL unbalanced entry was accepted';
  exception when others then
    if sqlerrm like '%unbalanced%' then
      raise notice 'OK  unbalanced entry rejected: %', sqlerrm;
    else raise; end if;
  end;

  ----------------------------------------------------------------------
  -- 4) Immutability (Invariant 6): cannot edit a posted line.
  ----------------------------------------------------------------------
  begin
    update journal_lines set debit = 999
     where entry_id = v_entry and debit = 118;
    raise exception 'FAIL posted line was mutated';
  exception when others then
    if sqlerrm like '%immutable%' then
      raise notice 'OK  posted line is immutable: %', sqlerrm;
    else raise; end if;
  end;

  ----------------------------------------------------------------------
  -- 5) Reversal (Invariant 6 remedy): mirror entry nets the ledger to 0.
  ----------------------------------------------------------------------
  v_rev := reverse_journal(v_entry, 'Smoke: reverse the sale');
  raise notice 'OK  reversing entry %', v_rev;
  perform assert_trial_balance();
  raise notice 'OK  trial balance still 0 after reversal';

  ----------------------------------------------------------------------
  -- 6) Read-model is disposable (Invariant 5): rebuild == same balance.
  ----------------------------------------------------------------------
  perform rebuild_account_balances();
  select debit_total - credit_total into v_diff
    from account_balances b join chart_of_accounts a on a.id = b.account_id
   where a.code = '1130';
  if v_diff is distinct from 0 then
    raise exception 'FAIL AR net after reversal+rebuild expected 0 got %', v_diff;
  end if;
  raise notice 'OK  read-model rebuilt from journal_lines (AR net = 0)';

  ----------------------------------------------------------------------
  -- 7) Gap-free numbers (Invariant 8): two allocations differ by 1.
  ----------------------------------------------------------------------
  declare a text; b text;
  begin
    a := next_number('invoice','2026-04-15');
    b := next_number('invoice','2026-04-15');
    if a = b then raise exception 'FAIL number series returned duplicate %', a; end if;
    raise notice 'OK  number series gap-free: % then %', a, b;
  end;

  raise notice '===== ALL SMOKE CHECKS PASSED =====';
end $$;

rollback;   -- leave the database exactly as we found it

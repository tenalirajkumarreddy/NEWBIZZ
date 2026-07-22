-- =====================================================================
-- 0940_phase4_smoke.sql  ·  Phase-4 end-to-end smoke test (sentinel-rollback)
--
-- NOT a schema migration. Run manually against a DB with the Phase 0-4 stack
-- applied. It creates a sentinel active user + supporting rows, exercises every
-- Phase-4 MONEY path, asserts the accounting outcome, then RAISEs 'SMOKE_OK...'
-- to force a ROLLBACK so nothing persists. A P0001 error whose message starts
-- with SMOKE_OK is a PASS; any 'SMOKE FAIL ...' is a real failure.
--
-- Covers:
--   1) scheme credit note reduces AR by the gross rebate, with GST base/tax split
--   2) commission run computes from actual journals and posts (Dr 5530/Cr 2135)
--   3) payroll run computes from attendance+pay config and posts (Dr 5500/Cr 2130)
--   4) bank reconciliation difference resolves to 0 after a posted+matched charge
--   5) a duplicate CSV import is deduped (0 inserted / 1 duplicate)
--   6) a bounced cheque reverses its original journal (reverses_id link)
--   7) trial balance stays neutral throughout
--
-- Depends on the 0029 fix (entry_no drawn from the single per-FY 'journal'
-- series): without it, the credit-note (doc_type='credit_note') and the
-- commission voucher collide on journal_entries_fy_id_entry_no_key.
-- =====================================================================
do $$
declare
  v_user uuid; v_role uuid; v_store uuid; v_cust uuid; v_branch uuid; v_fy uuid; v_item uuid;
  v_month date := date '2026-06-01';
  v_scheme uuid; v_elig uuid; v_cn uuid; v_ar0 numeric; v_ar1 numeric; v_base numeric; v_tax numeric;
  v_inv uuid; v_crun uuid; v_cje uuid; v_camt numeric;
  v_prun uuid; v_pje uuid; v_pgross numeric;
  v_bank uuid; v_imp2 jsonb; v_txn uuid; v_adj uuid; v_recon record;
  v_chq_je uuid; v_chq uuid; v_rev uuid;
  v_tb numeric;
begin
  select id into v_cust   from customers        limit 1;
  select id into v_store  from customer_stores  limit 1;
  select id into v_branch from branches         limit 1;
  select id into v_fy     from financial_years  limit 1;
  select id into v_item   from items            limit 1;
  select id into v_role   from roles where code='manager' limit 1;

  v_user := gen_random_uuid();
  insert into users (id, full_name, status) values (v_user, 'SMOKE Sentinel', 'active');
  insert into user_roles (user_id, role_id) values (v_user, v_role);
  insert into user_pay_config (user_id, monthly_salary, ot_hourly_rate) values (v_user, 30000, 100);

  -- 1) SCHEME CREDIT NOTE reduces AR, GST split
  select coalesce(sum(l.debit-l.credit),0) into v_ar0
    from journal_lines l join chart_of_accounts a on a.id=l.account_id where a.code='1130';
  insert into schemes (name, period_start, period_end, gst_adjusted, gst_rate, tiers_json)
    values ('SMOKE Scheme', v_month, (v_month+interval '1 month -1 day')::date, true, 18, '[]'::jsonb)
    returning id into v_scheme;
  insert into scheme_eligibility (scheme_id, customer_store_id, rebate_amount)
    values (v_scheme, v_store, 1180) returning id into v_elig;
  v_cn := post_scheme_credit_note(v_elig);
  select coalesce(sum(l.debit-l.credit),0) into v_ar1
    from journal_lines l join chart_of_accounts a on a.id=l.account_id where a.code='1130';
  if round(v_ar1-v_ar0,2) <> -1180.00 then
    raise exception 'SMOKE FAIL scheme AR delta=% (want -1180)', round(v_ar1-v_ar0,2); end if;
  select base_amount, tax_amount into v_base, v_tax from credit_notes where id=v_cn;
  if v_base<>1000.00 or v_tax<>180.00 then
    raise exception 'SMOKE FAIL scheme split base=% tax=% (want 1000/180)', v_base, v_tax; end if;

  -- 2) COMMISSION computes + posts
  insert into invoices (invoice_no, fy_id, store_id, customer_id, branch_id,
                        place_of_supply, invoice_date, status, created_by)
    values ('SMOKE-INV-1', v_fy, v_store, v_cust, v_branch, '33', v_month, 'posted', v_user)
    returning id into v_inv;
  insert into invoice_lines (invoice_id, item_id, qty, unit_price, taxable_amount, gst_rate, line_total)
    values (v_inv, v_item, 100, 100, 10000, 18, 11800);
  insert into commission_rules (user_id, basis, rate, threshold, status)
    values (v_user, 'revenue', 5, 0, 'active');
  v_crun := compute_commissions(v_month);
  select commission_amount into v_camt from commission_lines where run_id=v_crun and user_id=v_user;
  if v_camt is distinct from 500.00 then raise exception 'SMOKE FAIL commission amt=% (want 500)', v_camt; end if;
  v_cje := post_commission_run(v_crun);
  perform 1 from journal_lines l join chart_of_accounts a on a.id=l.account_id
    where l.entry_id=v_cje and a.code='2135' and l.credit=500;
  if not found then raise exception 'SMOKE FAIL commission posting (2135)'; end if;

  -- 3) PAYROLL computes + posts
  insert into attendance (user_id, work_date, status)
    select v_user, d::date, 'present'
      from generate_series(v_month, (v_month+interval '1 month -1 day')::date, interval '1 day') d;
  v_prun := compute_payroll(v_month);
  select gross into v_pgross from payroll_lines where run_id=v_prun and user_id=v_user;
  if v_pgross is distinct from 30000.00 then raise exception 'SMOKE FAIL payroll gross=% (want 30000)', v_pgross; end if;
  v_pje := post_payroll_run(v_prun);
  perform 1 from journal_lines l join chart_of_accounts a on a.id=l.account_id
    where l.entry_id=v_pje and a.code='5500' and l.debit=30000;
  if not found then raise exception 'SMOKE FAIL payroll posting (5500)'; end if;

  -- 4) BANK RECON diff -> 0
  insert into bank_accounts (name, gl_account_code, opening_balance)
    values ('SMOKE Bank', '1120',
      (select coalesce(sum(l.debit-l.credit),0) from journal_lines l
         join chart_of_accounts a on a.id=l.account_id where a.code='1120'))
    returning id into v_bank;
  perform import_bank_statement(v_bank,
    jsonb_build_array(jsonb_build_object('txn_date', v_month::text, 'amount', -100,
                      'description','Bank charge','ref_no','CHG1')),
    jsonb_build_object('file_name','smoke.csv','file_hash','hash-smoke-1'));
  select id into v_txn from bank_transactions where bank_account_id=v_bank limit 1;
  v_adj := post_reconciliation_adjustment(v_bank, 100, 'bank_charge',
    jsonb_build_object('bank_transaction_id', v_txn::text, 'narration','smoke charge'));
  select * into v_recon from bank_reconciliation(v_bank, current_date);
  if round(v_recon.difference,2) <> 0.00 then raise exception 'SMOKE FAIL recon diff=% (want 0)', v_recon.difference; end if;
  if v_recon.unmatched_stmt_count <> 0 then raise exception 'SMOKE FAIL recon unmatched=% (want 0)', v_recon.unmatched_stmt_count; end if;

  -- 5) DUPLICATE import deduped
  v_imp2 := import_bank_statement(v_bank,
    jsonb_build_array(jsonb_build_object('txn_date', v_month::text, 'amount', -100,
                      'description','Bank charge','ref_no','CHG1')),
    jsonb_build_object('file_name','smoke.csv','file_hash','hash-smoke-2'));
  if (v_imp2->>'inserted')::int <> 0 or (v_imp2->>'duplicates')::int <> 1 then
    raise exception 'SMOKE FAIL dup import ins=% dup=%', v_imp2->>'inserted', v_imp2->>'duplicates'; end if;

  -- 6) BOUNCED CHEQUE reverses
  v_chq_je := post_journal(
    jsonb_build_object('entry_date', current_date, 'doc_type','voucher',
                       'source','smoke_cheque','narration','SMOKE cheque deposit'),
    jsonb_build_array(
      jsonb_build_object('account_code','1120','debit',500,'credit',0),
      jsonb_build_object('account_code','1130','debit',0,'credit',500,
                         'party_type','customer','party_id', v_cust::text)));
  v_chq := register_cheque(jsonb_build_object('bank_account_id', v_bank::text,
             'direction','inbound','cheque_no','SMOKE-CHQ-1','amount',500,
             'party_type','customer','party_id', v_cust::text,
             'journal_entry_id', v_chq_je::text));
  v_rev := bounce_cheque(v_chq, 'smoke bounce');
  perform 1 from cheque_registry where id=v_chq and status='bounced' and bounce_journal_id=v_rev;
  if not found then raise exception 'SMOKE FAIL cheque bounce state'; end if;
  perform 1 from journal_entries where id=v_rev and reverses_id=v_chq_je;
  if not found then raise exception 'SMOKE FAIL cheque reversal link'; end if;

  -- 7) TRIAL BALANCE neutral
  v_tb := assert_trial_balance();
  if abs(coalesce(v_tb,0)) > 0.005 then raise exception 'SMOKE FAIL trial balance=%', v_tb; end if;

  raise exception
    'SMOKE_OK: Phase-4 all-pass | AR-1180 | commission=% | payroll=% | recon.diff=% | dup=% | bounce_rev ok | tb=%',
    v_camt, v_pgross, v_recon.difference, v_imp2->>'duplicates', v_tb;
end $$;

-- =====================================================================
-- 0105_fine_grained_accounting.sql
--
-- Fine-grained DB gates for Accounting (Task 5).
--
--   19 functions get fine gates (replacing the coarse accounting.manage /
--   report.view_all gate, or adding a gate where none existed):
--
--     • record_expense            → expense.manage
--     • approve_expense           → expense.manage
--     • reject_expense            → expense.manage
--     • topup_petty_cash          → expense.manage
--     • create_fixed_asset        → asset.manage
--     • dispose_fixed_asset       → asset.manage
--     • run_depreciation          → asset.manage
--     • create_loan               → loan.manage
--     • pay_emi                   → loan.manage
--     • post_complaint_credit_note→ crm.manage        (gate ADDED — had none)
--     • import_gstr2b             → report.gst
--     • reconcile_gstr2b          → report.gst
--     • bounce_cheque             → bank.cheque       (gate ADDED — had none)
--     • register_cheque           → bank.cheque       (gate ADDED — had none)
--     • set_cheque_status         → bank.cheque       (gate ADDED — had none)
--     • reverse_journal           → journal.reverse   (gate ADDED — had none)
--    • refresh_read_models       → report.pnl        (replaces report.view_all)
--    • get_trial_balance         → report.trial_balance (replaces report.view_all)
--    • get_ar_aging              → report.pnl        (replaces report.view_all)
--    • reconcile_payment_intent  → receipt.record or invoice.payment (replaces accounting.manage)
--    • void_payment_intent       → receipt.record or invoice.payment (replaces accounting.manage)
--
-- The 18 functions whose live bodies drifted from repo (live uses
-- current_app_user()) are sourced from live pg_get_functiondef captures:
-- record_expense, approve_expense, reject_expense, topup_petty_cash,
-- create_fixed_asset, dispose_fixed_asset, run_depreciation, create_loan,
-- pay_emi, post_complaint_credit_note, import_gstr2b, reconcile_gstr2b,
-- bounce_cheque, register_cheque, set_cheque_status, reverse_journal,
-- reconcile_payment_intent, void_payment_intent.
-- The 3 report functions match repo 0035 and are sourced from it verbatim
-- (only the gate permission string changes).
--
-- Only permission gates are added/changed; all bodies, security definer and
-- search_path are preserved byte-for-byte.
--
-- Also: RLS rewires (bank / documents / payment_intents / master-data & module
-- tables), 3 new write policies on reconciliation_adjustments, and a revoke/
-- grant block. No new role grants are needed — every code used here
-- (expense/asset/loan/journal.reverse/report.trial_balance/report.pnl/
-- report.gst/bank.cheque/bank.reconcile/crm.manage/commission.manage/
-- documents.manage/creditnote.view) already exists in role_permissions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. record_expense — expense.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor  uuid := current_app_user();
  v_date   date := coalesce((p_header->>'expense_date')::date, current_date);
  v_fy     uuid := fy_for_date(v_date);
  v_source expense_source := (p_header->>'source')::expense_source;
  v_user   uuid := nullif(p_header->>'user_id','')::uuid;
  v_no     text;
  v_id     uuid;
begin
  if not has_permission('expense.manage') then raise exception 'record_expense: not authorized (expense.manage required)'; end if;
  if v_source = 'user_holding' and v_user is null then
    v_user := v_actor;
  end if;
  v_no := next_number('expense', v_date);
  insert into expenses
    (expense_no, fy_id, expense_date, user_id, category, account_code,
     source, amount, note, bill_url, vehicle_id, status, created_by)
  values
    (v_no, v_fy, v_date, v_user,
     (p_header->>'category')::expense_category,
     p_header->>'account_code',
     v_source,
     (p_header->>'amount')::numeric,
     nullif(p_header->>'note',''),
     nullif(p_header->>'bill_url',''),
     nullif(p_header->>'vehicle_id','')::uuid,
     'pending', v_actor)
  returning id into v_id;
  perform write_audit('insert', 'expenses', v_id::text,
            format('Expense %s logged: %s %s', v_no, p_header->>'category', (p_header->>'amount')),
            jsonb_build_object('expense_no', v_no, 'amount', (p_header->>'amount')::numeric), v_actor);
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 2. approve_expense — expense.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_expense(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor    uuid := current_app_user();
  v_exp      expenses%rowtype;
  v_cr_code  text;
  v_lines    jsonb;
  v_entry    uuid;
begin
  if not has_permission('expense.manage') then raise exception 'approve_expense: not authorized (expense.manage required)'; end if;
  select * into v_exp from expenses where id = p_id for update;
  if not found then
    raise exception 'approve_expense: expense % not found', p_id;
  end if;
  if v_exp.status <> 'pending' then
    raise exception 'approve_expense: expense is % (only pending can be approved)', v_exp.status;
  end if;
  v_cr_code := _expense_source_account(v_exp.source);
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_exp.account_code, 'debit', v_exp.amount, 'credit', 0,
                       'memo', coalesce(v_exp.note, v_exp.category::text)),
    case when v_exp.source = 'user_holding' then
      jsonb_build_object('account_code', v_cr_code, 'debit', 0, 'credit', v_exp.amount,
                         'party_type', 'user', 'party_id', v_exp.user_id,
                         'memo', 'Expense from custody')
    else
      jsonb_build_object('account_code', v_cr_code, 'debit', 0, 'credit', v_exp.amount)
    end
  );
  v_entry := post_journal(
    jsonb_build_object('entry_date', v_exp.expense_date, 'source', 'expense',
                       'source_id', v_exp.id,
                       'narration', format('Expense %s — %s', v_exp.expense_no, v_exp.category)),
    v_lines);
  if v_exp.source = 'user_holding' then
    perform _bump_user_cash(v_exp.user_id, -v_exp.amount);
  end if;
  update expenses
     set status = 'approved', journal_id = v_entry,
         approved_by = v_actor, approved_at = now()
   where id = p_id;
  perform write_audit('approve', 'expenses', p_id::text,
            format('Expense %s approved: %s', v_exp.expense_no, v_exp.amount),
            jsonb_build_object('journal_id', v_entry, 'amount', v_exp.amount), v_actor);
  return v_entry;
end $function$;

-- ---------------------------------------------------------------------
-- 3. reject_expense — expense.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_expense(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_exp   expenses%rowtype;
begin
  if not has_permission('expense.manage') then raise exception 'reject_expense: not authorized (expense.manage required)'; end if;
  select * into v_exp from expenses where id = p_id for update;
  if not found then
    raise exception 'reject_expense: expense % not found', p_id;
  end if;
  if v_exp.status <> 'pending' then
    raise exception 'reject_expense: expense is % (only pending can be rejected)', v_exp.status;
  end if;
  update expenses
     set status = 'rejected', rejected_by = v_actor, rejected_at = now(),
         reject_reason = nullif(p_reason,'')
   where id = p_id;
  perform write_audit('reject', 'expenses', p_id::text,
            format('Expense %s rejected', v_exp.expense_no),
            jsonb_build_object('reason', p_reason), v_actor);
  return p_id;
end $function$;

-- ---------------------------------------------------------------------
-- 4. topup_petty_cash — expense.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.topup_petty_cash(p_amount numeric, p_date date DEFAULT CURRENT_DATE, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_entry uuid;
begin
  if not has_permission('expense.manage') then raise exception 'topup_petty_cash: not authorized (expense.manage required)'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'topup_petty_cash: amount must be positive';
  end if;
  v_entry := post_journal(
    jsonb_build_object('entry_date', coalesce(p_date, current_date), 'source', 'contra',
                       'narration', coalesce(nullif(p_note,''), 'Petty cash top-up')),
    jsonb_build_array(
      jsonb_build_object('account_code', '1115', 'debit', p_amount, 'credit', 0, 'memo', 'Petty cash top-up'),
      jsonb_build_object('account_code', '1120', 'debit', 0, 'credit', p_amount, 'memo', 'Petty cash top-up')
    ));
  return v_entry;
end $function$;

-- ---------------------------------------------------------------------
-- 5. create_fixed_asset — asset.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_fixed_asset(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_date  date := (p_header->>'purchase_date')::date;
  v_fy    uuid := fy_for_date(v_date);
  v_class asset_class := (p_header->>'asset_class')::asset_class;
  v_asset_acct text := coalesce(nullif(p_header->>'asset_account',''),
    case v_class
      when 'plant_machinery' then '1510'
      when 'vehicle' then '1520'
      when 'building' then '1530'
      when 'furniture' then '1540'
      when 'computer' then '1550'
    end);
  v_dep_acct text := coalesce(nullif(p_header->>'dep_expense_account',''),
    case when v_class = 'plant_machinery' then '5150' else '5155' end);
  v_no    text;
  v_cap   numeric(14,2) := (p_header->>'capitalized_value')::numeric;
  v_je    uuid;
  v_id    uuid;
begin
  if not has_permission('asset.manage') then raise exception 'create_fixed_asset: not authorized (asset.manage required)'; end if;
  if v_date is null then raise exception 'create_fixed_asset: purchase_date required'; end if;
  v_no := next_number('fixed_asset', v_date);
  insert into fixed_assets
    (asset_no, fy_id, name, asset_class, purchase_date, capitalized_value, salvage_value,
     method, useful_life_years, dep_rate, asset_account, dep_expense_account, accum_dep_account,
     note, created_by)
  values
    (v_no, v_fy, p_header->>'name', v_class, v_date, v_cap,
     coalesce((p_header->>'salvage_value')::numeric, 0),
     (p_header->>'method')::dep_method,
     nullif(p_header->>'useful_life_years','')::int,
     nullif(p_header->>'dep_rate','')::numeric,
     v_asset_acct, v_dep_acct, '1590',
     nullif(p_header->>'note',''), v_actor)
  returning id into v_id;
  if coalesce((p_header->>'capitalize')::boolean, false) then
    v_je := post_journal(
      jsonb_build_object('entry_date', v_date, 'source', 'adjustment',
        'narration', format('Capitalize asset %s — %s', v_no, p_header->>'name')),
      jsonb_build_array(
        jsonb_build_object('account_code', v_asset_acct, 'debit', v_cap, 'credit', 0),
        jsonb_build_object('account_code', coalesce(nullif(p_header->>'pay_account',''),'1120'),
                           'debit', 0, 'credit', v_cap)
      ));
    update fixed_assets set capitalize_journal_id = v_je where id = v_id;
  end if;
  perform write_audit('insert','fixed_assets', v_id::text,
    format('Asset %s registered: %s', v_no, v_cap),
    jsonb_build_object('asset_no', v_no, 'capitalized_value', v_cap), v_actor);
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 6. dispose_fixed_asset — asset.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(p_asset uuid, p_proceeds numeric, p_date date DEFAULT CURRENT_DATE, p_recv_account text DEFAULT '1120'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_asset fixed_assets%rowtype;
  v_accum numeric(14,2);
  v_wdv   numeric(14,2);
  v_gain  numeric(14,2);
  v_proceeds numeric(14,2) := coalesce(p_proceeds, 0);
  v_lines jsonb;
  v_je    uuid;
begin
  if not has_permission('asset.manage') then raise exception 'dispose_fixed_asset: not authorized (asset.manage required)'; end if;
  select * into v_asset from fixed_assets where id = p_asset for update;
  if not found then raise exception 'dispose_fixed_asset: asset % not found', p_asset; end if;
  if v_asset.status = 'disposed' then raise exception 'dispose_fixed_asset: already disposed'; end if;
  v_accum := coalesce((select sum(amount) from depreciation_lines where asset_id = p_asset), 0);
  v_wdv   := v_asset.capitalized_value - v_accum;
  v_gain  := v_proceeds - v_wdv;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_asset.accum_dep_account, 'debit', v_accum, 'credit', 0),
    jsonb_build_object('account_code', p_recv_account, 'debit', v_proceeds, 'credit', 0),
    jsonb_build_object('account_code', v_asset.asset_account, 'debit', 0, 'credit', v_asset.capitalized_value));
  if v_gain > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','4210','debit',0,'credit', v_gain));
  elsif v_gain < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','5185','debit', -v_gain,'credit',0));
  end if;
  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source','adjustment',
      'narration', format('Dispose asset %s (proceeds %s, WDV %s)', v_asset.asset_no, v_proceeds, v_wdv)),
    v_lines);
  update fixed_assets
     set status='disposed', disposed_on = p_date, disposal_journal_id = v_je
   where id = p_asset;
  perform write_audit('update','fixed_assets', p_asset::text,
    format('Asset %s disposed: proceeds %s, %s %s', v_asset.asset_no, v_proceeds,
           case when v_gain>=0 then 'gain' else 'loss' end, abs(v_gain)),
    jsonb_build_object('proceeds', v_proceeds, 'wdv', v_wdv, 'gain', v_gain), v_actor);
  return v_je;
end $function$;

-- ---------------------------------------------------------------------
-- 7. run_depreciation — asset.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_depreciation(p_date date DEFAULT CURRENT_DATE, p_period_label text DEFAULT NULL::text, p_months integer DEFAULT 12)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_fy    uuid := fy_for_date(p_date);
  v_no    text;
  v_run   uuid;
  v_asset fixed_assets%rowtype;
  v_wdv   numeric(14,2);
  v_charge numeric(14,2);
  v_peryear numeric(14,2);
  v_total numeric(14,2) := 0;
  v_dr    jsonb := '{}'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_key   text;
  v_je    uuid;
  v_frac  numeric := p_months::numeric / 12.0;
begin
  if not has_permission('asset.manage') then raise exception 'run_depreciation: not authorized (asset.manage required)'; end if;
  v_no := next_number('dep_run', p_date);
  insert into depreciation_runs (run_no, fy_id, run_date, period_label, created_by)
    values (v_no, v_fy, p_date, p_period_label, v_actor)
    returning id into v_run;
  for v_asset in select * from fixed_assets where status = 'active' loop
    v_wdv := asset_wdv(v_asset.id);
    if v_wdv <= v_asset.salvage_value then continue; end if;
    if v_asset.method = 'slm' then
      v_peryear := (v_asset.capitalized_value - v_asset.salvage_value) / v_asset.useful_life_years;
    else
      v_peryear := v_wdv * v_asset.dep_rate / 100.0;
    end if;
    v_charge := round(v_peryear * v_frac, 2);
    if v_wdv - v_charge < v_asset.salvage_value then
      v_charge := round(v_wdv - v_asset.salvage_value, 2);
    end if;
    if v_charge <= 0 then continue; end if;
    insert into depreciation_lines (run_id, asset_id, amount, wdv_before, wdv_after)
      values (v_run, v_asset.id, v_charge, v_wdv, v_wdv - v_charge);
    v_dr := jsonb_set(v_dr, array[v_asset.dep_expense_account],
             to_jsonb(coalesce((v_dr->>v_asset.dep_expense_account)::numeric, 0) + v_charge));
    v_total := v_total + v_charge;
  end loop;
  if v_total <= 0 then
    update depreciation_runs set total_amount = 0 where id = v_run;
    return v_run;
  end if;
  for v_key in select jsonb_object_keys(v_dr) loop
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_key, 'debit', (v_dr->>v_key)::numeric, 'credit', 0));
  end loop;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_code', '1590', 'debit', 0, 'credit', v_total));
  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source', 'adjustment',
      'narration', format('Depreciation run %s (%s)', v_no, coalesce(p_period_label,''))),
    v_lines);
  update depreciation_runs set journal_entry_id = v_je, total_amount = v_total where id = v_run;
  perform write_audit('post','depreciation_runs', v_run::text,
    format('Depreciation %s: %s', v_no, v_total),
    jsonb_build_object('run_no', v_no, 'total', v_total), v_actor);
  return v_run;
end $function$;

-- ---------------------------------------------------------------------
-- 8. create_loan — loan.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_loan(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_start date := (p_header->>'start_date')::date;
  v_fy    uuid := fy_for_date(v_start);
  v_no    text;
  v_id    uuid;
  v_p     numeric(14,2) := (p_header->>'principal')::numeric;
  v_rate  numeric := (p_header->>'annual_rate')::numeric;
  v_n     int := (p_header->>'tenure_months')::int;
  v_mrate numeric := v_rate / 1200.0;
  v_emi   numeric(14,2);
  v_loan_acct text := coalesce(nullif(p_header->>'loan_account',''), '2510');
  v_int_acct  text := coalesce(nullif(p_header->>'interest_account',''), '5600');
  v_bal   numeric(14,2);
  v_int   numeric(14,2);
  v_prin  numeric(14,2);
  v_due   date;
  v_je    uuid;
  i       int;
begin
  if not has_permission('loan.manage') then raise exception 'create_loan: not authorized (loan.manage required)'; end if;
  if v_start is null then raise exception 'create_loan: start_date required'; end if;
  if nullif(p_header->>'emi_amount','') is not null then
    v_emi := (p_header->>'emi_amount')::numeric;
  elsif v_mrate = 0 then
    v_emi := round(v_p / v_n, 2);
  else
    v_emi := round(v_p * v_mrate * power(1 + v_mrate, v_n) / (power(1 + v_mrate, v_n) - 1), 2);
  end if;
  v_no := next_number('loan', v_start);
  insert into loans (loan_no, fy_id, lender, principal, annual_rate, start_date, tenure_months,
                     emi_amount, loan_account, interest_account, note, created_by)
  values (v_no, v_fy, p_header->>'lender', v_p, v_rate, v_start, v_n, v_emi,
          v_loan_acct, v_int_acct, nullif(p_header->>'note',''), v_actor)
  returning id into v_id;
  v_bal := v_p;
  for i in 1..v_n loop
    v_due  := (v_start + make_interval(months => i))::date;
    v_int  := round(v_bal * v_mrate, 2);
    v_prin := round(v_emi - v_int, 2);
    if i = v_n or v_prin > v_bal then
      v_prin := v_bal;
    end if;
    v_bal := round(v_bal - v_prin, 2);
    insert into loan_schedule (loan_id, installment_no, due_date, emi_amount,
                               principal_component, interest_component, balance)
    values (v_id, i, v_due, round(v_prin + v_int, 2), v_prin, v_int, v_bal);
  end loop;
  if coalesce((p_header->>'disburse')::boolean, false) then
    v_je := post_journal(
      jsonb_build_object('entry_date', v_start, 'source','adjustment',
        'narration', format('Loan %s disbursed from %s', v_no, p_header->>'lender')),
      jsonb_build_array(
        jsonb_build_object('account_code', coalesce(nullif(p_header->>'deposit_account',''),'1120'),
                           'debit', v_p, 'credit', 0),
        jsonb_build_object('account_code', v_loan_acct, 'debit', 0, 'credit', v_p)
      ));
    update loans set disburse_journal_id = v_je where id = v_id;
  end if;
  perform write_audit('insert','loans', v_id::text,
    format('Loan %s: %s @ %s%%', v_no, v_p, v_rate),
    jsonb_build_object('loan_no', v_no, 'principal', v_p, 'emi', v_emi), v_actor);
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 9. pay_emi — loan.manage (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_emi(p_schedule uuid, p_date date DEFAULT CURRENT_DATE, p_pay_account text DEFAULT '1120'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_sch   loan_schedule%rowtype;
  v_loan  loans%rowtype;
  v_je    uuid;
  v_lines jsonb;
  v_remaining int;
begin
  if not has_permission('loan.manage') then raise exception 'pay_emi: not authorized (loan.manage required)'; end if;
  select * into v_sch from loan_schedule where id = p_schedule for update;
  if not found then raise exception 'pay_emi: installment % not found', p_schedule; end if;
  if v_sch.paid then raise exception 'pay_emi: installment already paid'; end if;
  select * into v_loan from loans where id = v_sch.loan_id;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_loan.loan_account, 'debit', v_sch.principal_component, 'credit', 0),
    jsonb_build_object('account_code', v_loan.interest_account, 'debit', v_sch.interest_component, 'credit', 0),
    jsonb_build_object('account_code', p_pay_account, 'debit', 0, 'credit', v_sch.emi_amount));
  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source','payment',
      'narration', format('EMI %s/%s for loan %s', v_sch.installment_no, v_loan.tenure_months, v_loan.loan_no)),
    v_lines);
  update loan_schedule set paid = true, paid_on = p_date, payment_journal_id = v_je
   where id = p_schedule;
  select count(*) into v_remaining from loan_schedule where loan_id = v_loan.id and not paid;
  if v_remaining = 0 then
    update loans set status = 'closed' where id = v_loan.id;
  end if;
  perform write_audit('post','loan_schedule', p_schedule::text,
    format('EMI %s paid for loan %s: %s', v_sch.installment_no, v_loan.loan_no, v_sch.emi_amount),
    jsonb_build_object('principal', v_sch.principal_component, 'interest', v_sch.interest_component), v_actor);
  return v_je;
end $function$;

-- ---------------------------------------------------------------------
-- 10. post_complaint_credit_note — crm.manage
--    Source: live capture (drifter; current_app_user). NO gate existed —
--    adding crm.manage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_complaint_credit_note(p_complaint uuid, p_amount numeric, p_opts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c   complaints;
  v_cn  uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('crm.manage') then raise exception 'post_complaint_credit_note: not authorized (crm.manage required)'; end if;
  select * into v_c from complaints where id = p_complaint;
  if not found then raise exception 'post_complaint_credit_note: unknown complaint %', p_complaint; end if;
  if v_c.status = 'resolved' then
    raise exception 'post_complaint_credit_note: complaint % already resolved', p_complaint;
  end if;

  v_cn := _post_credit_note(v_c.customer_store_id, p_amount, 'complaint',
            p_opts || jsonb_build_object('complaint_id', p_complaint::text,
                        'narration', coalesce(p_opts->>'narration','Complaint credit note')));

  update complaints
     set status = 'resolved', resolution = 'credit_note',
         credit_note_id = v_cn, resolved_at = now(), updated_at = now()
   where id = p_complaint;
  return v_cn;
end $function$;

-- ---------------------------------------------------------------------
-- 11. import_gstr2b — report.gst (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_gstr2b(p_period text, p_filename text, p_rows jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_import uuid;
  v_row jsonb;
  v_n int := 0;
begin
  if not has_permission('report.gst') then raise exception 'import_gstr2b: not authorized (report.gst required)'; end if;
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
end $function$;

-- ---------------------------------------------------------------------
-- 12. reconcile_gstr2b — report.gst (REPLACES accounting.manage)
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_gstr2b(p_import uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_row   gstr2b_rows%rowtype;
  v_bill  supplier_bills%rowtype;
  v_bill_tax numeric(14,2);
  v_row_tax  numeric(14,2);
  v_matched int := 0;
begin
  if not has_permission('report.gst') then raise exception 'reconcile_gstr2b: not authorized (report.gst required)'; end if;
  for v_row in select * from gstr2b_rows where import_id = p_import loop
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
end $function$;

-- ---------------------------------------------------------------------
-- 13. bounce_cheque — bank.cheque
--    Source: live capture (drifter; current_app_user). NO gate existed —
--    adding bank.cheque.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bounce_cheque(p_cheque uuid, p_reason text DEFAULT 'Cheque bounced'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c   cheque_registry;
  v_rev uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('bank.cheque') then raise exception 'bounce_cheque: not authorized (bank.cheque required)'; end if;
  select * into v_c from cheque_registry where id = p_cheque;
  if not found then raise exception 'bounce_cheque: unknown cheque %', p_cheque; end if;
  if v_c.status = 'bounced' then raise exception 'bounce_cheque: cheque % already bounced', p_cheque; end if;
  if v_c.journal_entry_id is null then
    raise exception 'bounce_cheque: cheque % has no linked journal to reverse', p_cheque;
  end if;

  v_rev := reverse_journal(v_c.journal_entry_id, p_reason);

  update cheque_registry
     set status = 'bounced', bounce_journal_id = v_rev, bounced_at = now(), updated_at = now()
   where id = p_cheque;

  perform write_audit('void','cheque_registry', p_cheque::text,
            format('Cheque %s bounced', v_c.cheque_no),
            jsonb_build_object('reversal_entry_id', v_rev), v_actor);
  return v_rev;
end $function$;

-- ---------------------------------------------------------------------
-- 14. register_cheque — bank.cheque
--    Source: live capture (drifter; current_app_user). NO gate existed —
--    adding bank.cheque.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_cheque(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id    uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('bank.cheque') then raise exception 'register_cheque: not authorized (bank.cheque required)'; end if;
  insert into cheque_registry (bank_account_id, direction, cheque_no, party_type,
      party_id, amount, cheque_date, status, receipt_id, payment_id, journal_entry_id,
      notes, created_by)
  values (nullif(p_header->>'bank_account_id','')::uuid,
          (p_header->>'direction')::cheque_direction,
          p_header->>'cheque_no', p_header->>'party_type',
          nullif(p_header->>'party_id','')::uuid,
          (p_header->>'amount')::numeric,
          nullif(p_header->>'cheque_date','')::date,
          coalesce((p_header->>'status')::cheque_status,'registered'),
          nullif(p_header->>'receipt_id','')::uuid,
          nullif(p_header->>'payment_id','')::uuid,
          nullif(p_header->>'journal_entry_id','')::uuid,
          p_header->>'notes', v_actor)
  returning id into v_id;
  perform write_audit('insert','cheque_registry', v_id::text,
            format('Cheque %s registered', p_header->>'cheque_no'), p_header, v_actor);
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 15. set_cheque_status — bank.cheque
--    Source: live capture (drifter; current_app_user). NO gate existed —
--    adding bank.cheque.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_cheque_status(p_cheque uuid, p_status cheque_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
begin
  if not has_permission('bank.cheque') then raise exception 'set_cheque_status: not authorized (bank.cheque required)'; end if;
  if p_status = 'bounced' then
    raise exception 'set_cheque_status: use bounce_cheque() to bounce (it reverses the ledger)';
  end if;
  update cheque_registry
     set status = p_status,
         deposited_at = case when p_status='deposited' then now() else deposited_at end,
         cleared_at   = case when p_status='cleared'   then now() else cleared_at end,
         updated_at = now()
   where id = p_cheque;
  if not found then raise exception 'set_cheque_status: unknown cheque %', p_cheque; end if;
  perform write_audit('update','cheque_registry', p_cheque::text,
            format('Cheque status -> %s', p_status), null, v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 16. reverse_journal — journal.reverse
--    Source: repo 0003 verbatim (matches live; no current_app_user).
--    NO gate existed — adding journal.reverse (after begin, before any statement).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_journal(p_entry_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src     journal_entries%rowtype;
  v_lines   jsonb;
  v_new     uuid;
begin
  if not has_permission('journal.reverse') then raise exception 'reverse_journal: not authorized (journal.reverse required)'; end if;
  select * into v_src from journal_entries where id = p_entry_id;
  if not found then raise exception 'reverse_journal: entry % not found', p_entry_id; end if;
  if v_src.status <> 'posted' then
    raise exception 'reverse_journal: only posted entries can be reversed (is %)', v_src.status;
  end if;

  select jsonb_agg(jsonb_build_object(
           'account_id',  l.account_id,
           'debit',       l.credit,
           'credit',      l.debit,
           'party_type',  l.party_type,
           'party_id',    l.party_id,
           'cost_center_id', l.cost_center_id,
           'stock_item_id',  l.stock_item_id,
           'stock_qty',   (-1 * l.stock_qty),
           'branch_id',   l.branch_id,
           'memo',        'reversal'))
    into v_lines
    from journal_lines l where l.entry_id = p_entry_id;

  v_new := post_journal(
    jsonb_build_object('entry_date', current_date, 'source', v_src.source,
                       'source_id', v_src.source_id::text,
                       'narration', coalesce(p_reason, 'Reversal of ' || v_src.entry_no)),
    v_lines);

  update journal_entries set reverses_id = p_entry_id where id = v_new;
  return v_new;
end $function$;

-- ---------------------------------------------------------------------
-- 17. reconcile_payment_intent — receipt.record OR invoice.payment
--    Source: live capture. REPLACES the `receipt.record OR accounting.manage`
--    gate (Task 5 Step 3, 0092_reconcile_payment_intents).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_payment_intent(p_intent_id uuid, p_store_id uuid, p_method_id uuid, p_receipt_date date DEFAULT NULL::date, p_deposit_account text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intent payment_intents%rowtype;
  v_receipt uuid;
  v_header jsonb;
begin
  if not (public.has_permission('receipt.record') or public.has_permission('invoice.payment')) then
    raise exception 'reconcile_payment_intent: not authorized (receipt.record or invoice.payment required)';
  end if;

  if p_store_id is null then raise exception 'reconcile_payment_intent: store_id required'; end if;
  if p_method_id is null then raise exception 'reconcile_payment_intent: method_id required'; end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
   for update;
  if v_intent.id is null then
    raise exception 'reconcile_payment_intent: intent % not found', p_intent_id;
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'reconcile_payment_intent: intent % is already %', p_intent_id, v_intent.status;
  end if;

  v_header := jsonb_build_object(
    'customer_id',  v_intent.customer_id,
    'store_id',     p_store_id,
    'method_id',    p_method_id,
    'amount',       v_intent.amount,
    'reference',    v_intent.reference,
    'notes',        v_intent.note
  );
  if p_receipt_date is not null then
    v_header := v_header || jsonb_build_object('receipt_date', p_receipt_date::text);
  end if;
  if p_deposit_account is not null then
    v_header := v_header || jsonb_build_object('deposit_account', p_deposit_account);
  end if;

  v_receipt := public.record_receipt(v_header);

  update public.payment_intents
     set status = 'matched',
         matched_receipt_id = v_receipt
   where id = p_intent_id;

  perform public.write_audit(
    'update', 'payment_intents', p_intent_id::text,
    format('Reconciled intent %s into receipt %s', p_intent_id, v_receipt),
    jsonb_build_object('receipt_id', v_receipt,
                       'store_id', p_store_id, 'method_id', p_method_id));

  return v_receipt;
end $function$;

-- ---------------------------------------------------------------------
-- 18. void_payment_intent — receipt.record OR invoice.payment
--    Source: live capture. REPLACES the `receipt.record OR accounting.manage`
--    gate (Task 5 Step 3, 0092_reconcile_payment_intents).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_payment_intent(p_intent_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_intent payment_intents%rowtype;
begin
  if not (public.has_permission('receipt.record') or public.has_permission('invoice.payment')) then
    raise exception 'void_payment_intent: not authorized (receipt.record or invoice.payment required)';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
   for update;
  if v_intent.id is null then
    raise exception 'void_payment_intent: intent % not found', p_intent_id;
  end if;
  if v_intent.status <> 'pending' then
    raise exception 'void_payment_intent: intent % is already %', p_intent_id, v_intent.status;
  end if;

  update public.payment_intents
     set status = 'void'
   where id = p_intent_id;

  perform public.write_audit(
    'void', 'payment_intents', p_intent_id::text,
    coalesce(nullif(p_reason,''), 'Voided pending payment intent'),
    null);

end $function$;

-- ---------------------------------------------------------------------
-- 19. refresh_read_models — report.pnl (REPLACES report.view_all)
--    Source: repo 0035 verbatim (matches live), gate string swapped.
-- ---------------------------------------------------------------------
create or replace function public.refresh_read_models()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.pnl') then
    raise exception 'refresh_read_models: not authorized (report.pnl required)';
  end if;
  refresh materialized view concurrently public.mv_trial_balance;
  refresh materialized view concurrently public.mv_ar_aging;
end $function$;

-- ---------------------------------------------------------------------
-- 18. get_trial_balance — report.trial_balance (REPLACES report.view_all)
--    Source: repo 0035 verbatim (matches live), gate string swapped. Keeps
--    STABLE volatility — it only reads mv_trial_balance.
-- ---------------------------------------------------------------------
create or replace function public.get_trial_balance(p_fy uuid)
returns setof public.mv_trial_balance
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.trial_balance') then
    raise exception 'get_trial_balance: not authorized (report.trial_balance required)';
  end if;
  return query select * from mv_trial_balance where fy_id = p_fy order by account_code;
end $function$;

-- ---------------------------------------------------------------------
-- 19. get_ar_aging — report.pnl (REPLACES report.view_all)
--    Source: repo 0035 verbatim (matches live), gate string swapped. Keeps
--    STABLE volatility — it only reads mv_ar_aging.
-- ---------------------------------------------------------------------
create or replace function public.get_ar_aging(p_branch uuid default null)
returns setof public.mv_ar_aging
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not has_permission('report.pnl') then
    raise exception 'get_ar_aging: not authorized (report.pnl required)';
  end if;
  return query
    select * from mv_ar_aging
     where p_branch is null or branch_id = p_branch
     order by age_days desc;
end $function$;

-- =====================================================================
-- 20. RLS rewires — fine perms in place of accounting.manage / portal
--     read-grants. All policies are PERMISSIVE, to authenticated, exactly
--     as before; only the permission expression changes.
-- =====================================================================

-- ------------------------- BANK --------------------------------------
-- bank_accounts — read = journal.view OR bank.reconcile OR bank.cheque
--                   manage = bank.reconcile OR bank.cheque (recon clerk +
--                   cheque clerk both maintain accounts — controller decision)
drop policy if exists read_bank on public.bank_accounts;
create policy read_bank on public.bank_accounts
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile') OR has_permission('bank.cheque'));

drop policy if exists manage_bank on public.bank_accounts;
create policy manage_bank on public.bank_accounts
  for all to authenticated using (has_permission('bank.reconcile') OR has_permission('bank.cheque')) with check (has_permission('bank.reconcile') OR has_permission('bank.cheque'));

-- bank_statement_imports — read only
drop policy if exists read_bank on public.bank_statement_imports;
create policy read_bank on public.bank_statement_imports
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile') OR has_permission('bank.cheque'));

-- bank_transactions — read only
drop policy if exists read_bank on public.bank_transactions;
create policy read_bank on public.bank_transactions
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile') OR has_permission('bank.cheque'));

-- bank_txn_matches — read broad, manage = bank.reconcile only
drop policy if exists read_bank on public.bank_txn_matches;
create policy read_bank on public.bank_txn_matches
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile') OR has_permission('bank.cheque'));

drop policy if exists manage_bank on public.bank_txn_matches;
create policy manage_bank on public.bank_txn_matches
  for all to authenticated using (has_permission('bank.reconcile')) with check (has_permission('bank.reconcile'));

-- bank_csv_column_mapping — bank.reconcile only
drop policy if exists read_bank on public.bank_csv_column_mapping;
create policy read_bank on public.bank_csv_column_mapping
  for select to authenticated using (has_permission('bank.reconcile'));

drop policy if exists manage_bank on public.bank_csv_column_mapping;
create policy manage_bank on public.bank_csv_column_mapping
  for all to authenticated using (has_permission('bank.reconcile')) with check (has_permission('bank.reconcile'));

-- cheque_registry — read broad
drop policy if exists read_bank on public.cheque_registry;
create policy read_bank on public.cheque_registry
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile') OR has_permission('bank.cheque'));

-- reconciliation_adjustments — read = journal.view OR bank.reconcile
drop policy if exists read_bank on public.reconciliation_adjustments;
create policy read_bank on public.reconciliation_adjustments
  for select to authenticated using (has_permission('journal.view') OR has_permission('bank.reconcile'));

-- reconciliation_adjustments — NEW write policy (none existed). bank.reconcile.
-- A single FOR ALL policy (using covers SELECT/UPDATE/DELETE, with check covers
-- INSERT/UPDATE) so the policy name stays unique per table.
drop policy if exists manage_adjustments on public.reconciliation_adjustments;
create policy manage_adjustments on public.reconciliation_adjustments
  for all to authenticated using (has_permission('bank.reconcile')) with check (has_permission('bank.reconcile'));

-- ------------------------- DOCUMENTS ----------------------------------
-- accounting.manage → documents.manage (insert/portal_deny_all untouched)
drop policy if exists read_documents on public.documents;
create policy read_documents on public.documents
  for select to authenticated using ((visibility = 'internal') OR (uploaded_by = current_app_user()) OR has_permission('documents.manage'));

drop policy if exists documents_owner_update on public.documents;
create policy documents_owner_update on public.documents
  for update to authenticated using ((uploaded_by = current_app_user()) OR has_permission('documents.manage'));

drop policy if exists documents_owner_delete on public.documents;
create policy documents_owner_delete on public.documents
  for delete to authenticated using ((uploaded_by = current_app_user()) OR has_permission('documents.manage'));

-- ------------------------- PAYMENT INTENTS ----------------------------
drop policy if exists payment_intents_read on public.payment_intents;
create policy payment_intents_read on public.payment_intents
  for select to authenticated using (has_permission('receipt.record') OR has_permission('invoice.payment'));

-- ------------------------- MASTER DATA / MODULES -----------------------
-- accounting.manage → fine module perms (controller decisions)
drop policy if exists manage_coa on public.chart_of_accounts;
create policy manage_coa on public.chart_of_accounts
  for all to authenticated using (has_permission('journal.post')) with check (has_permission('journal.post'));

drop policy if exists manage_cc on public.cost_centers;
create policy manage_cc on public.cost_centers
  for all to authenticated using (has_permission('journal.post')) with check (has_permission('journal.post'));

drop policy if exists manage_targets on public.sales_targets;
create policy manage_targets on public.sales_targets
  for all to authenticated using (has_permission('commission.manage')) with check (has_permission('commission.manage'));

drop policy if exists manage_rules on public.commission_rules;
create policy manage_rules on public.commission_rules
  for all to authenticated using (has_permission('commission.manage')) with check (has_permission('commission.manage'));

drop policy if exists manage_schemes on public.schemes;
create policy manage_schemes on public.schemes
  for all to authenticated using (has_permission('creditnote.view')) with check (has_permission('creditnote.view'));

drop policy if exists manage_scheme_elig on public.scheme_eligibility;
create policy manage_scheme_elig on public.scheme_eligibility
  for all to authenticated using (has_permission('creditnote.view')) with check (has_permission('creditnote.view'));

-- =====================================================================
-- 21. Revoke/grant — authenticated only, exactly once per function.
--     Identities use the full argument signatures (defaults omitted).
-- =====================================================================
revoke all on function record_expense(jsonb) from public, anon;
grant execute on function record_expense(jsonb) to authenticated;

revoke all on function approve_expense(uuid) from public, anon;
grant execute on function approve_expense(uuid) to authenticated;

revoke all on function reject_expense(uuid, text) from public, anon;
grant execute on function reject_expense(uuid, text) to authenticated;

revoke all on function topup_petty_cash(numeric, date, text) from public, anon;
grant execute on function topup_petty_cash(numeric, date, text) to authenticated;

revoke all on function create_fixed_asset(jsonb) from public, anon;
grant execute on function create_fixed_asset(jsonb) to authenticated;

revoke all on function dispose_fixed_asset(uuid, numeric, date, text) from public, anon;
grant execute on function dispose_fixed_asset(uuid, numeric, date, text) to authenticated;

revoke all on function run_depreciation(date, text, integer) from public, anon;
grant execute on function run_depreciation(date, text, integer) to authenticated;

revoke all on function create_loan(jsonb) from public, anon;
grant execute on function create_loan(jsonb) to authenticated;

revoke all on function pay_emi(uuid, date, text) from public, anon;
grant execute on function pay_emi(uuid, date, text) to authenticated;

revoke all on function post_complaint_credit_note(uuid, numeric, jsonb) from public, anon;
grant execute on function post_complaint_credit_note(uuid, numeric, jsonb) to authenticated;

revoke all on function import_gstr2b(text, text, jsonb) from public, anon;
grant execute on function import_gstr2b(text, text, jsonb) to authenticated;

revoke all on function reconcile_gstr2b(uuid) from public, anon;
grant execute on function reconcile_gstr2b(uuid) to authenticated;

revoke all on function bounce_cheque(uuid, text) from public, anon;
grant execute on function bounce_cheque(uuid, text) to authenticated;

revoke all on function register_cheque(jsonb) from public, anon;
grant execute on function register_cheque(jsonb) to authenticated;

revoke all on function set_cheque_status(uuid, cheque_status) from public, anon;
grant execute on function set_cheque_status(uuid, cheque_status) to authenticated;

revoke all on function reverse_journal(uuid, text) from public, anon;
grant execute on function reverse_journal(uuid, text) to authenticated;

revoke all on function refresh_read_models() from public, anon;
grant execute on function refresh_read_models() to authenticated;

revoke all on function get_trial_balance(uuid) from public, anon;
grant execute on function get_trial_balance(uuid) to authenticated;

revoke all on function get_ar_aging(uuid) from public, anon;
grant execute on function get_ar_aging(uuid) to authenticated;

revoke all on function reconcile_payment_intent(uuid, uuid, uuid, date, text) from public, anon;
grant execute on function reconcile_payment_intent(uuid, uuid, uuid, date, text) to authenticated;

revoke all on function void_payment_intent(uuid, text) from public, anon;
grant execute on function void_payment_intent(uuid, text) to authenticated;
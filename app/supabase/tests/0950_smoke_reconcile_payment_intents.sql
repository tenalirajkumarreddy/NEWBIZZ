-- =====================================================================
-- tests/0950_smoke_reconcile_payment_intents.sql
-- End-to-end proof that a portal "I paid" intent closes into a real posted
-- receipt (0092), and that the require-permission gate holds.
--
-- Sentinel-ROLLBACK test (mirrors 0940/0941): the whole thing runs in ONE
-- transaction via a DO block and ends by RAISING 'SMOKE_OK: ...' so nothing
-- persists. A P0001 error whose message starts with SMOKE_OK is a PASS.
--
-- Proves, in order:
--   1. Staff (admin) can reconcile a pending intent -> returns a receipt id,
--      intent flips to 'matched', matched_receipt_id is set, the receipt is
--      actually posted (customer_receipts row + journal entry balance).
--   2. Re-running reconcile on the same intent FAILS (already matched).
--   3. Void turns a pending intent into 'void' (no receipt created).
--   4. Reconcile/void by a user with NO permission FAILS (gate holds).
-- =====================================================================
do $smoke$
declare
  a_admin  uuid := (select id from users order by created_at limit 1);        -- has 'admin' role
  a_nouser uuid := gen_random_uuid();                                          -- zero-role user
  v_cust   uuid := (select id from customers order by created_at limit 1);
  v_store  uuid := (select id from customer_stores order by created_at limit 1);
  v_method uuid := (select id from payment_methods where code='cash' limit 1);
  int_paid uuid;
  int_dup  uuid;
  int_ok   uuid;
  int_deny uuid;
  rcpt     uuid;
  rcpt2    uuid;
  fy       uuid := (select id from financial_years limit 1);
  n_rcpt   bigint;
  n_je     bigint;
begin
  if v_cust is null or v_store is null or v_method is null then
    raise exception 'FAIL 0: missing seed data (customer/store/method)';
  end if;

  -- Fresh fake user with no roles; used for the negative permission checks.
  insert into users (id, full_name, phone, status) values (a_nouser, 'SMOKE NoPerm','+919999999998','active');

  -- ---- 1. Posperme: reconcile a pending intent under a staff actor ----
  perform set_config('request.jwt.claim.sub', a_admin::text, true);
  int_paid := gen_random_uuid();
  insert into payment_intents (id, customer_id, amount, mode, reference, note, status)
  values (int_paid, v_cust, 5000.00, 'cash', 'SMOKE-UPI-1', 'ceiling fan', 'pending');

  rcpt := public.reconcile_payment_intent(int_paid, v_store, v_method);
  if rcpt is null then raise exception 'FAIL 1a: reconcile returned no receipt id'; end if;

  if (select status from payment_intents where id = int_paid) <> 'matched' then
    raise exception 'FAIL 1b: intent not matched after reconcile';
  end if;
  if (select matched_receipt_id from payment_intents where id = int_paid) is distinct from rcpt then
    raise exception 'FAIL 1b: matched_receipt_id not linked';
  end if;

  -- Receipt really posted + journaled.
  select count(*) into n_rcpt from customer_receipts where id = rcpt and status='posted';
  if n_rcpt < 1 then raise exception 'FAIL 1c: no posted receipt row'; end if;
  select count(*) into n_je
    from journal_entries je
    join journal_lines jl on jl.entry_id = je.id
   where je.source='receipt' and je.source_id = rcpt::text;
  if n_je < 2 then
    raise exception 'FAIL 1d: receipt journal has % lines (expected balanced Dr/Cr)', n_je;
  end if;
  raise notice 'OK  1) reconciled intent -> posted receipt %, journaled % lines', rcpt, n_je;

  -- Tally guard: ensure the receipt journal is balanced.
  perform assert_trial_balance();
  raise notice 'OK  1e) trial balance still 0 after reconcile';

  -- ---- 2. Re-conciling an already-matched receipt FAILS ----
  begin
    perform public.reconcile_payment_intent(int_paid, v_store, v_method);
    raise exception 'FAIL 2: reconciling a matched intent was allowed';
  exception when others then
    if sqlerrm not like '%already%' then raise; end if;
  end;
  raise notice 'OK  2) re-reconcile rejected (already matched)';

  -- ---- 3. Voiding a pending intent works ----
  int_ok := gen_random_uuid();
  insert into payment_intents (id, customer_id, amount, mode, reference, status)
  values (int_ok, v_cust, 750.00, 'bank', 'SMOKE-BANK', 'pending');
  perform public.void_payment_intent(int_ok, 'customer cancelled');
  if (select status from payment_intents where id = int_ok) <> 'void' then
    raise exception 'FAIL 3a: intent not voided';
  end if;
  if exists (select 1 from customer_receipts cr where cr.reference = 'SMOKE-BANK') then
    raise exception 'FAIL 3b: void created a receipt (should have no ledger impact)';
  end if;
  raise notice 'OK  3) void leaves it void with no receipt';

  -- ---- 4. Gate: a zero-role user canNOT reconcile or void ----
  insert into payment_intents (id, customer_id, amount, mode, status)
  values (gen_random_uuid(), v_cust, 100.00, 'upi', 'pending');
  int_deny := (select id from payment_intents where status='pending' and reference is null limit 1);

  perform set_config('request.jwt.claim.sub', a_nouser::text, true);
  begin
    perform public.reconcile_payment_intent(int_deny, v_store, v_method);
    raise exception 'FAIL 4a: no-role user reconciled an intent';
  exception when others then
    if sqlerrm not like '%not authorized%' then raise; end if;
  end;
  begin
    perform public.void_payment_intent(int_deny);
    raise exception 'FAIL 4b: no-role user voided an intent';
  exception when others then
    if sqlerrm not like '%not authorized%' then raise; end if;
  end;
  raise notice 'OK  4) zero-role user denied reconcile+void';

  raise exception 'SMOKE_OK: reconcile_pass | reconcile->receipt+matched+trialbalanced, re-reconcile blocked, void no-ledger-impact, zero-role gate holds';
end $smoke$;
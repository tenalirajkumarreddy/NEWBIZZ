-- =====================================================================
-- 0078_notification_events.sql  ·  Full notification wiring (§7.8, §9.9)
--
-- Audit finding: only reorder_alert_check (0042) fired notifications. This
-- migration wires every business value event into the in-app queue using the
-- SAME pattern as reorder_alert_check — SECURITY DEFINER AFTER INSERT/UPDATE
-- triggers that call notify() via a permission fan-out helper.
--
-- Rationale for triggers over RPC-body edits: every value-event already flows
-- through a security-definer RPC (place_order, post_invoice, record_receipt,
-- record_expense, respond_transfer, ...) OR a direct insert. Hooking the tables
-- catches both without touching ~30 RPC bodies, and is immune to drift if an
-- RPC is added later. notify() reads the actor from the JWT, so triggering
-- inside the sale/transfer transaction records the correct actor; with no JWT
-- (seed/smoke inserts) the actor is null and the notification still lands.
--
-- Plus: notification_daily_scan() — license expiry, stale handover, EMI due —
-- scheduled via pg_cron with a guarded HTTP route as a portable fallback.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) notify_perm(code, title, opts) — fan-out to every active holder of a
--    permission, without notify_by_permission's caller self-check (the actor
--    — e.g. a salesperson posting an invoice — may not hold the permission).
--    resolve_recipients() is definer-gated so this is only callable by
--    definer triggers/RPCs, exactly like reorder_alert_check.
-- ---------------------------------------------------------------------
create or replace function notify_perm(p_code text, p_title text, p_opts jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rcpt uuid;
  v_n   int := 0;
begin
  for v_rcpt in select resolve_recipients(p_code) loop
    perform notify(v_rcpt, p_title, p_opts);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
comment on function notify_perm is 'Fan-out notify() to active holders of a permission. Definer-only (wraps resolve_recipients).';

-- ---------------------------------------------------------------------
-- 1) Transfers — handovers (stock/cash) + bank deposits
-- ---------------------------------------------------------------------
create or replace function transfers_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.to_user_id is not null then
      perform notify(new.to_user_id,
        format('Handover awaiting your acceptance: %s', new.transfer_no),
        jsonb_build_object(
          'body', format('A %s handover of %s is waiting for you.', new.type, coalesce(new.amount::text, '—')),
          'severity', 'info',
          'category', 'transfer',
          'entity_type', 'transfers',
          'entity_id', new.id::text,
          'action_url', '/holdings'));
    elsif new.status = 'accepted' and new.deposit_account is not null then
      perform notify_perm('accounting.manage',
        format('Bank deposit posted: %s', new.transfer_no),
        jsonb_build_object(
          'body', format('Deposit of %s posted to %s.', coalesce(new.amount::text,'—'), new.deposit_account),
          'severity', 'info',
          'category', 'transfer',
          'entity_type', 'transfers',
          'entity_id', new.id::text,
          'action_url', '/holdings'));
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform notify(new.created_by,
        format('Transfer %s accepted', new.transfer_no),
        jsonb_build_object(
          'body', 'Your handover was accepted.',
          'severity', 'info',
          'category', 'transfer',
          'entity_type', 'transfers',
          'entity_id', new.id::text,
          'action_url', '/holdings'));
    elsif new.status = 'rejected' then
      perform notify(new.created_by,
        format('Transfer %s rejected', new.transfer_no),
        jsonb_build_object(
          'body', 'Your handover was rejected — please follow up.',
          'severity', 'warning',
          'category', 'transfer',
          'entity_type', 'transfers',
          'entity_id', new.id::text,
          'action_url', '/holdings'));
    elsif new.status = 'cancelled' and new.to_user_id is not null then
      perform notify(new.to_user_id,
        format('Transfer %s cancelled', new.transfer_no),
        jsonb_build_object(
          'body', 'The handover sent to you was cancelled.',
          'severity', 'info',
          'category', 'transfer',
          'entity_type', 'transfers',
          'entity_id', new.id::text,
          'action_url', '/holdings'));
    end if;
  end if;
  return new;
end $$;
comment on function transfers_notify is '§9.9 handover / bank-deposit notifications.';

drop trigger if exists transfers_notify_trg on transfers;
create trigger transfers_notify_trg
  after insert or update of status on transfers
  for each row
  execute function transfers_notify();

-- ---------------------------------------------------------------------
-- 2) Expenses — approval queue → requester on decision
-- ---------------------------------------------------------------------
create or replace function expenses_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform notify_perm('accounting.manage',
      format('Expense awaiting approval: %s', new.expense_no),
      jsonb_build_object(
        'body', format('Amount %s. Review and approve/reject.', coalesce(new.amount::text, '—')),
        'severity', 'info',
        'category', 'expense',
        'entity_type', 'expenses',
        'entity_id', new.id::text,
        'action_url', '/expenses'));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.created_by is not null then
    if new.status = 'approved' then
      perform notify(new.created_by,
        format('Expense %s approved', new.expense_no),
        jsonb_build_object(
          'body', format('Your expense of %s was approved.', coalesce(new.amount::text,'—')),
          'severity', 'info',
          'category', 'expense',
          'entity_type', 'expenses',
          'entity_id', new.id::text,
          'action_url', '/expenses'));
    elsif new.status = 'rejected' then
      perform notify(new.created_by,
        format('Expense %s rejected', new.expense_no),
        jsonb_build_object(
          'body', 'Your expense submission was rejected.',
          'severity', 'warning',
          'category', 'expense',
          'entity_type', 'expenses',
          'entity_id', new.id::text,
          'action_url', '/expenses'));
    end if;
  end if;
  return new;
end $$;
comment on function expenses_notify is '§9.9 expense approval notifications.';

drop trigger if exists expenses_notify_trg on expenses;
create trigger expenses_notify_trg
  after insert or update of status on expenses
  for each row
  execute function expenses_notify();

-- ---------------------------------------------------------------------
-- 3) Sales orders — approval queue + lifecycle to the creator
-- ---------------------------------------------------------------------
create or replace function sales_orders_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    perform notify_perm('orders.approve',
      format('New order awaiting approval: %s', new.order_no),
      jsonb_build_object(
        'body', 'A confirmed order is in the approval queue.',
        'severity', 'info',
        'category', 'order',
        'entity_type', 'sales_orders',
        'entity_id', new.id::text,
        'action_url', '/orders'));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.created_by is not null then
    if new.status = 'approved' then
      perform notify(new.created_by,
        format('Order %s approved', new.order_no),
        jsonb_build_object(
          'body', 'Your order was approved.',
          'severity', 'info',
          'category', 'order',
          'entity_type', 'sales_orders',
          'entity_id', new.id::text,
          'action_url', '/orders'));
    elsif new.status = 'cancelled' then
      perform notify(new.created_by,
        format('Order %s cancelled', new.order_no),
        jsonb_build_object(
          'body', 'Your order was cancelled.',
          'severity', 'warning',
          'category', 'order',
          'entity_type', 'sales_orders',
          'entity_id', new.id::text,
          'action_url', '/orders'));
    elsif new.status = 'invoiced' then
      perform notify(new.created_by,
        format('Order %s invoiced', new.order_no),
        jsonb_build_object(
          'body', 'Your order has been invoiced.',
          'severity', 'info',
          'category', 'order',
          'entity_type', 'sales_orders',
          'entity_id', new.id::text,
          'action_url', '/sales'));
    end if;
  end if;
  return new;
end $$;
comment on function sales_orders_notify is '§9.9 order approval/lifecycle notifications.';

drop trigger if exists sales_orders_notify_trg on sales_orders;
create trigger sales_orders_notify_trg
  after insert or update of status on sales_orders
  for each row
  execute function sales_orders_notify();

-- ---------------------------------------------------------------------
-- 4) Invoices — posted → management visibility; void → accounting alarm
-- ---------------------------------------------------------------------
create or replace function invoices_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform notify_perm('report.view_all',
      format('Invoice posted: %s', new.invoice_no),
      jsonb_build_object(
        'body', format('Grand total %s.', coalesce(new.grand_total::text, '—')),
        'severity', 'info',
        'category', 'invoice',
        'entity_type', 'invoices',
        'entity_id', new.id::text,
        'action_url', '/sales'));
  elsif tg_op = 'UPDATE' and new.status = 'void' and old.status is distinct from 'void' then
    perform notify_perm('accounting.manage',
      format('Invoice %s voided', new.invoice_no),
      jsonb_build_object(
        'body', format('Invoice %s was voided. Review reversal.', new.invoice_no),
        'severity', 'critical',
        'category', 'invoice',
        'entity_type', 'invoices',
        'entity_id', new.id::text,
        'action_url', '/sales'));
  end if;
  return new;
end $$;
comment on function invoices_notify is '§9.9 invoice posted/void notifications.';

drop trigger if exists invoices_notify_trg on invoices;
create trigger invoices_notify_trg
  after insert or update of status on invoices
  for each row
  execute function invoices_notify();

-- ---------------------------------------------------------------------
-- 5) Customer receipts — payment received → management; void → alarm
-- ---------------------------------------------------------------------
create or replace function customer_receipts_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform notify_perm('report.view_all',
      format('Payment received: %s', new.receipt_no),
      jsonb_build_object(
        'body', format('%s of %s received.', new.mode, coalesce(new.amount::text, '—')),
        'severity', 'info',
        'category', 'receipt',
        'entity_type', 'customer_receipts',
        'entity_id', new.id::text,
        'action_url', '/receipts'));
  elsif tg_op = 'UPDATE' and new.status = 'void' and old.status is distinct from 'void' then
    perform notify_perm('accounting.manage',
      format('Receipt %s voided', new.receipt_no),
      jsonb_build_object(
        'body', format('Receipt %s was voided. Review reversal.', new.receipt_no),
        'severity', 'critical',
        'category', 'receipt',
        'entity_type', 'customer_receipts',
        'entity_id', new.id::text,
        'action_url', '/receipts'));
  end if;
  return new;
end $$;
comment on function customer_receipts_notify is '§9.9 payment-received notifications.';

drop trigger if exists customer_receipts_notify_trg on customer_receipts;
create trigger customer_receipts_notify_trg
  after insert or update of status on customer_receipts
  for each row
  execute function customer_receipts_notify();

-- ---------------------------------------------------------------------
-- 6) Complaints — new → CRM team; resolved/rejected → creator
-- ---------------------------------------------------------------------
create or replace function complaints_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'open' then
    perform notify_perm('crm.view',
      'New complaint registered',
      jsonb_build_object(
        'body', 'A complaint has been filed and needs follow-up.',
        'severity', 'info',
        'category', 'complaint',
        'entity_type', 'complaints',
        'entity_id', new.id::text,
        'action_url', '/crm'));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status
    and new.created_by is not null then
    if new.status = 'resolved' then
      perform notify(new.created_by,
        'Complaint resolved',
        jsonb_build_object(
          'body', 'The complaint you registered has been resolved.',
          'severity', 'info',
          'category', 'complaint',
          'entity_type', 'complaints',
          'entity_id', new.id::text,
          'action_url', '/crm'));
    elsif new.status = 'rejected' then
      perform notify(new.created_by,
        'Complaint rejected',
        jsonb_build_object(
          'body', 'The complaint you registered was rejected.',
          'severity', 'warning',
          'category', 'complaint',
          'entity_type', 'complaints',
          'entity_id', new.id::text,
          'action_url', '/crm'));
    end if;
  end if;
  return new;
end $$;
comment on function complaints_notify is '§9.9 complaint notifications.';

drop trigger if exists complaints_notify_trg on complaints;
create trigger complaints_notify_trg
  after insert or update of status on complaints
  for each row
  execute function complaints_notify();

-- ---------------------------------------------------------------------
-- 7) Production runs — posted → management; reversed → accounting alarm
-- ---------------------------------------------------------------------
create or replace function production_runs_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'posted' then
    perform notify_perm('report.view_all',
      format('Production run posted: %s', new.run_no),
      jsonb_build_object(
        'body', 'A production run was posted.',
        'severity', 'info',
        'category', 'production',
        'entity_type', 'production_runs',
        'entity_id', new.id::text,
        'action_url', '/production'));
  elsif tg_op = 'UPDATE' and new.status = 'reversed' and old.status is distinct from 'reversed' then
    perform notify_perm('accounting.manage',
      format('Production run %s reversed', new.run_no),
      jsonb_build_object(
        'body', format('Production run %s was reversed. Review stock/value impact.', new.run_no),
        'severity', 'critical',
        'category', 'production',
        'entity_type', 'production_runs',
        'entity_id', new.id::text,
        'action_url', '/production'));
  end if;
  return new;
end $$;
comment on function production_runs_notify is '§9.9 production run notifications.';

drop trigger if exists production_runs_notify_trg on production_runs;
create trigger production_runs_notify_trg
  after insert or update of status on production_runs
  for each row
  execute function production_runs_notify();

-- ---------------------------------------------------------------------
-- 8) Commission runs — posted → commission.view holders
-- ---------------------------------------------------------------------
create or replace function commission_runs_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'posted')
     or (tg_op = 'UPDATE' and new.status = 'posted' and old.status is distinct from 'posted') then
    perform notify_perm('commission.view',
      format('Commission for %s posted', to_char(new.period_month, 'Mon YYYY')),
      jsonb_build_object(
        'body', format('Total payout %s. Review commission lines.', coalesce(new.total_amount::text, '—')),
        'severity', 'info',
        'category', 'commission',
        'entity_type', 'commission_runs',
        'entity_id', new.id::text,
        'action_url', '/commissions'));
  end if;
  return new;
end $$;
comment on function commission_runs_notify is '§7.7 commission post notifications.';

drop trigger if exists commission_runs_notify_trg on commission_runs;
create trigger commission_runs_notify_trg
  after insert or update of status on commission_runs
  for each row
  execute function commission_runs_notify();

-- ---------------------------------------------------------------------
-- 9) Payroll runs — posted → hr.view holders
-- ---------------------------------------------------------------------
create or replace function payroll_runs_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.status = 'posted')
     or (tg_op = 'UPDATE' and new.status = 'posted' and old.status is distinct from 'posted') then
    perform notify_perm('hr.view',
      format('Payroll for %s posted', to_char(new.period_month, 'Mon YYYY')),
      jsonb_build_object(
        'body', 'The payroll run has been posted.',
        'severity', 'info',
        'category', 'payroll',
        'entity_type', 'payroll_runs',
        'entity_id', new.id::text,
        'action_url', '/payroll'));
  end if;
  return new;
end $$;
comment on function payroll_runs_notify is '§7.7 payroll post notifications.';

drop trigger if exists payroll_runs_notify_trg on payroll_runs;
create trigger payroll_runs_notify_trg
  after insert or update of status on payroll_runs
  for each row
  execute function payroll_runs_notify();

-- ---------------------------------------------------------------------
-- 10) notification_daily_scan() — scheduled sweeps (§9.9):
--     a) statutory license expiry / due-for-renewal (license_expiry_scan)
--     b) handover transfers stuck in 'pending' for > 24h
--     c) loan EMIs due within 3 days or overdue
--     Dedupe: a notification is only created once per (recipient, entity)
--     while an unarchived one for the same entity is still standing, so
--     re-runs (and the route fallback) never spam.
-- ---------------------------------------------------------------------
create or replace function notification_daily_scan()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_lic record;
  v_trf record;
  v_emi record;
  v_rcpt uuid;
  v_n   int;
begin
  -- a) License expiry / renewal
  v_n := 0;
  for v_lic in select * from license_expiry_scan() loop
    for v_rcpt in select resolve_recipients('license.view') loop
      if not exists (select 1 from notifications n
                      where n.user_id = v_rcpt
                        and n.category = 'license'
                        and n.entity_type = 'licenses'
                        and n.entity_id = v_lic.id
                        and n.status <> 'archived') then
        perform notify(v_rcpt,
          format('Licence %s %s', v_lic.license_no,
                 case when v_lic.is_expired then 'expired' else 'expiring' end),
          jsonb_build_object(
            'body', format('Expires %s · %s days left. Renew to stay compliant.',
                           v_lic.expiry_date, v_lic.days_to_expiry),
            'severity', case when v_lic.is_expired then 'critical' else 'warning' end,
            'category', 'license',
            'entity_type', 'licenses',
            'entity_id', v_lic.id::text,
            'action_url', '/admin/licenses'));
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  v_out := v_out || jsonb_build_object('licenses', v_n);

  -- b) Stale handovers (> 24h pending)
  v_n := 0;
  for v_trf in select id, transfer_no from transfers
               where status = 'pending' and created_at < now() - interval '24 hours' loop
    for v_rcpt in select resolve_recipients('roles.manage') loop
      if not exists (select 1 from notifications n
                      where n.user_id = v_rcpt
                        and n.category = 'transfer'
                        and n.entity_type = 'transfers'
                        and n.entity_id = v_trf.id
                        and n.status <> 'archived') then
        perform notify(v_rcpt,
          format('Handover %s stale', v_trf.transfer_no),
          jsonb_build_object(
            'body', 'A handover has been pending for over 24 hours. Escalate or follow up.',
            'severity', 'warning',
            'category', 'transfer',
            'entity_type', 'transfers',
            'entity_id', v_trf.id::text,
            'action_url', '/holdings'));
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  v_out := v_out || jsonb_build_object('staleTransfers', v_n);

  -- c) Loan EMIs due within 3 days or overdue (active loans only)
  v_n := 0;
  for v_emi in
    select ls.id, ls.due_date, ls.emi_amount, l.loan_no, l.lender
      from loan_schedule ls
      join loans l on l.id = ls.loan_id
     where ls.paid = false
       and l.status = 'active'
       and ls.due_date <= current_date + 3
     order by ls.due_date loop
    for v_rcpt in select resolve_recipients('accounting.manage') loop
      if not exists (select 1 from notifications n
                      where n.user_id = v_rcpt
                        and n.category = 'loan'
                        and n.entity_type = 'loan_schedule'
                        and n.entity_id = v_emi.id
                        and n.status <> 'archived') then
        perform notify(v_rcpt,
          format('EMI due %s · %s', to_char(v_emi.due_date, 'DD Mon'), v_emi.loan_no),
          jsonb_build_object(
            'body', format('%s · %s due %s.', v_emi.lender, v_emi.emi_amount, v_emi.due_date),
            'severity', 'warning',
            'category', 'loan',
            'entity_type', 'loan_schedule',
            'entity_id', v_emi.id::text,
            'action_url', '/loans'));
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  v_out := v_out || jsonb_build_object('emis', v_n);

  return v_out;
end $$;
comment on function notification_daily_scan is 'Daily sweep: licence expiry, stale handovers, EMIs due. §9.9.';

-- Route fallback / manual trigger needs anon+authenticated execute (the
-- guarded route calls it via the anon service client, mirroring 0076).
revoke all on function notification_daily_scan() from public;
grant execute on function notification_daily_scan() to authenticated, anon;

-- ---------------------------------------------------------------------
-- 11) Scheduling — pg_cron primary (DB-native, runs even if Next.js is
--     down); guarded HTTP route is the portable fallback for hosting that
--     cannot install pg_cron. Idempotent re-schedule.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('notification-daily-scan')
 where exists (select 1 from cron.job where jobname = 'notification-daily-scan');

select cron.schedule('notification-daily-scan', '15 2 * * *', $x$select notification_daily_scan()$x$);

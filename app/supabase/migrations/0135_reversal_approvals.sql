-- =====================================================================
-- 0135_reversal_approvals.sql
--
-- M13 remediation: reversals were self-approved. void_invoice, void_receipt
-- and the credit-note path all executed and stamped the caller as the
-- approver in the same statement — one person could erase a large receivable
-- with no second pair of eyes and nothing but an audit row to show for it.
--
-- This migration adds maker-checker for the two reversal verbs that move the
-- most money (invoice voids and receipt voids), above a configurable
-- threshold per kind:
--
--   * below the threshold, or with no policy configured  → direct, as before;
--   * at or above it                                    → the void is FILED
--     for approval and refused with a message naming the request, so the
--     operator knows the work was captured, not lost;
--   * a request can never be approved by the person who made it;
--   * approving runs the original RPC inside the approver's transaction, so
--     the void, the journal reversal, the ledger row and the decision all
--     commit together or not at all.
--
-- Credit notes and sales returns are deliberately NOT gated here: they are
-- the documented way to correct a sale, they already need invoice.void, and
-- gating them would break the returns flow. They stay self-approved until a
-- product decision says otherwise (noted in the audit).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permission
-- ---------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('reversal.approve', 'Approve another user''s invoice/receipt void above the threshold')
on conflict (code) do nothing;

do $$
declare
  v_role uuid;
begin
  select id into v_role from public.roles where code = 'manager';
  if v_role is not null then
    insert into public.role_permissions (role_id, permission, scope)
    values (v_role, 'reversal.approve', 'all')
    on conflict on constraint role_permissions_pkey do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Policy: threshold per reversal kind. 0 = every void needs approval.
-- ---------------------------------------------------------------------
create table if not exists public.reversal_policy (
  kind             text primary key
                   check (kind in ('invoice_void','receipt_void')),
  threshold_amount numeric(14,2) not null default 0 check (threshold_amount >= 0),
  enabled          boolean not null default true,
  updated_at       timestamptz not null default now()
);

insert into public.reversal_policy (kind, threshold_amount, enabled) values
  ('invoice_void', 25000, true),
  ('receipt_void', 10000, true)
on conflict (kind) do nothing;

comment on table public.reversal_policy is
  'Maker-checker thresholds. A void of at least threshold_amount must be approved by a different user holding reversal.approve.';

alter table public.reversal_policy enable row level security;
drop policy if exists read_reversal_policy on public.reversal_policy;
create policy read_reversal_policy on public.reversal_policy
  for select to authenticated using (public.has_permission('reversal.approve'));

-- ---------------------------------------------------------------------
-- 3. Requests
-- ---------------------------------------------------------------------
create table if not exists public.reversal_requests (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('invoice_void','receipt_void')),
  target_id     uuid not null,
  amount        numeric(14,2) not null,
  reason        text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled')),
  requested_by  uuid references public.users(id),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references public.users(id),
  decided_at    timestamptz,
  decision_note text,
  applied_at    timestamptz
);
create index if not exists reversal_requests_status_idx
  on public.reversal_requests (status, requested_at desc);
create unique index if not exists reversal_requests_one_pending
  on public.reversal_requests (kind, target_id)
  where status = 'pending';

comment on table public.reversal_requests is
  'Maker-checker queue for invoice/receipt voids at or above the policy threshold. The requester can never approve their own request.';

alter table public.reversal_requests enable row level security;
drop policy if exists read_reversal_requests on public.reversal_requests;
create policy read_reversal_requests on public.reversal_requests
  for select to authenticated using (public.has_permission('reversal.approve'));

-- ---------------------------------------------------------------------
-- 4. Gate helpers
-- ---------------------------------------------------------------------
create or replace function public.reversal_allowed(p_kind text, p_amount numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(current_setting('app.reversal_approved', true), 'off') = 'on' then true
    else coalesce((
      select case
        when not p.enabled then true
        when p.threshold_amount <= 0 then false   -- 0 = everything needs approval
        when coalesce(p_amount, 0) < p.threshold_amount then true
        else false
      end
      from public.reversal_policy p where p.kind = p_kind
    ), true)
  end
$$;

comment on function public.reversal_allowed(text, numeric) is
  'True when a void may proceed without a second approver. Unconfigured kinds stay direct.';

-- The void RPCs refuse with SQLSTATE RY001 when approval is needed; the
-- caller then files the request here. The two steps cannot be one statement:
-- a RAISE rolls back everything in the transaction, including the request.
create or replace function public.request_reversal(
  p_kind   text,
  p_target uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := public.current_app_user();
  v_amount numeric(14,2);
  v_doc    text;
  v_status text;
  v_id     uuid;
begin
  if p_kind = 'invoice_void' then
    if not has_permission('invoice.void') then
      raise exception 'request_reversal: not authorized (invoice.void required)';
    end if;
    select i.invoice_no, i.grand_total, i.status::text
      into v_doc, v_amount, v_status
      from invoices i where i.id = p_target for update;
  elsif p_kind = 'receipt_void' then
    if not (has_permission('receipt.void') or has_permission('invoice.void')) then
      raise exception 'request_reversal: not authorized (receipt.void required)';
    end if;
    select r.receipt_no, r.amount, r.status
      into v_doc, v_amount, v_status
      from customer_receipts r where r.id = p_target for update;
  else
    raise exception 'request_reversal: unknown kind %', p_kind;
  end if;

  if v_doc is null then
    raise exception 'request_reversal: % % not found', p_kind, p_target;
  end if;
  if v_status = 'void' then
    raise exception 'request_reversal: % is already void', v_doc;
  end if;
  if public.reversal_allowed(p_kind, v_amount) then
    raise exception 'request_reversal: % (%) does not need approval — void it directly', v_doc, v_amount;
  end if;

  insert into public.reversal_requests (kind, target_id, amount, reason, requested_by)
  values (p_kind, p_target, coalesce(v_amount, 0), p_reason, v_actor)
  on conflict (kind, target_id) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.reversal_requests
     where kind = p_kind and target_id = p_target and status = 'pending';
  end if;

  perform write_audit('insert', 'reversal_requests', v_id::text,
            format('Requested approval to void %s (%s)', v_doc, v_amount),
            jsonb_build_object('kind', p_kind, 'target_id', p_target,
                               'amount', v_amount, 'reason', p_reason), v_actor);
  return v_id;
end $$;

comment on function public.request_reversal(text, uuid, text) is
  'Queue an invoice/receipt void for a second approver. Idempotent while a request is pending; refuses a document that does not need approval.';

grant execute on function public.request_reversal(text, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. void_receipt — gate above the threshold
-- ---------------------------------------------------------------------
create or replace function public.void_receipt(
  p_receipt uuid,
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r      customer_receipts%rowtype;
  v_a      record;
  v_status invoice_status;
  v_paid   numeric(14,2);
  v_prev   numeric(14,2);
  v_actor  uuid := public.current_app_user();
  v_n      int := 0;
  v_thresh numeric(14,2);
begin
  if not (has_permission('receipt.void') or has_permission('invoice.void')) then
    raise exception 'void_receipt: not authorized (receipt.void required)';
  end if;

  select * into v_r from customer_receipts where id = p_receipt for update;
  if not found then raise exception 'void_receipt: receipt % not found', p_receipt; end if;
  if v_r.status = 'void' then
    raise exception 'void_receipt: receipt % is already void', v_r.receipt_no;
  end if;

  if not public.reversal_allowed('receipt_void', v_r.amount) then
    select threshold_amount into v_thresh from public.reversal_policy where kind = 'receipt_void';
    raise exception 'void_receipt: receipt % (%) needs a second approver (threshold %)',
      v_r.receipt_no, v_r.amount, v_thresh
      using errcode = 'RY001',
            hint = 'File it with request_reversal(''receipt_void'', <id>, <reason>) and let another approver confirm.';
  end if;

  -- 1) Release the allocations and reopen the invoices they paid.
  for v_a in
    select a.id, a.invoice_id, a.amount
      from receipt_allocations a
     where a.receipt_id = p_receipt
     order by a.invoice_id
  loop
    select status, amount_paid into v_status, v_paid
      from invoices where id = v_a.invoice_id for update;
    if v_status is not null then
      delete from receipt_allocations where id = v_a.id;
      if v_status <> 'void' then
        update invoices
           set amount_paid = greatest(amount_paid - v_a.amount, 0),
               status = (case when amount_paid - v_a.amount <= 0.005 then 'posted'
                             else 'part_paid' end)::invoice_status
         where id = v_a.invoice_id;
      end if;
      v_n := v_n + 1;
    end if;
  end loop;

  -- 2) Reverse the cash journal (deposit back out, AR and advance restored).
  if v_r.journal_entry_id is not null then
    perform reverse_journal(v_r.journal_entry_id,
      coalesce('Void ' || v_r.receipt_no || ': ' || p_reason, 'Void of ' || v_r.receipt_no));
  end if;

  update customer_receipts
     set status = 'void', allocated_amount = 0
   where id = p_receipt;

  -- 3) Ledger reversal: the customer owes the money again.
  v_prev := coalesce(previous_customer_balance(v_r.customer_id), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_r.store_id, v_r.customer_id, 'payment_void', p_receipt, 'customer_receipts',
            v_r.amount, v_prev + v_r.amount);

  perform write_audit('void','customer_receipts', p_receipt::text,
            format('Voided receipt %s (%s), released %s allocation(s)', v_r.receipt_no, v_r.amount, v_n),
            jsonb_build_object('receipt_no', v_r.receipt_no, 'amount', v_r.amount,
                               'reason', p_reason, 'released_allocations', v_n), v_actor);
  return p_receipt;
end $$;

comment on function void_receipt(uuid, text) is
  'Void a receipt: reverse its journal, release its allocations (invoices reopen), mark it void and reverse the ledger row. At or above the receipt_void threshold the void is filed for a second approver instead.';

-- ---------------------------------------------------------------------
-- 6. void_invoice — gate above the threshold
-- ---------------------------------------------------------------------
create or replace function public.void_invoice(
  p_invoice uuid,
  p_reason  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv      invoices%rowtype;
  v_line     record;
  v_type     item_type;
  v_actor    uuid := public.current_app_user();
  v_prev     numeric(14,2);
  v_released numeric(14,2);
  v_doc_only boolean;
  v_thresh   numeric(14,2);
begin
  if not has_permission('invoice.void') then
    raise exception 'void_invoice: not authorized (invoice.void required)';
  end if;

  select * into v_inv from invoices where id = p_invoice for update;
  if not found then raise exception 'void_invoice: invoice % not found', p_invoice; end if;
  if v_inv.status = 'void' then
    raise exception 'void_invoice: invoice % is already void', v_inv.invoice_no;
  end if;

  if not public.reversal_allowed('invoice_void', v_inv.grand_total) then
    select threshold_amount into v_thresh from public.reversal_policy where kind = 'invoice_void';
    raise exception 'void_invoice: % (%) needs a second approver (threshold %)',
      v_inv.invoice_no, v_inv.grand_total, v_thresh
      using errcode = 'RY001',
            hint = 'File it with request_reversal(''invoice_void'', <id>, <reason>) and let another approver confirm.';
  end if;

  -- A document-only invoice is attached to the delivery's journal. Reversing
  -- that journal would cancel the delivery itself (AR, revenue, GST) while the
  -- goods stay gone — the exact double-count 0133 removes.
  v_doc_only := v_inv.journal_entry_id is not null
    and exists (select 1 from delivery_challans dc
                 where dc.journal_entry_id = v_inv.journal_entry_id);

  v_released := public._release_invoice_allocations(p_invoice, p_reason);

  if v_doc_only then
    if v_released > 0.005 then
      perform post_journal(
        jsonb_build_object('entry_date', current_date, 'source','invoice_void',
                           'source_id', p_invoice::text,
                           'narration', format('Release %s paid on cancelled document %s to customer advance',
                                               v_released, v_inv.invoice_no)),
        jsonb_build_array(
          jsonb_build_object('account_code','1130','debit', v_released,'credit',0,
                             'party_type','customer','party_id', v_inv.customer_id::text),
          jsonb_build_object('account_code','2100','debit',0,'credit', v_released,
                             'party_type','customer','party_id', v_inv.customer_id::text)));
    end if;

    update invoices set status = 'void', amount_paid = 0 where id = p_invoice;

    if v_inv.order_id is not null then
      update sales_orders set status = 'fulfilled', updated_at = now(), version = version + 1
        where id = v_inv.order_id and status = 'invoiced';
    end if;

    perform write_audit('void', 'invoices', p_invoice::text,
              format('Cancelled GST document %s for delivered order %s (delivery untouched)%s',
                     v_inv.invoice_no, coalesce(v_inv.order_id::text, '—'),
                     case when p_reason is null then '' else ': ' || p_reason end),
              jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                                 'reason', p_reason, 'document_only', true,
                                 'released_to_advance', v_released),
              v_actor);
    return p_invoice;
  end if;

  -- 1) Reverse the sale journal (AR / Sales / GST)
  if v_inv.journal_entry_id is not null then
    perform reverse_journal(v_inv.journal_entry_id,
      coalesce('Void ' || v_inv.invoice_no || ': ' || p_reason, 'Void of ' || v_inv.invoice_no));
  end if;

  -- 2) Restore stock for each stocked line.
  for v_line in
    select il.item_id, il.qty, il.unit_cogs
      from invoice_lines il where il.invoice_id = p_invoice
  loop
    select type into v_type from items where id = v_line.item_id;
    if v_type is distinct from 'service' and v_line.qty > 0 then
      perform post_stock_move(v_line.item_id, v_inv.branch_id, 'adjust_in',
                              v_line.qty, coalesce(v_line.unit_cogs, 0),
                              '5100', 'invoice_void', p_invoice, current_date);
    end if;
  end loop;

  -- 3) Reverse the customer ledger running balance
  v_prev := coalesce(previous_customer_balance(v_inv.customer_id), 0);
  insert into customer_ledger (customer_store_id, customer_id, txn_type, reference_id,
                               reference_type, amount, balance_after)
    values (v_inv.store_id, v_inv.customer_id, 'sale_void', p_invoice, 'invoices',
            -1 * v_inv.grand_total, v_prev - v_inv.grand_total);

  -- 4) Reclass released payments from AR to customer advance
  if v_released > 0.005 then
    perform post_journal(
      jsonb_build_object('entry_date', current_date, 'source','invoice_void',
                         'source_id', p_invoice::text,
                         'narration', format('Release %s paid on voided invoice %s to customer advance',
                                             v_released, v_inv.invoice_no)),
      jsonb_build_array(
        jsonb_build_object('account_code','1130','debit', v_released,'credit',0,
                           'party_type','customer','party_id', v_inv.customer_id::text),
        jsonb_build_object('account_code','2100','debit',0,'credit', v_released,
                           'party_type','customer','party_id', v_inv.customer_id::text)));
  end if;

  update invoices set status = 'void', amount_paid = 0 where id = p_invoice;

  if v_inv.order_id is not null then
    update sales_orders set status = 'approved', updated_at = now(), version = version + 1
      where id = v_inv.order_id and status = 'invoiced';
  end if;

  perform write_audit('void', 'invoices', p_invoice::text,
            format('Voided %s (total %s)%s', v_inv.invoice_no, v_inv.grand_total,
                   case when p_reason is null then '' else ': ' || p_reason end),
            jsonb_build_object('invoice_no', v_inv.invoice_no, 'grand_total', v_inv.grand_total,
                               'is_official', v_inv.is_official, 'reason', p_reason,
                               'released_to_advance', v_released),
            v_actor);
  return p_invoice;
end $$;

comment on function void_invoice(uuid, text) is
  'Void a posted invoice: reverse the journal, restock, reverse the ledger, release allocated payments to customer advance. A document-only invoice is cancelled without touching the delivery. At or above the invoice_void threshold the void is filed for a second approver.';

-- ---------------------------------------------------------------------
-- 7. Decide
-- ---------------------------------------------------------------------
create or replace function public.approve_reversal(p_request uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   reversal_requests%rowtype;
  v_actor uuid := public.current_app_user();
  v_doc   uuid;
begin
  if not has_permission('reversal.approve') then
    raise exception 'approve_reversal: not authorized (reversal.approve required)';
  end if;

  select * into v_req from reversal_requests where id = p_request for update;
  if not found then raise exception 'approve_reversal: request % not found', p_request; end if;
  if v_req.status <> 'pending' then
    raise exception 'approve_reversal: request is already %', v_req.status;
  end if;
  if v_req.requested_by is not distinct from v_actor then
    raise exception 'approve_reversal: you cannot approve your own request';
  end if;

  -- Let the void through for this transaction only.
  perform set_config('app.reversal_approved', 'on', true);

  if v_req.kind = 'invoice_void' then
    v_doc := public.void_invoice(v_req.target_id,
                                 coalesce(nullif(p_note, ''), v_req.reason, 'approved'));
  elsif v_req.kind = 'receipt_void' then
    v_doc := public.void_receipt(v_req.target_id,
                                 coalesce(nullif(p_note, ''), v_req.reason, 'approved'));
  else
    raise exception 'approve_reversal: unknown kind %', v_req.kind;
  end if;

  perform set_config('app.reversal_approved', 'off', true);

  update reversal_requests
     set status = 'approved', decided_by = v_actor, decided_at = now(),
         decision_note = p_note, applied_at = now()
   where id = p_request;

  perform write_audit('approve', 'reversal_requests', p_request::text,
            format('Approved %s of %s (%s)', v_req.kind, v_req.target_id, v_req.amount),
            jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id,
                               'amount', v_req.amount, 'requester', v_req.requested_by,
                               'note', p_note), v_actor);
  return v_doc;
end $$;

comment on function approve_reversal(uuid, text) is
  'Second-approver step: voids the document in the approver''s transaction and closes the request. The requester can never approve their own request.';

create or replace function public.reject_reversal(p_request uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   reversal_requests%rowtype;
  v_actor uuid := public.current_app_user();
begin
  if not has_permission('reversal.approve') then
    raise exception 'reject_reversal: not authorized (reversal.approve required)';
  end if;

  select * into v_req from reversal_requests where id = p_request for update;
  if not found then raise exception 'reject_reversal: request % not found', p_request; end if;
  if v_req.status <> 'pending' then
    raise exception 'reject_reversal: request is already %', v_req.status;
  end if;

  update reversal_requests
     set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = p_note
   where id = p_request;

  perform write_audit('update', 'reversal_requests', p_request::text,
            format('Rejected %s of %s (%s)', v_req.kind, v_req.target_id, v_req.amount),
            jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id,
                               'amount', v_req.amount, 'note', p_note), v_actor);
end $$;

comment on function reject_reversal(uuid, text) is
  'Decline a queued reversal; the document stays posted.';

-- ---------------------------------------------------------------------
-- 8. The queue, with document numbers and names
-- ---------------------------------------------------------------------
create or replace function public.reversal_queue(p_status text default 'pending')
returns table (
  id             uuid,
  kind           text,
  target_id      uuid,
  doc_no         text,
  customer       text,
  amount         numeric,
  reason         text,
  requested_by   uuid,
  requested_by_name text,
  requested_at   timestamptz,
  status         text,
  decision_note  text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.kind, r.target_id,
         coalesce(i.invoice_no, cr.receipt_no) as doc_no,
         c.name as customer,
         r.amount, r.reason, r.requested_by,
         coalesce(u.full_name, u.phone) as requested_by_name,
         r.requested_at, r.status, r.decision_note
    from reversal_requests r
    left join invoices i on r.kind = 'invoice_void' and i.id = r.target_id
    left join customer_receipts cr on r.kind = 'receipt_void' and cr.id = r.target_id
    left join customers c on c.id = coalesce(i.customer_id, cr.customer_id)
    left join users u on u.id = r.requested_by
   where (p_status is null or p_status = 'all' or r.status = p_status)
   order by r.requested_at desc
   limit 100;
$$;

comment on function reversal_queue(text) is
  'Approval queue with document numbers. Requires reversal.approve (enforced by the dashboard''s route guard and the policy read).';

-- ---------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------
revoke all on function public.reversal_allowed(text, numeric) from public, anon;
grant execute on function public.reversal_allowed(text, numeric) to authenticated, service_role;

revoke all on function public.request_reversal(text, uuid, text) from public, anon;

revoke all on function public.approve_reversal(uuid, text) from public, anon;
grant execute on function public.approve_reversal(uuid, text) to authenticated, service_role;

revoke all on function public.reject_reversal(uuid, text) from public, anon;
grant execute on function public.reject_reversal(uuid, text) to authenticated, service_role;

revoke all on function public.reversal_queue(text) from public, anon;
grant execute on function public.reversal_queue(text) to authenticated, service_role;

revoke all on function public.void_receipt(uuid, text) from public, anon;
grant execute on function public.void_receipt(uuid, text) to authenticated, service_role;

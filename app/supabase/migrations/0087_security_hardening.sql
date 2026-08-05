-- =====================================================================
-- 0087_security_hardening.sql   Trim the anon EXECUTE surface
--
-- Advisor findings (security): 46 SECURITY DEFINER functions were callable
-- by `anon`, exposing unauthenticated escalation / data-exposure vectors.
-- This migration classifies each and revokes anon EXECUTE where it is not
-- strictly required.
--
-- KEEP anon (external, keyless infra that runs under our anon-key client):
--   * insert_production_log / insert_production_logs_batch  (ESP32 devices)
--   * notification_daily_scan                              (cron route)
--   * notify_perm                                          (webhook receiver)
--   * whatsapp_get_config / get_or_create_conversation /
--       insert_message / update_message_status             (webhook receiver)
--   * whatsapp_pending_notifications / resolve_recipient_phone /
--       mark_sent / pref_allows                            (dispatch worker)
--
-- Everything else here is called only by authenticated pages/actions, OR is
-- a trigger fired on DML that anon can never perform (all tables are RLS +
-- PK protected; anon has no INSERT/UPDATE). For those we drop anon (and the
-- public default) and re-grant `authenticated`, mirroring the pattern used
-- for the 0086 admin RPCs.
--
-- Security: revoking EXECUTE from `public` strips anon + authenticated (both
-- are members of public's default function grant), so each revoked function is
-- explicitly re-granted to `authenticated` (and `service_role`, which is the
-- pump for cron/backfills and is owner-level anyway).
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Guest-visible writers / destructive / financial readers — drop anon.
-- ---------------------------------------------------------------------

-- Meta config writer currently has NO internal admin gate and is anon-callable:
-- an unauthenticated caller could clobber the WhatsApp token/dry-run flag.
-- Add the admin gate here AND deny anon from now on. Admin action on the
-- Settings page calls this under the authenticated role, which passes.
create or replace function whatsapp_save_config(
  p_waba_id text default null,
  p_phone_number_id text default null,
  p_access_token_encrypted text default null,
  p_meta_app_id text default null,
  p_verify_token text default null,
  p_default_template text default null,
  p_dry_run boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.current_app_user();
begin
  if not public.has_permission('admin') then
    raise exception 'admin permission required';
  end if;
  insert into whatsapp_config (id, waba_id, phone_number_id, access_token_encrypted,
      meta_app_id, verify_token, default_template, dry_run, updated_at, updated_by)
  values (1, p_waba_id, p_phone_number_id, p_access_token_encrypted,
      p_meta_app_id, p_verify_token, p_default_template,
      coalesce(p_dry_run, true), now(), v_me)
  on conflict (id) do update set
    waba_id                = excluded.waba_id,
    phone_number_id        = excluded.phone_number_id,
    access_token_encrypted = excluded.access_token_encrypted,
    meta_app_id            = excluded.meta_app_id,
    verify_token           = excluded.verify_token,
    default_template       = coalesce(excluded.default_template, whatsapp_config.default_template),
    dry_run                = coalesce(excluded.dry_run, whatsapp_config.dry_run),
    updated_at             = now(),
    updated_by             = v_me;
end $$;
comment on function whatsapp_save_config(text,text,text,text,text,text,boolean) is 'Save WhatsApp config (admin only, definer).';

-- ---------------------------------------------------------------------
-- B. Sensitive mutators / readers called only by authenticated pages or
--    by postgres-level maintenance. Revoke anon; grant authenticated.
-- ---------------------------------------------------------------------

revoke execute on function next_entity_code(text) from public, anon;
revoke execute on function cancel_order(uuid, text) from public, anon;
revoke execute on function archive_notifications(uuid[]) from public, anon;
revoke execute on function whatsapp_save_config(text,text,text,text,text,text,boolean) from public, anon;

-- rebuild_customer_ledger is a maintenance/backfill entry point that DELETEs
-- the whole ledger. It is not referenced by any app page; keep it behind the
-- service_role / owner only (no authenticated grant).
revoke execute on function rebuild_customer_ledger(uuid) from public, anon, authenticated;

-- Financial / payroll readers surfaced to authenticated pages & actions only.
revoke execute on function get_customer_ledger(uuid, integer, integer) from public, anon;
revoke execute on function customer_outstanding_via_ledger(uuid) from public, anon;
revoke execute on function previous_customer_balance(uuid) from public, anon;
revoke execute on function get_person_balance(uuid) from public, anon;
revoke execute on function get_worker_balance(uuid) from public, anon;
revoke execute on function list_payroll_people() from public, anon;

-- Restore authenticated.
grant execute on function next_entity_code(text) to authenticated;
grant execute on function cancel_order(uuid, text) to authenticated;
grant execute on function archive_notifications(uuid[]) to authenticated;
grant execute on function whatsapp_save_config(text,text,text,text,text,text,boolean) to authenticated;
grant execute on function get_customer_ledger(uuid, integer, integer) to authenticated;
grant execute on function customer_outstanding_via_ledger(uuid) to authenticated;
grant execute on function previous_customer_balance(uuid) to authenticated;
grant execute on function get_person_balance(uuid) to authenticated;
grant execute on function get_worker_balance(uuid) to authenticated;
grant execute on function list_payroll_people() to authenticated;

-- ---------------------------------------------------------------------
-- C. Trigger functions fired on DML. Anon can never perform DML (RLS on all
-- tables), so anon never fires them. Revoke anon; keep authenticated (an
-- authenticated user's INSERT/UPDATE/DELETE does fire these triggers and the
-- trigger runs under that role).
-- ---------------------------------------------------------------------

revoke execute on function audit_worker_transactions() from public, anon;
revoke execute on function reorder_alert_check() from public, anon;
revoke execute on function bank_statement_imports_notify() from public, anon;
revoke execute on function commission_runs_notify() from public, anon;
revoke execute on function complaints_notify() from public, anon;
revoke execute on function credit_notes_notify() from public, anon;
revoke execute on function customer_receipts_notify() from public, anon;
revoke execute on function delivery_challans_notify() from public, anon;
revoke execute on function expenses_notify() from public, anon;
revoke execute on function invoices_notify() from public, anon;
revoke execute on function journal_vouchers_notify() from public, anon;
revoke execute on function payroll_runs_notify() from public, anon;
revoke execute on function production_runs_notify() from public, anon;
revoke execute on function purchase_receipts_notify() from public, anon;
revoke execute on function sales_orders_notify() from public, anon;
revoke execute on function supplier_bills_notify() from public, anon;
revoke execute on function supplier_payments_notify() from public, anon;
revoke execute on function transfers_notify() from public, anon;
revoke execute on function whatsapp_customer_receipts_notify() from public, anon;
revoke execute on function whatsapp_invoices_notify() from public, anon;
revoke execute on function whatsapp_sales_orders_notify() from public, anon;

grant execute on function audit_worker_transactions() to authenticated;
grant execute on function reorder_alert_check() to authenticated;
grant execute on function bank_statement_imports_notify() to authenticated;
grant execute on function commission_runs_notify() to authenticated;
grant execute on function complaints_notify() to authenticated;
grant execute on function credit_notes_notify() to authenticated;
grant execute on function customer_receipts_notify() to authenticated;
grant execute on function delivery_challans_notify() to authenticated;
grant execute on function expenses_notify() to authenticated;
grant execute on function invoices_notify() to authenticated;
grant execute on function journal_vouchers_notify() to authenticated;
grant execute on function payroll_runs_notify() to authenticated;
grant execute on function production_runs_notify() to authenticated;
grant execute on function purchase_receipts_notify() to authenticated;
grant execute on function sales_orders_notify() to authenticated;
grant execute on function supplier_bills_notify() to authenticated;
grant execute on function supplier_payments_notify() to authenticated;
grant execute on function transfers_notify() to authenticated;
grant execute on function whatsapp_customer_receipts_notify() to authenticated;
grant execute on function whatsapp_invoices_notify() to authenticated;
grant execute on function whatsapp_sales_orders_notify() to authenticated;

-- ---------------------------------------------------------------------
-- D. Pin search_path on INVOKER functions that reference tables. Only next_entity_code
-- and customer_outstanding_via_ledger already carry SET search_path. The rest
-- are rebuilt here with an explicit `set search_path = public` so an untrusted
-- schema cannot be injected into their object lookups. Flags (IMMUTABLE/STABLE/
-- STRICT/SECURITY DEFINER) are preserved exactly.
-- ---------------------------------------------------------------------

create or replace function public._expense_source_account(p_source public.expense_source)
returns text
language sql immutable set search_path = public as $$
  select case p_source
    when 'petty_cash' then '1115'
    when 'bank'       then '1120'
    when 'user_holding' then '2140'
  end;
$$;

create or replace function public.link_store_to_customer(p_store uuid, p_customer uuid)
returns text
language plpgsql strict set search_path = public as $$
begin
  if not exists (select 1 from customers where id = p_customer) then
    return 'Customer not found';
  end if;
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;

  update customer_stores
  set customer_id = p_customer
  where id = p_store;

  return null;
end;
$$;

create or replace function public.unlink_store_from_customer(p_store uuid)
returns text
language plpgsql strict set search_path = public as $$
begin
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;

  update customer_stores
  set customer_id = null,
      is_primary  = false
  where id = p_store;

  return null;
end;
$$;

create or replace function public.unlink_store_from_customer(p_store uuid, p_new_customer uuid)
returns text
language plpgsql strict set search_path = public as $$
begin
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;
  if not exists (select 1 from customers where id = p_new_customer) then
    return 'New customer not found';
  end if;

  update customer_stores
  set customer_id = p_new_customer,
      is_primary  = false
  where id = p_store;

  return null;
end;
$$;

create or replace function public.next_device_index(p_device_id text)
returns integer
language sql stable set search_path = public as $$
  select coalesce(max(device_index), 0) + 1
    from production_device_config
   where device_id = p_device_id;
$$;

create or replace function public.search_customers(
  p_query text default '',
  p_kind public.customer_kind default null,
  p_status text default null,
  p_limit integer default 500
) returns table (
  id uuid, code text, name text, gstin text, phone text, image_url text,
  credit_limit numeric, credit_days integer, status text, store_count bigint,
  outstanding numeric, primary_store_kind public.customer_kind
) language sql stable set search_path = public as $$
  with ranked_stores as (
    select customer_id, kind,
           row_number() over (partition by customer_id order by is_primary desc, name) rn
      from customer_stores
     where status = 'active'
  )
  select
    c.id, c.code, c.name, c.gstin, c.phone,
    c.image_url, c.credit_limit, c.credit_days, c.status,
    (select count(*) from customer_stores cs where cs.customer_id = c.id)::bigint as store_count,
    coalesce(customer_outstanding(c.id), 0) as outstanding,
    rs.kind as primary_store_kind
  from customers c
  left join ranked_stores rs on rs.customer_id = c.id and rs.rn = 1
  where (
    p_query = ''
    or c.code ilike '%' || p_query || '%'
    or c.name ilike '%' || p_query || '%'
    or c.phone ilike '%' || p_query || '%'
    or exists (
      select 1 from customer_stores cs2
      where cs2.customer_id = c.id
      and (
        cs2.code ilike '%' || p_query || '%'
        or cs2.name ilike '%' || p_query || '%'
        or cs2.phone ilike '%' || p_query || '%'
      )
    )
  )
  and (p_kind is null or rs.kind = p_kind)
  and (p_status is null or c.status = p_status)
  order by c.name
  limit p_limit;
$$;

-- 0087 adds no new object- 0086 kept anon for the infra/webhook/cron/device set,
-- and every app table already RLS-protects anon from DML, so the retained trigger
-- functions never fire as anon.
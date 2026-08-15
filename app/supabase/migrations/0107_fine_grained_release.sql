-- =====================================================================
-- 0107_fine_grained_release.sql
--
-- Document Release Center (Task 8). Controller decisions are binding and
-- OVERRIDE the plan where noted.
--
--   • New gate table: document_releases (entity_type, entity_id) — the
--     single source of truth for "released" documents. PK is the pair.
--   • release_documents(text[], date, date) RPC — SECURITY DEFINER,
--     search_path public. Gates on release.manage FIRST, then range
--     validity (p_from <= p_to). Builds a CTE `docs` over ONLY the six
--     real tables, inserts each doc with `on conflict do nothing`, counts
--     newly-released rows via `if found`, writes audit, returns the count.
--
--   TABLE MAPPING (controller) — the plan's `vouchers` / `challans`
--   tables DO NOT exist. Logical doc types map to real tables:
--     'vouchers'  -> public.journal_entries   (date = entry_date)
--     'challans'  -> public.delivery_challans (date = created_at::date)
--     'invoices'       -> invoices            (invoice_date)
--     'expenses'       -> expenses            (expense_date)
--     'supplier_bills' -> supplier_bills      (bill_date)
--     'credit_notes'   -> credit_notes        (created_at::date)
--   The entity_type values stored in document_releases are the LOGICAL
--   strings ('vouchers' / 'challans') so view policies join on them.
--
--   READ GATES — the release gate REPLACES the old `true` policies (it is
--     NOT added via OR on top of them). 6 parent + 4 child line tables are
--     re-gated, child lines keyed on their parent's entity_id via FK.
--     portal_deny_all policies are NOT touched (orthogonal, kept).
--   • document_is_released(text, uuid) SECURITY DEFINER helper sits between
--     every read policy and document_releases. An inline `exists (select
--     ... from document_releases ...)` inside a policy subselect is itself
--     subject to dr_read (release.manage only), so a view-permission
--     principal would always see the gate as closed; the helper runs as
--     owner and bypasses dr_read so the released-row test actually opens.
--   • invoices        child invoice_lines        keep owner carve-out for
--     the field ack receipt (field user reads own memo, even unreleased);
--     line children intentionally have NO owner clause (no created_by and
--     the ack reads the memo parent + its lines under the parent release).
--   ACCOUNTANT UPSERT (controller) — 0101's ON CONFLICT DO NOTHING
--     collided with pre-existing deny rows: accountant held
--     journal.view / purchase.view / supplier.view / item.view / stock.view
--     / bank.reconcile / creditnote.view / challan.view at scope 'none'.
--     Idempotent UPDATE flips exactly those 8 to scope='all' for the
--     accountant role ONLY.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Release table + its RLS.
--    released_by is required and FK'd to users (the caller), even though
--    the RPC already supplies it — keeps the table self-contained.
-- ---------------------------------------------------------------------
create table if not exists public.document_releases (
  entity_type text not null,
  entity_id   uuid not null,
  released_at timestamptz not null default now(),
  released_by uuid not null references public.users(id),
  primary key (entity_type, entity_id)
);
alter table public.document_releases enable row level security;
create policy dr_read on public.document_releases
  for select to authenticated using (has_permission('release.manage'));
create policy dr_admin_write on public.document_releases
  for all to authenticated using (has_permission('release.manage')) with check (has_permission('release.manage'));

-- ---------------------------------------------------------------------
-- 2. release_documents(p_types text[], p_from date, p_to date) -> int
--    SECURITY DEFINER (runs as owner so RLS on the source tables is not
--    a barrier to release). Permission gate BEFORE any work; range check
--    second. The CTE uses ONLY the six real tables above with the exact
--    date columns; 'vouchers' / 'challans' appear only as entity_type
--    literals, never as table names.
-- ---------------------------------------------------------------------
create or replace function public.release_documents(p_types text[], p_from date, p_to date)
 returns int
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor    uuid := current_app_user();
  v_released int := 0;
  r          record;
begin
  if not has_permission('release.manage') then raise exception 'release_documents: not authorized (release.manage required)'; end if;
  if p_from > p_to then raise exception 'release_documents: p_from must be <= p_to'; end if;

  for r in
    with docs as (
      select 'invoices'::text as et, i.id as eid, i.invoice_date::date as d from public.invoices i
      union all
      select 'expenses'::text, e.id, e.expense_date::date from public.expenses e
      union all
      select 'supplier_bills'::text, b.id, b.bill_date::date from public.supplier_bills b
      union all
      select 'vouchers'::text, j.id, j.entry_date::date from public.journal_entries j
      union all
      select 'credit_notes'::text, c.id, c.created_at::date from public.credit_notes c
      union all
      select 'challans'::text, dc.id, dc.created_at::date from public.delivery_challans dc
    )
    select et, eid from docs
     where et = any(p_types) and d between p_from and p_to
  loop
    insert into public.document_releases (entity_type, entity_id, released_at, released_by)
    values (r.et, r.eid, now(), v_actor)
    on conflict (entity_type, entity_id) do nothing;
    if found then
      v_released := v_released + 1;
    end if;
  end loop;

  perform write_audit('approve', 'document_releases', format('%s..%s', p_from, p_to),
    format('Batch release: %s document(s) [%s]', v_released, array_to_string(p_types, ',')),
    jsonb_build_object('types', p_types, 'from', p_from, 'to', p_to, 'released', v_released), v_actor);
  return v_released;
end $function$;

-- =====================================================================
-- 3. document_is_released(entity_type, entity_id) -> boolean — SECURITY
--    DEFINER existence helper. The read-gate policies MUST call this
--    instead of writing their own `exists (select ... from
--    document_releases ...)`: the inline subselect is itself subject to
--    dr_read (release.manage only), so an accountant holding the view
--    permission would always see an EMPTY document_releases and the gate
--    would never open. As SECURITY DEFINER the helper runs as owner and
--    bypasses dr_read; the view permission + released-row test then both
--    function for non-manager principals.
-- =====================================================================
create or replace function public.document_is_released(p_entity_type text, p_entity_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.document_releases dr where dr.entity_type = p_entity_type and dr.entity_id = p_entity_id);
$function$;

revoke all on function document_is_released(text, uuid) from public, anon;
grant execute on function document_is_released(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Parent read gates — REPLACE the old `true` policies (drop + create,
-- same name where the old name carried semantics). `release.manage`
-- sees everything; otherwise the doc-type view permission AND a matching
-- document_releases row (via document_is_released) are required. invoices
-- keeps the owner carve-out (field ack receipt). portal_deny_all untouched.
-- ---------------------------------------------------------------------
drop policy if exists read_invoices on public.invoices;
create policy read_invoices on public.invoices
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('invoice.view') and public.document_is_released('invoices', invoices.id))
    or (has_permission('cashmemo.view') and public.document_is_released('invoices', invoices.id))
    or created_by = public.current_app_user()
  );

drop policy if exists read_all_auth on public.expenses;
create policy read_expenses on public.expenses
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('expense.view') and public.document_is_released('expenses', expenses.id))
  );

drop policy if exists read_all_auth on public.supplier_bills;
create policy read_supplier_bills on public.supplier_bills
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('purchase.view') and public.document_is_released('supplier_bills', supplier_bills.id))
  );

drop policy if exists read_ledger on public.journal_entries;
create policy read_released_ledger on public.journal_entries
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('journal.view') and public.document_is_released('vouchers', journal_entries.id))
  );

drop policy if exists read_all_auth on public.credit_notes;
create policy read_credit_notes on public.credit_notes
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('creditnote.view') and public.document_is_released('credit_notes', credit_notes.id))
  );

drop policy if exists read_all_auth on public.delivery_challans;
create policy read_challans on public.delivery_challans
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challans.id))
  );

-- =====================================================================
-- 4. Child line read gates — controller decision: mirror the parent gate
--    on the FK. No owner carve-out on lines (children have no created_by;
--    the ack receipt reads the memo parent + its lines, and the memo IS
--    release-gated with the owner carve-out, so the flow works once the
--    office releases before the field user reads the receipt).
-- =====================================================================
drop policy if exists read_all_auth on public.invoice_lines;
create policy read_invoice_lines on public.invoice_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('invoice.view') and public.document_is_released('invoices', invoice_lines.invoice_id))
    or (has_permission('cashmemo.view') and public.document_is_released('invoices', invoice_lines.invoice_id))
  );

drop policy if exists read_all_auth on public.supplier_bill_lines;
create policy read_supplier_bill_lines on public.supplier_bill_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('purchase.view') and public.document_is_released('supplier_bills', supplier_bill_lines.bill_id))
  );

drop policy if exists read_ledger on public.journal_lines;
create policy read_released_ledger_lines on public.journal_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('journal.view') and public.document_is_released('vouchers', journal_lines.entry_id))
  );

drop policy if exists read_all_auth on public.delivery_challan_lines;
create policy read_challan_lines on public.delivery_challan_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challan_lines.challan_id))
  );

-- =====================================================================
-- 5. Accountant grant upsert — controller decision. 0101's ON CONFLICT DO
--     NOTHING collided with pre-existing deny rows, leaving accountant at
--     scope 'none' for these 8 perms. Update EXISTING rows to 'all' for
--     the accountant role ONLY (never inserts, never touches other roles).
-- =====================================================================
do $$
declare v uuid;
begin
  select id into v from public.roles where code = 'accountant';
  if v is not null then
    update public.role_permissions set scope = 'all'
     where role_id = v
       and permission in ('journal.view','purchase.view','supplier.view','item.view','stock.view','bank.reconcile','creditnote.view','challan.view');
    -- challan.view had NO live row at all (absent, not scope='none') — the
    -- UPDATE above skips missing rows, so insert it explicitly.
    insert into public.role_permissions (role_id, permission, scope)
    select v, 'challan.view', 'all'
    where not exists (select 1 from public.role_permissions where role_id = v and permission = 'challan.view');
  end if;
end $$;

-- =====================================================================
-- 6. Revoke/grant for release_documents — authenticated only, exactly once.
--    (Identity uses the full argument signature, defaults omitted.)
-- =====================================================================
revoke all on function release_documents(text[], date, date) from public, anon;
grant execute on function release_documents(text[], date, date) to authenticated;
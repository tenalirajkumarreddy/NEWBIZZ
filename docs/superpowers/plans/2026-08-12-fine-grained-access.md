# Fine-Grained Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split coarse permission codes into fine-grained per-action toggles (view/create/edit/void/pay/…) across all six modules, and — critically — add real database-level `has_permission()` gates to the money/stock RPCs that currently have none.

**Architecture:** The existing permission engine (`permissions` + `role_permissions` + `user_permission_overrides` + `has_permission()` SECURITY DEFINER function) is unchanged. This plan (1) adds ~39 new fine codes to the catalog, (2) expands every existing coarse-code grant into its fine superset so nobody loses access, (3) adds/rewires `has_permission()` checks inside RPC bodies and RLS policies so the DB enforces granularity, (4) adds the document-release gate (accountant read-only, released documents) with a Release Center, and (5) updates the UI layer (route-guard, nav, groups, Sales Desk split, acknowledgment receipt). Doc: `docs/superpowers/specs/2026-08-12-fine-grained-access-design.md`.

**Tech Stack:** Postgres (Supabase), PL/pgSQL SECURITY DEFINER RPCs, RLS policies, Next.js 14 app router, TypeScript. No test framework — verification is typecheck/build plus SQL/Supabase validation.

## Global Constraints

- No test framework exists. App verification = `npm run typecheck` + `npm run build` (from `app/`). DB verification = SQL run against the Supabase project (via `supabase db push` local, or the Supabase MCP `apply_migration` + `execute_sql` tools), plus the effective-access diff query.
- The DB (`has_permission`) is the security boundary. JWT claims, route-guard, and nav are UI-speed caches only — never shortened on the DB side.
- Superset-only cutover: no user may lose effective access in any step; expansion is additive. Deny overrides (scope='none' / user deny) must not be weakened into grants.
- Retire coarse codes only AFTER they have zero remaining references (keep them dormant in the catalog for the release; a cleanup task removes unreferenced ones).
- Immutable financial documents are never literally deleted — their modify/delete axis is the void/reverse RPCs (`void_invoice`, `cancel_order`, `reverse_*`, `bounce_cheque`), each gated by its own fine code.
- Only `authenticated` may execute new/changed RPCs. No `anon`/`public` grants. Follow the existing migration convention: `security definer`, `set search_path to 'public'` (or `alter function … set search_path`), then `revoke execute … from anon, public; grant execute … to authenticated;`.
- Copy uses existing design tokens. No emojis. No new dependencies, no new UI primitives. One new table total: `document_releases` (the release gate) — all other schema changes are RPC/policy rewrites only.
- Operating model (binding): field users (agent/sales) record sales that ALWAYS book as cash memos, get only an acknowledgment receipt (no register, no `invoice.view`/`cashmemo.view`); accountant is read-only and sees ONLY released documents (view codes + release RLS, no create/pay/void codes); manager/admin have full control incl. converting memos->invoices and operating the Release Center.
- Release is a visibility gate only — NOT a lock. Released documents remain editable/voidable by those with the relevant codes; edits flow through and the accountant sees the current state.
- Migration files live in `app/supabase/migrations/` and follow the existing numbering style (`XXXX_<name>.sql`). New migrations start at `0101_` in this plan (next free sequence after `0097_…`/`0942_…`; the seed folder's `0100_seed_foundation.sql` is unrelated).
- RPC body rewires must preserve ALL existing logic + the conditional `credit.override` branch in `post_invoice`/`place_order`. Only permission gates are added/changed.

---

## File Structure

**DB migrations (create/replace, one per module; each re-states ONLY the functions/policies it changes):**
- `app/supabase/migrations/0101_fine_grained_catalog.sql` — insert 39 codes, expansion map (role_permissions + overrides), role grant map, validation views.
- `app/supabase/migrations/0102_fine_grained_sales.sql` — Sales & Invoicing RPC gates + RLS.
- `app/supabase/migrations/0103_fine_grained_buy_stock.sql` — Buy & Stock RPC gates + RLS.
- `app/supabase/migrations/0104_fine_grained_manufacturing.sql` — BOM/Production/Costing RPC gates + RLS.
- `app/supabase/migrations/0105_fine_grained_accounting.sql` — Accounting RPC gates + RLS.
- `app/supabase/migrations/0106_fine_grained_field_people.sql` — Field/CRM/Commission + WhatsApp gates.
- `app/supabase/migrations/0107_fine_grained_release.sql` — document release table + RPC + accountant read gate.
- `app/supabase/migrations/0108_fine_grained_cleanup.sql` — retire unreferenced coarse codes after zero-reference check.

**App changes:**
- Modify `app/src/lib/auth/route-guard.ts` — replace coarse perms with fine ones.
- Create: `app/src/app/(app)/admin/releases/` (Release Center page + client component).
- Create: `app/src/app/(app)/sales/ReceiptSheet.tsx` + `app/src/app/(app)/sales/receipt/[id]/page.tsx` (acknowledgment receipt).
- Modify `app/src/components/shell/nav.ts` — perms on nav items (Sales Desk, challans, etc.).
- Modify `app/src/lib/permission-groups.ts` — new group labels (cashmemo, challan, expense, asset, loan, report, bank, field, whatsapp, production, costing).
- Modify `app/src/app/(app)/sales/page.tsx` + `app/src/app/(app)/sales/SalesTable.tsx` — Sales Desk split (invoice vs cash memo) driven by claims.
- Modify `app/src/app/(app)/sales/SalesDeskActions.tsx` (if it records sales) — disable official raise without `invoice.create`.

---

### Task 1: Catalog migration — codes + superset expansion + validation

**Files:**
- Create: `app/supabase/migrations/0101_fine_grained_catalog.sql`

**Interfaces:**
- Consumes: existing `permissions`, `role_permissions`, `user_permission_overrides`, `roles` tables; existing `has_permission(text)`.
- Produces: all 39 new codes present in `permissions`; every existing grant/override of a retired coarse code expanded to its fine set; the role grant map for the new codes.

- [ ] **Step 1: Insert the 39 new permission codes**

Append at the top of the migration:

```sql
-- 0101_fine_grained_catalog.sql
-- Insert the fine-grained catalog. Retired coarse codes stay in the table
-- (dormant) until 0108 removes the unreferenced ones.
insert into public.permissions (code, description) values
  ('invoice.create',     'Record an official taxable sale (post_invoice)'),
  ('invoice.payment',    'Record a collection / receipt against an invoice'),
  ('invoice.void',       'Void or reverse a posted sale invoice'),
  ('cashmemo.view',      'View cash memos (non-tax sales)'),
  ('cashmemo.create',    'Record a cash memo (post_invoice, is_official=false)'),
  ('cashmemo.edit',      'Amend an unposted cash memo / fix a wrong-type sale'),
  ('order.approve',      'Approve confirmed sales orders'),
  ('order.cancel',       'Cancel or close a sales order'),
  ('order.edit',         'Amend a draft sales order or its lines'),
  ('challan.view',       'View delivery challans'),
  ('challan.record',     'Create/update delivery challans and post deliveries'),
  ('purchase.create',    'Raise purchase orders and record GRNs'),
  ('purchase.record_bill','Record supplier bills and bill-from-GRN'),
  ('purchase.pay',       'Pay suppliers / set supplier opening balances'),
  ('stock.custody',      'View holdings / handover custody ledger'),
  ('cash.deposit',       'Record bank deposits'),
  ('bom.manage',         'Create/edit BOM / recipes'),
  ('production.jobs',    'Manage production job cards'),
  ('production.reverse', 'Reverse a recorded production run'),
  ('costing.manage',     'Run process costing / compute loaded cost'),
  ('journal.reverse',    'Reverse a posted journal entry'),
  ('expense.manage',     'Record/approve/reject expenses and petty-cash top-ups'),
  ('asset.manage',       'Create/dispose fixed assets, run depreciation'),
  ('loan.manage',        'Create loans and pay EMIs'),
  ('documents.manage',   'Upload/edit business documents'),
  ('report.pnl',         'View P&L and balance sheet'),
  ('report.gst',         'GST reports and GSTR-2B import/reconcile'),
  ('report.trial_balance','View the trial balance'),
  ('report.costing',     'View cost-to-make / margin reports'),
  ('bank.cheque',        'Register/settle/bounce cheques'),
  ('field.routes',       'View routes & visits'),
  ('field.fleet',        'Record fuel logs and vehicle ops'),
  ('field.transfer',     'Create/accept/cancel cash & stock transfers'),
  ('crm.manage',         'Convert leads / issue complaint credit notes'),
  ('commission.manage',  'Compute and post commission runs'),
  ('whatsapp.inbox',     'Use the WhatsApp inbox'),
  ('whatsapp.manage',    'Manage WhatsApp config and templates'),
  ('expense.view',       'View released expenses (read-only)'),
  ('release.manage',     'Operate the Document Release Center (admin/manager)')
on conflict (code) do nothing;
```

- [ ] **Step 2: Superset expansion of role grants**

Retired coarse codes expand to their fine set for every `role_permissions` row (scope 'all' only — never weaken a 'none' into grants):

```sql
do $$
declare
  r record;
  new_perms text[];
  perm text;
begin
  -- expansion map: retired coarse code -> fine superset
  for r in
    select rp.role_id, rp.permission, rp.scope
      from public.role_permissions rp
     where rp.permission in
        ('invoice.view','purchase.manage','accounting.manage','report.view_all',
         'field.view','orders.approve','cash.transfer')
  loop
    new_perms := case r.permission
      when 'invoice.view'    then array['invoice.view','cashmemo.view']
      when 'purchase.manage' then array['purchase.create','purchase.record_bill','purchase.pay']
      when 'accounting.manage' then array['expense.manage','asset.manage','loan.manage','documents.manage']
      when 'report.view_all' then array['report.pnl','report.gst','report.trial_balance','report.costing']
      when 'field.view'      then array['field.routes','field.fleet','field.transfer']
      when 'orders.approve'  then array['order.approve']
      when 'cash.transfer'   then array['cash.transfer','cash.deposit']
      else '{}'::text[] end;
    if r.scope <> 'none' then
      foreach perm in array new_perms loop
        insert into public.role_permissions (role_id, permission, scope)
        values (r.role_id, perm, r.scope)
        on conflict on constraint role_permissions_pkey do nothing;
      end loop;
    end if;
  end loop;
end $$;
```

- [ ] **Step 3: Superset expansion of per-user overrides**

For `user_permission_overrides` rows on a retired coarse code with `effect='grant'`, expand to the fine set (with `granted_by`/`reason`/`expires_at` copied). Deny overrides are copied 1:1 to each fine code so a deny on the coarse keeps denying the fine set:

```sql
do $$
declare
  upo record;
  fine text[];
  perm text;
begin
  for upo in
    select * from public.user_permission_overrides
     where permission in
        ('invoice.view','purchase.manage','accounting.manage','report.view_all',
         'field.view','orders.approve','cash.transfer')
  loop
    fine := case upo.permission
      when 'invoice.view'    then array['invoice.view','cashmemo.view']
      when 'purchase.manage' then array['purchase.create','purchase.record_bill','purchase.pay']
      when 'accounting.manage' then array['expense.manage','asset.manage','loan.manage','documents.manage']
      when 'report.view_all' then array['report.pnl','report.gst','report.trial_balance','report.costing']
      when 'field.view'      then array['field.routes','field.fleet','field.transfer']
      when 'orders.approve'  then array['order.approve']
      when 'cash.transfer'   then array['cash.transfer','cash.deposit']
      else '{}'::text[] end;
    foreach perm in array fine loop
      insert into public.user_permission_overrides
        (user_id, permission, effect, reason, granted_by, expires_at, created_at)
      values
        (upo.user_id, perm, upo.effect, upo.reason, upo.granted_by, upo.expires_at, upo.created_at)
      on conflict on constraint user_permission_overrides_pkey do nothing;
    end loop;
  end loop;
end $$;
```

- [ ] **Step 4: Grant the new fine codes to roles (role grant map)**

The expansion in Steps 2-3 only rewires retired codes. The NEW create/action codes have NO grants today — without this step, sales/manager/accountant would lose the ability to record sales, and nobody could operate the Release Center. Add these grants (append-only `on conflict … do nothing`; admin role is implicit, no rows needed):

```sql
do $$
declare
  v_role uuid;
  v_perms text[];
  v_perm text;
begin
  -- agent / sales / field: record sales -> auto CASH MEMO, receipts, challans,
  -- field ops. NO invoice.view / cashmemo.view register access, NO invoice.create.
  select id into v_role from roles where code in ('agent','sales');
  if v_role is not null then
    v_perms := array['cashmemo.create','receipt.record','challan.view','challan.record',
                     'field.routes','field.fleet','field.transfer','stock.view'];
    foreach v_perm in array v_perms loop
      insert into public.role_permissions (role_id, permission, scope)
      values (v_role, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- accountant: READ-ONLY + released. View codes only (no create/pay/void/reverse),
  -- plus the release-bounded reads. Release gate is enforced by RLS (Task 8).
  select id into v_role from roles where code = 'accountant';
  if v_role is not null then
    v_perms := array['invoice.view','expense.view','report.pnl','report.gst',
                     'report.trial_balance','report.costing','supplier.view','item.view',
                     'stock.view','journal.view','bank.reconcile','creditnote.view'];
    foreach v_perm in array v_perms loop
      insert into public.role_permissions (role_id, permission, scope)
      values (v_role, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;

  -- manager: full operation incl. invoices, conversion, releases (admin implicit).
  select id into v_role from roles where code = 'manager';
  if v_role is not null then
    v_perms := array['invoice.create','invoice.payment','invoice.void','cashmemo.create',
                     'cashmemo.edit','order.approve','order.cancel','order.edit',
                     'purchase.create','purchase.record_bill','purchase.pay',
                     'expense.manage','asset.manage','loan.manage','documents.manage',
                     'journal.reverse','production.reverse','bom.manage','release.manage',
                     'report.pnl','report.gst','report.trial_balance','report.costing',
                     'bank.cheque','crm.manage','commission.manage','whatsapp.inbox','whatsapp.manage'];
    foreach v_perm in array v_perms loop
      insert into public.role_permissions (role_id, permission, scope)
      values (v_role, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end if;
end $$;
```

Notes: this DO block uses `roles where code in ('agent','sales')` per-row (each role gets the set). `operator`/`viewer` stay unchanged. The map is superset of current duties: it ADDS the create codes the ungated money RPCs now require, so no one who could record a sale today loses the ability.

- [ ] **Step 5: Apply + validate against the live DB**

Apply the migration (`supabase db push`, or Supabase MCP `apply_migration` name `fine_grained_catalog`). The `permissions` table is RLS-protected — run this validation AS the actor or through `set_config`; simplest reliable check is `get_my_permissions()` after granting, or run as an authenticated session via an admin:

```sql
-- count check: the 39 codes exist
select count(*) from public.permissions where code in (
  'invoice.create','cashmemo.view','cashmemo.create','cashmemo.edit','invoice.payment',
  'invoice.void','order.approve','order.cancel','order.edit','challan.view',
  'challan.record','purchase.create','purchase.record_bill','purchase.pay',
  'stock.custody','cash.deposit','bom.manage','production.jobs','production.reverse',
  'costing.manage','journal.reverse','expense.manage','expense.view','asset.manage','loan.manage',
  'documents.manage','report.pnl','report.gst','report.trial_balance','report.costing',
  'bank.cheque','field.routes','field.fleet','field.transfer','crm.manage',
  'commission.manage','whatsapp.inbox','whatsapp.manage','release.manage');
```
Expected: 39.

- [ ] **Step 6: Commit**

```bash
git add app/supabase/migrations/0101_fine_grained_catalog.sql
git commit -m "feat(db): add fine-grained permission catalog + superset expansion"
```

---

### Task 2: Sales & Invoicing — DB gates + RLS

**Files:**
- Create: `app/supabase/migrations/0102_fine_grained_sales.sql`
- Reference only (copy source): latest definitions of the functions below.

**Interfaces:**
- Consumes: codes from Task 1.
- Produces: DB-enforced gates on every Sales RPC; `post_invoice`/`place_order` now require a fine create permission (not UI-only).

- [ ] **Step 1: Re-create `post_invoice` with a create gate (critical hardening)**

Find the LATEST `create or replace function post_invoice(p_header jsonb, p_lines jsonb)` across migrations (last definition wins; check `0058_fix_previous_customer_balance_null.sql` and later). Copy its full body verbatim into this migration, then insert the permission gate immediately after the function's opening `begin`:

> Copy-source rule for ALL function rewires in this plan: take the latest definition from the migrations folder if it exists there. For functions that exist ONLY in the live DB and not in any migration file (e.g. `void_invoice(p_invoice uuid, p_reason text)` and `convert_invoice_type(p_invoice uuid, p_reason text)` are missing from repo migrations but present live), pull the current body with `select pg_get_functiondef('public.<fn>'::regprocedure)` and base the re-create on that; keep the exact signature. The re-created function must preserve `security definer` + `set search_path` and the same revoke/grant block.

```sql
  -- fine-grained gate (previously UI-only)
  if v_official then
    if not has_permission('invoice.create') then
      raise exception 'post_invoice: not authorized (invoice.create required)';
    end if;
  else
    if not has_permission('cashmemo.create') then
      raise exception 'post_invoice: not authorized (cashmemo.create required)';
    end if;
  end if;
```

`v_official` is already declared and defaults `true` when `is_official` absent. Do NOT touch the existing `credit.override` soft-limit branch later in the body.

- [ ] **Step 2: Re-create `place_order` with a create gate**

Copy the latest `place_order` body verbatim; insert right after `begin`:

```sql
  if not has_permission('order.create') then
    raise exception 'place_order: not authorized (order.create required)';
  end if;
```

Keep the existing `credit.override` branch untouched. (Do NOT remove `order.create` — it stays the standing gate; `orders.approve` is replaced by `order.approve` separately.)

- [ ] **Step 3: Re-create `record_receipt` with a payment gate**

Copy the latest `record_receipt` body (last definition, likely `0059_store_centric_receipts.sql`); insert after `begin`:

```sql
  if not (has_permission('invoice.payment') or has_permission('receipt.record')) then
    raise exception 'record_receipt: not authorized (invoice.payment required)';
  end if;
```

(`receipt.record` retained so the /receipts Register continues to work for collectors.)

- [ ] **Step 4: Gate the remaining Sales RPCs**

For each function below, copy its latest definition body and add the gate line after `begin`:

| Function | Gate (exact code after `begin`) |
|---|---|
| `void_invoice` | `if not has_permission('invoice.void') then raise exception 'void_invoice: not authorized (invoice.void required)'; end if;` |
| `convert_invoice_type` | `if not has_permission('cashmemo.edit') then raise exception 'convert_invoice_type: not authorized (cashmemo.edit required)'; end if;` |
| `record_sales_return` | `if not has_permission('invoice.void') then raise exception 'record_sales_return: not authorized (invoice.void required)'; end if;` (replaces `accounting.manage`) |
| `approve_order` | `if not has_permission('order.approve') then raise exception 'approve_order: not authorized (order.approve required)'; end if;` (replaces `orders.approve`) |
| `cancel_order` | `if not has_permission('order.cancel') then raise exception 'cancel_order: not authorized (order.cancel required)'; end if;` |
| `close_partial_order` | same gate, message `close_partial_order` |
| `update_order` | `if not has_permission('order.edit') then raise exception 'update_order: not authorized (order.edit required)'; end if;` |
| `update_order_line` | same gate, message `update_order_line` |
| `create_challan` | `if not has_permission('challan.record') then raise exception 'create_challan: not authorized (challan.record required)'; end if;` |
| `set_challan_status` | same gate, message `set_challan_status` |
| `post_delivery` | same gate, message `post_delivery` |
| `generate_gst_invoice` | `if not has_permission('invoice.create') then raise exception 'generate_gst_invoice: not authorized (invoice.create required)'; end if;` |

Each re-created function keeps: `security definer`, `set search_path`/`alter function … set search_path`, then at the end of the migration:
`revoke execute on function public.<name>(…) from anon, public; grant execute on function public.<name>(…) to authenticated;`
(copy the revoke/grant block pattern already used by these functions).

- [ ] **Step 5: Sales RLS rewires**

Add policy rewrites for any Sales-related `has_permission('invoice.view')` RLS checks in the register sources so a cash-memo-only user can still read the register union. Specifically ensure the sales register read path (invoices view/table select policies used by `listInvoices`) becomes:

```sql
drop policy if exists read_invoices on public.invoices;
create policy read_invoices on public.invoices
  for select to authenticated
  using (has_permission('invoice.view') or has_permission('cashmemo.view'));
```

(Match the actual existing policy name/table from the register's data source; apply the same union where a single table serves both doc types.)

- [ ] **Step 6: Apply + validate**

Apply via `supabase db push`/MCP `apply_migration` `fine_grained_sales`. Functional validation (as the actor, e.g. run with a test authed session):

```sql
-- expect a clean raise for a user without invoice.create
do $$ begin
  perform public.post_invoice('{"store_id":"<id>","is_official":"true"}', '[]'::jsonb);
end $$;
```
(Run as a user lacking `invoice.create`; expect exception `post_invoice: not authorized (invoice.create required)`.)

- [ ] **Step 7: Commit**

```bash
git add app/supabase/migrations/0102_fine_grained_sales.sql
git commit -m "feat(db): fine-grained db gates for sales & invoicing"
```

---

### Task 3: Buy & Stock — DB gates + RLS

**Files:**
- Create: `app/supabase/migrations/0103_fine_grained_buy_stock.sql`

- [ ] **Step 1: Gate purchasing RPCs**

For each function, copy latest body and add gate after `begin` (replacing the old `purchase.manage` check where present):

| Function | Gate |
|---|---|
| `place_purchase_order` | `if not has_permission('purchase.create') then raise exception 'place_purchase_order: not authorized (purchase.create required)'; end if;` |
| `post_grn` | same, `post_grn` |
| `post_grn_from_po` | same, `post_grn_from_po` |
| `post_bill_from_grn` | `if not has_permission('purchase.record_bill') then raise exception 'post_bill_from_grn: not authorized (purchase.record_bill required)'; end if;` |
| `post_supplier_bill` | same, `post_supplier_bill` |
| `pay_supplier` | `if not has_permission('purchase.pay') then raise exception 'pay_supplier: not authorized (purchase.pay required)'; end if;` |
| `supplier_opening_balance` | same, `supplier_opening_balance` |
| `record_purchase_return` | `if not has_permission('purchase.create') then raise exception 'record_purchase_return: not authorized (purchase.create required)'; end if;` (replaces `purchase.manage`) |
| `bom_standard_cost` | `if not has_permission('bom.view') then raise exception 'bom_standard_cost: not authorized (bom.view required)'; end if;` (replaces `purchase.manage`) |

Keep `alter function … set search_path` + revoke from anon/public + grant to authenticated for each.

- [ ] **Step 2: Purchasing RLS rewires**

Replace policies whose `using`/`with check` currently reference `has_permission('purchase.manage')` (in `0013_suppliers`, `0014_purchases`, `0017_bom`, `0043_avl_debit_notes`) with the corresponding fine gates — read policies use `purchase.view`, write policies use `purchase.create`/`purchase.record_bill`/`purchase.pay` matching the table's semantics. Use `drop policy if exists …; create policy …` for each. Where a table spans bill + pay duties, combine with `or`.

- [ ] **Step 3: Holdings / custody gate**

The `/holdings` route (Holdings & Handover) currently has no permission. Add a read policy on the holdings/custody source so only users with `stock.custody` (or `stock.transfer`/`cash.transfer` for handover actors) can read others' custody; the owner always reads their own:

```sql
drop policy if exists read_holdings on public.<holdings_table>;
create policy read_holdings on public.<holdings_table>
  for select to authenticated
  using (user_id = public.current_app_user()
         or has_permission('stock.custody')
         or has_permission('cash.transfer')
         or has_permission('stock.transfer'));
```

(Use the actual holdings table name — check `0038_holdings_transfers.sql` / any `holdings` table — and the exact owner column.)

- [ ] **Step 4: Apply + validate + commit**

Apply (`fine_grained_buy_stock`). Validate a sample: as a role without `purchase.create`, `place_purchase_order` raises the fine message. Commit:

```bash
git add app/supabase/migrations/0103_fine_grained_buy_stock.sql
git commit -m "feat(db): fine-grained db gates for purchasing & holdings"
```

---

### Task 4: Manufacturing — DB gates + RLS

**Files:**
- Create: `app/supabase/migrations/0104_fine_grained_manufacturing.sql`

- [ ] **Step 1: Gate BOM / Production / Costing RPCs**

| Function | Gate |
|---|---|
| `upsert_bom` | `if not has_permission('bom.manage') then raise exception 'upsert_bom: not authorized (bom.manage required)'; end if;` |
| `post_production_run` | keep `has_permission('production.run')` (unchanged; already correct) |
| `upsert_job_card` | `if not has_permission('production.jobs') then raise exception 'upsert_job_card: not authorized (production.jobs required)'; end if;` (replaces `production.run`) |
| `set_job_card_status` | same, `set_job_card_status` |
| `reverse_production_run` | `if not has_permission('production.reverse') then raise exception 'reverse_production_run: not authorized (production.reverse required)'; end if;` (replaces `production.run`) |
| `run_process_costing` | `if not has_permission('costing.manage') then raise exception 'run_process_costing: not authorized (costing.manage required)'; end if;` |
| `compute_loaded_cost` | same, `compute_loaded_cost` |
| `set_cost_account_class` | `if not has_permission('costing.manage') then raise exception 'set_cost_account_class: not authorized (costing.manage required)'; end if;` (replaces `report.view_all`) |

Keep revoke/grant to authenticated for each.

- [ ] **Step 2: Costing read RLS rewire**

`read_cost` policies on `cost_accounts_tag`, `overhead_pools`, `costing_runs`, `costing_run_lines`, `product_cost_snapshots` currently `has_permission('report.view_all')`. Replace with `has_permission('report.costing')`:

```sql
drop policy if exists read_cost on public.costing_runs;
create policy read_cost on public.costing_runs
  for select to authenticated using (has_permission('report.costing'));
```
(Apply per table listed above.)

- [ ] **Step 3: Apply + validate + commit**

Apply (`fine_grained_manufacturing`). Validate `reverse_production_run` raises without `production.reverse`. Commit:

```bash
git add app/supabase/migrations/0104_fine_grained_manufacturing.sql
git commit -m "feat(db): fine-grained db gates for bom/production/costing"
```

---

### Task 5: Accounting — DB gates + RLS

**Files:**
- Create: `app/supabase/migrations/0105_fine_grained_accounting.sql`

- [ ] **Step 1: Gate expense/asset/loan RPCs** (replace `accounting.manage`)

| Function | Gate |
|---|---|
| `record_expense` | `if not has_permission('expense.manage') then raise exception 'record_expense: not authorized (expense.manage required)'; end if;` |
| `approve_expense` | same, `approve_expense` |
| `reject_expense` | same, `reject_expense` |
| `topup_petty_cash` | same, `topup_petty_cash` |
| `create_fixed_asset` | `if not has_permission('asset.manage') then raise exception 'create_fixed_asset: not authorized (asset.manage required)'; end if;` |
| `dispose_fixed_asset` | same, `dispose_fixed_asset` |
| `run_depreciation` | same, `run_depreciation` |
| `create_loan` | `if not has_permission('loan.manage') then raise exception 'create_loan: not authorized (loan.manage required)'; end if;` |
| `pay_emi` | same, `pay_emi` |
| `record_sales_return` already handled in Task 2 → leave out here |
| `post_complaint_credit_note` | `if not has_permission('crm.manage') then raise exception 'post_complaint_credit_note: not authorized (crm.manage required)'; end if;` (replaces `accounting.manage`) |

- [ ] **Step 2: Gate report/journal/bank RPCs**

| Function | Current | New gate |
|---|---|---|
| `post_voucher` | `journal.post` | keep (unchanged) |
| `reverse_journal` | none | `if not has_permission('journal.reverse') then raise exception 'reverse_journal: not authorized (journal.reverse required)'; end if;` |
| `get_trial_balance` | `report.view_all` | `if not has_permission('report.trial_balance') then raise exception 'get_trial_balance: not authorized (report.trial_balance required)'; end if;` |
| `get_ar_aging` | `report.view_all` | `if not has_permission('report.pnl') then raise exception 'get_ar_aging: not authorized (report.pnl required)'; end if;` |
| `refresh_read_models` | `report.view_all` | `if not has_permission('report.pnl') then raise exception 'refresh_read_models: not authorized (report.pnl required)'; end if;` |
| `import_gstr2b` | `accounting.manage` | `if not has_permission('report.gst') then raise exception 'import_gstr2b: not authorized (report.gst required)'; end if;` |
| `reconcile_gstr2b` | `accounting.manage` | `if not has_permission('report.gst') then raise exception 'reconcile_gstr2b: not authorized (report.gst required)'; end if;` |
| `bounce_cheque` | `journal.view` (RLS policy on cheque_registry) | gate the RPC: `if not has_permission('bank.cheque') then raise exception 'bounce_cheque: not authorized (bank.cheque required)'; end if;` |
| `register_cheque` / `set_cheque_status` | none | `if not has_permission('bank.cheque') then raise exception '<fn>: not authorized (bank.cheque required)'; end if;` |

- [ ] **Step 3: Accounting RLS rewires**

- `bank_*` read policies currently `journal.view or accounting.manage` → `journal.view or bank.reconcile or bank.cheque` where the reader may be a cheque clerk; `bank_csv_column_mapping` stays `accounting.manage`→`bank.reconcile`. `reconciliation_adjustments` writes → `bank.reconcile`.
- `documents` policies (0089) `uploaded_by = current_app_user() or has_permission('accounting.manage')` → `uploaded_by = current_app_user() or has_permission('documents.manage')`.
- `0024_targets_commissions` `accounting.manage` write policies → map to the owning module (commission `commission.manage`); `0023_credit_notes_schemes` `accounting.manage` → `creditnote.view` write/`crm.manage` where complaint-derived.
- `0091_customer_portal` / `0092_reconcile_payment_intents` `receipt.record or accounting.manage` → `receipt.record or invoice.payment`.

For each rewrite use `drop policy if exists …; create policy …` with the fine gate(s).

- [ ] **Step 4: Apply + validate + commit**

Apply (`fine_grained_accounting`). Validate `reverse_journal` raises without `journal.reverse`; a user with only `report.gst` cannot see costing (`get_ar_aging` raises). Commit:

```bash
git add app/supabase/migrations/0105_fine_grained_accounting.sql
git commit -m "feat(db): fine-grained db gates for accounting"
```

---

### Task 6: Field & People + WhatsApp — DB gates + RLS

**Files:**
- Create: `app/supabase/migrations/0106_fine_grained_field_people.sql`

- [ ] **Step 1: Gate field/transfer RPCs**

| Function | New gate |
|---|---|
| `create_transfer` | `if not has_permission('field.transfer') or has_permission('cash.transfer') or has_permission('stock.transfer') then …` — replace with UNION-safe: `if not (has_permission('field.transfer') or has_permission('cash.transfer') or has_permission('stock.transfer')) then raise exception 'create_transfer: not authorized (field.transfer/cash.transfer/stock.transfer required)'; end if;` |
| `respond_transfer` | same union gate, `respond_transfer` |
| `cancel_transfer` | same union gate, `cancel_transfer` (currently `roles.manage` — keep `roles.manage` OR the union so cancelling stays senior: `has_permission('roles.manage') or …`) |
| `post_fuel_log` | `if not has_permission('field.fleet') then raise exception 'post_fuel_log: not authorized (field.fleet required)'; end if;` |
| `convert_lead` | `if not has_permission('crm.manage') then raise exception 'convert_lead: not authorized (crm.manage required)'; end if;` (replaces `customer.manage`) |
| `post_complaint_credit_note` | already handled in Task 5 — leave out here |
| `compute_commissions` | `if not has_permission('commission.manage') then raise exception 'compute_commissions: not authorized (commission.manage required)'; end if;` |
| `post_commission_run` | same, `post_commission_run` |

- [ ] **Step 2: Field RLS rewires**

- `vehicle_gps_logs`, `fuel_refill_events` read policies currently `field.view` → `field.fleet` (or `field.routes or field.fleet` for routed/fleet union).
- `target_achievement` policy `hr.view` stays (HR target view) — if it is commission-facing, use `commission.view` instead; check the table semantics and choose the correct one.

- [ ] **Step 3: WhatsApp gates**

| Function | New gate |
|---|---|
| `whatsapp_insert_message` | `if not has_permission('whatsapp.inbox') then raise exception 'whatsapp_insert_message: not authorized (whatsapp.inbox required)'; end if;` |
| `whatsapp_mark_read` / `whatsapp_delete_conversation` | same `whatsapp.inbox` gate |
| `whatsapp_save_config` | `if not has_permission('whatsapp.manage') then raise exception 'whatsapp_save_config: not authorized (whatsapp.manage required)'; end if;` |
| `whatsapp_template_save` / `whatsapp_template_delete` | same `whatsapp.manage` gate |
| `whatsapp_enqueue_test_notify` | `whatsapp.manage` |

- [ ] **Step 4: Apply + validate + commit**

Apply (`fine_grained_field_people`). Validate `post_fuel_log` raises without `field.fleet`; `compute_commissions` raises without `commission.manage`. Commit:

```bash
git add app/supabase/migrations/0106_fine_grained_field_people.sql
git commit -m "feat(db): fine-grained db gates for field/people/whatsapp"
```

---

### Task 7: App layer — route-guard, nav, groups, Sales Desk split

**Files (all under `app/`):**
- Modify: `app/src/lib/auth/route-guard.ts`
- Modify: `app/src/components/shell/nav.ts`
- Modify: `app/src/components/shell/Sidebar.tsx`
- Modify: `app/src/lib/permission-groups.ts`
- Modify: `app/src/app/(app)/sales/page.tsx`
- Modify: `app/src/app/(app)/sales/SalesTable.tsx`
- Modify: `app/src/app/(app)/sales/SalesDeskActions.tsx`

- [ ] **Step 1: route-guard.ts — fine perms**

Replace coarse perms in `RULES` with fine gates (admin always passes via `can`):

| Route prefix | Old perm | New |
|---|---|---|
| `/invoices` | `invoice.view` | same |
| `/sales` | `invoice.view` | office register — gate with `canAccessAny(claims, ["invoice.view", "cashmemo.view"])` (manager/admin have these; field users have neither → no register) |
| `/orders` | `order.view` | `order.view` |
| `/challans` | `order.view` | `challan.view` |
| `/purchasing` | `purchase.view` | `purchase.view` |
| `/reports` | `report.view_all` | `report.pnl` |
| `/trial-balance` | `report.view_all` | `report.trial_balance` |
| `/gst` | `report.view_all` | `report.gst` |
| `/costing` | `report.view_all` | `report.costing` (read) — or union with `costing.manage` |

For `/sales`, add a union helper in route-guard.ts:

```ts
// allow union: /sales (office register) passes if the user holds ANY listed code
export function canAccessAny(claims: AppClaims, perms: string[]): boolean {
  if (claims.is_admin) return true;
  return perms.some((p) => claims.perms.includes(p));
}
```
and use `canAccessAny(claims, ["invoice.view", "cashmemo.view"])` for `/sales`. Field users (agent/sales) hold neither code, so the register is office-only — matching the operating model (field users get receipts, not the desk).

- [ ] **Step 2: nav.ts — fine perms + `anyOf`**

Extend `NavItem` in nav.ts with an optional union gate (mirrors `canAccessAny` in route-guard):

```ts
export interface NavItem {
  id: string;
  label: string;
  href: string;
  perm?: string;
  anyOf?: string[]; // visible if the user holds ANY of these (admin always passes)
  roles?: string[];
  badgeKey?: string;
}
```

- Sales Desk item: replace `perm: "invoice.view"` with `anyOf: ["invoice.view", "cashmemo.view"]` (a memo-only agent still sees the desk; the page filters rows by claims, Step 3).
- Challans item: change `perm: "order.view"` → `perm: "challan.view"`.
- Credit Notes item stays `creditnote.view`.
- No other items change in this task except those referencing retired coarse codes (`purchase.view` stays; `report.view_all` items are split below).

Update the `/reports` nav items that used `report.view_all`:
| Item | New |
|---|---|
| Process Costing `/costing` | `perm: "report.costing"` |
| GST Reports `/gst` | `perm: "report.gst"` |
| Trial Balance `/trial-balance` | `perm: "report.trial_balance"` |
| P&L / Balance Sheet `/reports` | `perm: "report.pnl"` |

- [ ] **Step 3: Sales Desk page split (invoice vs cash memo)**

Modify `app/src/app/(app)/sales/page.tsx` to fetch the viewer's claims (server component has `getSession()` → `session.claims`) and pass `canViewInvoices` / `canViewCashMemos` to the client table. `listInvoices` already supports `isOfficial`:

```tsx
const session = await getSession();
const claims = session?.claims;
const canViewInvoices = claims?.is_admin || claims?.perms.includes("invoice.view");
const canViewCashMemos = claims?.is_admin || claims?.perms.includes("cashmemo.view");
const isOfficial = canViewInvoices && !canViewCashMemos ? true
                 : canViewCashMemos && !canViewInvoices ? false
                 : undefined; // both -> union
const invoices = await listInvoices({ limit: 200, isOfficial });
```
Pass `canViewInvoices`/`canViewCashMemos` to `<SalesTable invoices={…} canRaiseInvoice={…} canRaiseCashMemo={…} />`.

- [ ] **Step 4: SalesTable + SalesDeskActions**

`SalesTable.tsx`: filter the client-side `docType` selector to only offer types the user can see; hide row "Record payment"/"Void" actions when the user lacks `invoice.payment`/`invoice.void`. `SalesDeskActions.tsx`: "Record sale" (official) disabled unless `canRaiseInvoice`, and any cash-memo path available per `canRaiseCashMemo`. Pass the booleans in from the page.

`Sidebar.tsx`: extend the nav filter to honor `anyOf`:
```tsx
if (it.anyOf) return it.anyOf.some((p) => can(claims, p));
```

- [ ] **Step 5: permission-groups.ts — new labels**

Add labels for the new page prefixes (keys that groupPermissions will see):
`cashmemo: "Sales & Invoicing"`, `order: "Orders & Challans"`, `challan: "Orders & Challans"`, `expense: "Expenses & Petty Cash"`, `asset: "Fixed Assets"`, `loan: "Loans & EMI"`, `report: "Reports"`, `bank: "Bank"`, `field: "Field Operations"`, `production: "Production"`, `costing: "Costing"`, `whatsapp: "Messaging"`, `documents: "Documents"`, `stock: "Stock & Handover"`, `crm: "CRM & Complaints"`, `commission: "Targets & Commissions"`, `hr: "HR & Payroll"`, `roles: "Roles & Users"`, `audit: "Audit"`, `license: "Licences"`, `settings: "Settings"`, `cash: "Cash & Handover"`, `release: "Company Settings"`.
(New/unlisted prefixes use the existing `titleCase` fallback, so only add what needs a custom label.)

- [ ] **Step 6: Typecheck + build + commit**

Run from `app/`: `npm run typecheck` && `npm run build` — both must pass. (Lint is not runnable in this repo — no ESLint config; do not set it up.)

```bash
git add app/src/lib/auth/route-guard.ts app/src/components/shell/nav.ts app/src/components/shell/Sidebar.tsx \
        app/src/lib/permission-groups.ts \
        "app/src/app/(app)/sales/page.tsx" "app/src/app/(app)/sales/SalesTable.tsx" "app/src/app/(app)/sales/SalesDeskActions.tsx"
git commit -m "feat(app): wire fine-grained perms into guard, nav, groups, sales desk"
```

---

### Task 8: Document release — table, RPC, accountant read-RLS

**Files:**
- Create: `app/supabase/migrations/0107_fine_grained_release.sql`

**Interfaces:**
- Consumes: `release.manage` code (Task 1); document tables (invoices, expenses, supplier_bills, vouchers, credit notes, challans); `has_permission()`.
- Produces: `public.document_releases` table; `public.release_documents(p_types text[], p_from date, p_to date)` RPC returning `int` (rows released); the accountant read-RLS gate pattern reused by the module policies.

- [ ] **Step 1: Create the release table + RPC**

```sql
-- 0107_fine_grained_release.sql
create table if not exists public.document_releases (
  entity_type text not null,             -- 'invoices' | 'expenses' | 'supplier_bills' | 'vouchers' | 'credit_notes' | 'challans'
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

create or replace function public.release_documents(
  p_types text[],
  p_from date,
  p_to   date
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := current_app_user();
  v_released int := 0;
  r record;
begin
  if not has_permission('release.manage') then
    raise exception 'release_documents: not authorized (release.manage required)';
  end if;
  if p_from > p_to then
    raise exception 'release_documents: p_from must be <= p_to';
  end if;

  for r in
    select 'invoices'::text as et, i.id as eid, i.invoice_date::date as d from public.invoices i
    union all
    select 'expenses'::text, e.id, e.expense_date::date from public.expenses e
    union all
    select 'supplier_bills'::text, b.id, b.bill_date::date from public.supplier_bills b
    union all
    select 'vouchers'::text, v.id, v.voucher_date::date from public.vouchers v
    union all
    select 'credit_notes'::text, c.id, c.credit_note_date::date from public.credit_notes c
    union all
    select 'challans'::text, ch.id, ch.challan_date::date from public.challans ch
    where r.et = any(p_types)
      and r.d between p_from and p_to
  loop
    insert into public.document_releases (entity_type, entity_id, released_at, released_by)
    values (r.et, r.eid, now(), v_actor)
    on conflict (entity_type, entity_id) do nothing
    returning 1 into v_released;
  end loop;

  perform write_audit('update', 'document_releases',
    v_actor::text,
    format('released %s docs in %s..%s for types %s', v_released, p_from, p_to, p_types::text),
    jsonb_build_object('types', p_types, 'from', p_from, 'to', p_to), v_actor);
  return v_released;
end $function$;
```

(Use the ACTUAL table/column names from the codebase for `expenses`, `supplier_bills`, `vouchers`, `credit_notes`, `challans` — verify each in `app/src/lib/supabase/database.types.ts` and the migrations, and adjust the union's columns to each table's real date column. Do not invent tables that don't exist; drop a union branch for a type that has no table.)

- [ ] **Step 2: Hardening grants**

```sql
alter function public.release_documents(text[], date, date) set search_path = public;
revoke execute on function public.release_documents(text[], date, date) from anon, public;
grant execute on function public.release_documents(text[], date, date) to authenticated;
```

- [ ] **Step 3: Accountant read-RLS gate on releasable tables**

The accountant is read-only + released-only. Every releasable document table's SELECT policy becomes: admin OR (view code AND released). For each table (invoices, expenses, supplier_bills, vouchers, credit_notes, challans) add/replace:

```sql
drop policy if exists read_released_invoices on public.invoices;
create policy read_released_invoices on public.invoices
  for select to authenticated
  using (
    has_permission('invoice.view')
    and exists (
      select 1 from public.document_releases dr
      where dr.entity_type = 'invoices' and dr.entity_id = invoices.id
    )
  );
```

(Apply per table: `invoice.view` for invoices, `expense.view` for expenses, `purchase.view` for supplier_bills, `journal.view` for vouchers, `creditnote.view` for credit_notes, `challan.view` for challans. Admin/manager keep their existing broader policies — this policy ADDs the accountant gate via RLS OR-semantics; verify the existing select policies still allow manager/admin and that the release predicate does not over-restrict them.)

- [ ] **Step 4: Apply + validate + commit**

Apply (`fine_grained_release`). Validate: an accountant user (only view codes, no `release.manage`) sees a released invoice and NOT an unreleased one; a manager can release a batch and gets the count back. Commit:

```bash
git add app/supabase/migrations/0107_fine_grained_release.sql
git commit -m "feat(db): document release table, rpc, and accountant read gate"
```

---

### Task 9: Release Center UI + acknowledgment receipt

**Files:**
- Create: `app/src/app/(app)/admin/releases/page.tsx` (server page, admin+manager gate)
- Create: `app/src/app/(app)/admin/releases/ReleaseCenter.tsx` (client component)
- Create: `app/src/app/(app)/sales/ReceiptSheet.tsx` (acknowledgment receipt print view)
- Modify: `app/src/lib/data/releases.ts` (new data functions: listReleaseCounts, call release RPC)
- Modify: `app/src/lib/actions/releases.ts` (new server action `runRelease`)
- Modify: `app/src/lib/auth/route-guard.ts` (add `/admin/releases` rule — in Task 7, add `{ prefix: "/admin/releases", perm: "release.manage" }`)
- Modify: `app/src/components/shell/nav.ts` (admin group: "Release Center" → `/admin/releases`, `perm: "release.manage"`)

**Interfaces:**
- Consumes: `release_documents` RPC (Task 8); `release.manage` code; `getSession()` → `claims`.
- Produces: `/admin/releases` page; a field-facing acknowledgment receipt view.

- [ ] **Step 1: Data + action layer**

`app/src/lib/data/releases.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export interface ReleaseTypeCount {
  entityType: string;
  label: string;
  released: number;
  unreleased: number;
}

export async function listReleaseCounts(pFrom: string, pTo: string): Promise<ReleaseTypeCount[]> {
  const supabase = createClient();
  // Per-type counts of released vs unreleased within the date range. Implement
  // with the existing data functions or a lightweight count query per type;
  // each row: { entityType, label, released, unreleased }.
  return [];
}
```

`app/src/lib/actions/releases.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/sales";

export async function runRelease(
  types: string[],
  from: string,
  to: string,
): Promise<ActionResult<{ released: number }>> {
  if (types.length === 0) return { ok: false, error: "Select at least one document type." };
  if (!from || !to || from > to) return { ok: false, error: "Pick a valid date range." };
  const supabase = createClient();
  const { data, error } = await supabase.rpc("release_documents", {
    p_types: types,
    p_from: from,
    p_to: to,
  });
  if (error || typeof data !== "number") {
    return { ok: false, error: error?.message ?? "Release failed." };
  }
  revalidatePath("/admin/releases");
  return { ok: true, released: data };
}
```

- [ ] **Step 2: Release Center page + component**

`app/src/app/(app)/admin/releases/page.tsx` — server page gated by `release.manage` (route-guard handles the redirect; page also checks and shows a `/no-access` fallback). Fetches `listReleaseCounts` for a default month range and renders `<ReleaseCenter />`.

`ReleaseCenter.tsx` (client) — per-type tiles (label + released/unreleased counts) with a `Toggle` per type, a date range picker (month default), "Select all types", and a **Release** button. On click: `runRelease(selectedTypes, from, to)`; show the returned count in a toast; refetch counts. Uses existing `Panel`, `Toggle`, `Button`, `PageContainer`, `PageHeader`.

- [ ] **Step 3: Acknowledgment receipt view**

`ReceiptSheet.tsx` — a printable, read-only receipt for a single cash memo the field user just recorded: business name/address, receipt no (memo no), date, the user's name, line items (item, qty, unit price, amount), grand total. Server data comes from `getInvoice(id)`/`listInvoices` (the memo row is in the same table with `is_official=false`); render with `@media print` CSS (hide nav/buttons on print) and a "Print" button. The field flow: after recording a sale, the action returns the invoice id; the user is shown a "View receipt" button linking to this view (route e.g. `/sales/receipt/[id]`). No register — only the single own-memo view.

- [ ] **Step 4: Typecheck + build + commit**

Run from `app/`: `npm run typecheck` && `npm run build` — both pass. Commit:

```bash
git add app/src/lib/data/releases.ts app/src/lib/actions/releases.ts \
        "app/src/app/(app)/admin/releases/page.tsx" "app/src/app/(app)/admin/releases/ReleaseCenter.tsx" \
        "app/src/app/(app)/sales/ReceiptSheet.tsx" "app/src/app/(app)/sales/receipt/[id]/page.tsx"
git commit -m "feat(app): release center and field acknowledgment receipt"
```

---

### Task 10: Retire unreferenced coarse codes + final validation

**Files:**
- Create: `app/supabase/migrations/0108_fine_grained_cleanup.sql`

- [ ] **Step 1: Confirm zero references before deleting**

Run against the live DB BEFORE authoring the migration:

```sql
select code, count(*) as refs
from (
  select rp.permission as code from public.role_permissions rp
  union all
  select upo.permission as code from public.user_permission_overrides upo
) x
where code in ('invoice.view','purchase.manage','accounting.manage','report.view_all',
               'field.view','orders.approve','cash.transfer')
group by code;
```
Expected: all zero (Tasks 1–7 rewired everything). If any code still has refs (e.g. `invoice.view` kept intentionally as the official-invoice view), that code is NOT retired — keep it. Only codes that are truly replaced AND unreferenced are deleted.

- [ ] **Step 2: Drop unreferenced coarse codes**

```sql
delete from public.permissions
 where code in ('purchase.manage','accounting.manage','report.view_all',
                'field.view','orders.approve','cash.transfer')
   and code not in (select permission from public.role_permissions)
   and code not in (select permission from public.user_permission_overrides);
```
(`invoice.view` is usually KEPT as the official-invoice view code per the design — confirm via Step 1 and keep it if any UI/route still references it.)

- [ ] **Step 3: Final full verification**

- From `app/`: `npm run typecheck` && `npm run build` — PASS.
- DB: re-run the effective-access diff (Task 1 pattern) to confirm no user's effective permission set shrank; run security advisors (`get_advisors` via Supabase MCP) and confirm no new gaps beyond the intended authenticated-definer class.
- Manual smoke (browser, pending environment): agent sees cash memos only (no invoice rows/actions); accountant sees invoices only; a user with `cashmemo.create` cannot raise an official invoice (DB raises).

- [ ] **Step 4: Commit**

```bash
git add app/supabase/migrations/0108_fine_grained_cleanup.sql
git commit -m "chore(db): retire unreferenced coarse permission codes"
```

---

## Final Integration Verification (run after all tasks)

From `app/`:

```bash
npm run typecheck
npm run build
```

DB manual smoke set (as an authenticated session):
1. Agent (only `cashmemo.create`, no `invoice.view`/`cashmemo.view`): has NO Sales Desk register (route blocked); records a sale → memo → sees only the acknowledgment receipt for it; direct `post_invoice` with `is_official=true` raises `not authorized (invoice.create required)`.
2. Accountant (read-only view codes): sees ONLY released invoices/expenses/etc.; an unreleased invoice is not visible; `release_documents` raises `not authorized (release.manage required)`; `post_invoice`/`record_expense` raise.
3. Manager: releases a batch (types + range) via the Release Center; count returns; accountant now sees them; edits to a released doc flow through (release is visibility-only).
4. GST viewer (only `report.gst`): `/gst` renders; `/costing` and cost RPCs raise; `get_ar_aging` raises.
5. No role regressions: every previous user's effective access is a superset (diff query passes).

## Deployment notes

- Migrations 0101–0107 must land before the app-layer Task 7 (Task 7's UI reads the same codes).
- 0108 is last, only after the reference check returns zero for each dropped code.
- The Supabase MCP `apply_migration` names should match the file stems (`fine_grained_catalog`, `fine_grained_sales`, …) if the CLI is unavailable.
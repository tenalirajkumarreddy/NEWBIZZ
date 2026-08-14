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

do $$
declare
  r record;
  v_role uuid;
  v_perms text[];
  v_perm text;
begin
  -- agent / sales / field: record sales -> auto CASH MEMO, receipts, challans,
  -- field ops. NO invoice.view / cashmemo.view register access, NO invoice.create.
  for r in
    select id from roles where code in ('agent','sales')
  loop
    v_perms := array['cashmemo.create','receipt.record','challan.view','challan.record',
                     'field.routes','field.fleet','field.transfer','stock.view'];
    foreach v_perm in array v_perms loop
      insert into public.role_permissions (role_id, permission, scope)
      values (r.id, v_perm, 'all')
      on conflict on constraint role_permissions_pkey do nothing;
    end loop;
  end loop;

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
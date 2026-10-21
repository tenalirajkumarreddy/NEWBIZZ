-- =====================================================================
-- 0128_security_tenant_isolation.sql
--
-- Security remediation pass 1:
--   * make portal identity use the same JWT claim path as current_app_user
--   * add a staff-principal predicate so a portal user can never inherit
--     the broad `read_all_auth` policies
--   * replace broad read policies on sensitive tables
--   * lock company assets and document objects down
--   * revoke internal SECURITY DEFINER helpers from API roles
--   * add accounting.manage guards to bank/scheme write RPCs
--   * remove self-service updates of users.status/branch/token_version
--
-- This migration is intentionally defensive: it keeps existing staff UX,
-- but a portal principal resolves to a customer, never to a staff user.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Principal predicates
-- ---------------------------------------------------------------------

create or replace function public.is_staff_principal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
     where u.id = public.current_app_user()
       and u.status = 'active'
  );
$$;

comment on function public.is_staff_principal() is
  'True only for an active internal user. Portal customers are not staff even when they are authenticated.';

revoke all on function public.is_staff_principal() from public, anon;
grant execute on function public.is_staff_principal() to authenticated, service_role;

-- The portal functions previously read the legacy request.jwt.claim.sub GUC.
-- current_app_user() reads request.jwt.claims (0048); use that single source so
-- portal identity and staff identity resolve through the same claim path.
create or replace function public.portal_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cp.customer_id
    from public.customer_portal cp
    join auth.users a on a.phone = cp.contact_phone
   where a.id = public.current_app_user()
     and cp.status = 'active'
   limit 1;
$$;

create or replace function public.is_portal_principal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.customer_portal cp
      join auth.users a on a.phone = cp.contact_phone
     where a.id = public.current_app_user()
       and cp.status = 'active'
  );
$$;

revoke all on function public.portal_customer_id() from public, anon;
revoke all on function public.is_portal_principal() from public, anon;
grant execute on function public.portal_customer_id() to authenticated, service_role;
grant execute on function public.is_portal_principal() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Replace broad staff read policies with staff-only predicates.
--    These tables previously had `using (true)` for every authenticated
--    user; the only thing keeping a portal user out was the fragile
--    portal_deny_all policy.
-- ---------------------------------------------------------------------

drop policy if exists read_all_auth on public.customers;
create policy read_all_auth on public.customers
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.customer_stores;
create policy read_all_auth on public.customer_stores
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.customer_receipts;
create policy read_all_auth on public.customer_receipts
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.sales_orders;
create policy read_all_auth on public.sales_orders
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.customer_ledger;
create policy read_all_auth on public.customer_ledger
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.stock_ledger;
create policy read_all_auth on public.stock_ledger
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.company_settings;
create policy read_all_auth on public.company_settings
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.payment_methods;
create policy read_all_auth on public.payment_methods
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.roles;
create policy read_all_auth on public.roles
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_all_auth on public.user_roles;
create policy read_all_auth on public.user_roles
  for select to authenticated using (public.is_staff_principal());

drop policy if exists read_users on public.users;
create policy read_users on public.users
  for select to authenticated using (public.is_staff_principal());

-- WhatsApp config and message bodies are finance/CRM-sensitive.
drop policy if exists read_all_auth on public.whatsapp_config;
create policy read_whatsapp_config on public.whatsapp_config
  for select to authenticated using (public.has_permission('admin'));

drop policy if exists read_all_auth on public.whatsapp_messages;
create policy read_whatsapp_messages on public.whatsapp_messages
  for select to authenticated
  using (public.has_permission('whatsapp.inbox') or public.has_permission('admin'));

-- Documents: internal metadata is staff-only; restricted documents are
-- uploader/manager-only. Portal users have no staff read path.
drop policy if exists read_documents on public.documents;
create policy read_documents on public.documents
  for select to authenticated
  using (
    (public.is_staff_principal() and visibility = 'internal')
    or uploaded_by = public.current_app_user()
    or public.has_permission('documents.manage')
    or public.has_permission('accounting.manage')
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.is_staff_principal());

drop policy if exists documents_owner_update on public.documents;
create policy documents_owner_update on public.documents
  for update to authenticated
  using (
    public.is_staff_principal()
    and (
      uploaded_by = public.current_app_user()
      or public.has_permission('documents.manage')
      or public.has_permission('accounting.manage')
    )
  );

drop policy if exists documents_owner_delete on public.documents;
create policy documents_owner_delete on public.documents
  for delete to authenticated
  using (
    public.is_staff_principal()
    and (
      uploaded_by = public.current_app_user()
      or public.has_permission('documents.manage')
      or public.has_permission('accounting.manage')
    )
  );

-- ---------------------------------------------------------------------
-- 3. Object-level storage policies
-- ---------------------------------------------------------------------

-- Documents: a caller may read/delete an object only when they can see the
-- metadata row. The helper is SECURITY DEFINER so it does not recurse through
-- documents RLS.
create or replace function public.can_access_document(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.documents d
     where d.storage_bucket = p_bucket
       and d.storage_path = p_path
       and (
         d.uploaded_by = public.current_app_user()
         or public.has_permission('documents.manage')
         or public.has_permission('accounting.manage')
         or (d.visibility = 'internal' and public.is_staff_principal())
       )
  );
$$;

revoke all on function public.can_access_document(text, text) from public, anon;
grant execute on function public.can_access_document(text, text) to authenticated, service_role;

drop policy if exists "documents read" on storage.objects;
create policy "documents read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.can_access_document(bucket_id, name)
  );

drop policy if exists "documents insert" on storage.objects;
create policy "documents insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_staff_principal());

drop policy if exists "documents delete" on storage.objects;
create policy "documents delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.can_access_document(bucket_id, name)
  );

-- Company branding/signature/QR belong in a private bucket. The public
-- party-images bucket stays for customer/store photos only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company-assets read" on storage.objects;
create policy "company-assets read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = 'company'
    and public.is_staff_principal()
  );

drop policy if exists "company-assets insert" on storage.objects;
create policy "company-assets insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = 'company'
    and public.has_permission('settings.manage')
  );

drop policy if exists "company-assets update" on storage.objects;
create policy "company-assets update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = 'company'
    and public.has_permission('settings.manage')
  )
  with check (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = 'company'
    and public.has_permission('settings.manage')
  );

drop policy if exists "company-assets delete" on storage.objects;
create policy "company-assets delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-assets'
    and (storage.foldername(name))[1] = 'company'
    and public.has_permission('settings.manage')
  );

-- Tighten party-images writes. Company assets uploaded before this migration
-- remain public objects; re-upload them into company-assets and remove the old
-- objects. New company writes are admin-only and go to company-assets.
drop policy if exists "party-images insert" on storage.objects;
create policy "party-images insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'party-images'
    and public.is_staff_principal()
    and (
      coalesce((storage.foldername(name))[1], '') <> 'company'
      or public.has_permission('settings.manage')
    )
  );

drop policy if exists "party-images update" on storage.objects;
create policy "party-images update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'party-images'
    and public.is_staff_principal()
    and (
      coalesce((storage.foldername(name))[1], '') <> 'company'
      or public.has_permission('settings.manage')
    )
  )
  with check (
    bucket_id = 'party-images'
    and public.is_staff_principal()
    and (
      coalesce((storage.foldername(name))[1], '') <> 'company'
      or public.has_permission('settings.manage')
    )
  );

drop policy if exists "party-images delete" on storage.objects;
create policy "party-images delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'party-images'
    and public.is_staff_principal()
    and (
      coalesce((storage.foldername(name))[1], '') <> 'company'
      or public.has_permission('settings.manage')
    )
  );

-- ---------------------------------------------------------------------
-- 4. Revoke internal SECURITY DEFINER helpers from API roles.
--    These are implementation details, not client RPCs. SECURITY DEFINER
--    callers still run as the function owner and retain access.
-- ---------------------------------------------------------------------

revoke all on function public._post_credit_note(uuid, numeric, credit_note_reason, jsonb)
  from public, anon, authenticated;
grant execute on function public._post_credit_note(uuid, numeric, credit_note_reason, jsonb)
  to service_role;

revoke all on function public.customer_opening_balance(uuid, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.customer_opening_balance(uuid, numeric, date, text)
  to service_role;

revoke all on function public.receive_opening_stock(uuid, uuid, numeric, numeric, date)
  from public, anon, authenticated;
grant execute on function public.receive_opening_stock(uuid, uuid, numeric, numeric, date)
  to service_role;

revoke all on function public.rebuild_account_balances(uuid)
  from public, anon, authenticated;
grant execute on function public.rebuild_account_balances(uuid)
  to service_role;

revoke all on function public.post_stock_move(uuid, uuid, stock_move_type, numeric, numeric, text, text, uuid, date)
  from public, anon, authenticated;
grant execute on function public.post_stock_move(uuid, uuid, stock_move_type, numeric, numeric, text, text, uuid, date)
  to service_role;

revoke all on function public.write_audit(audit_action, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.write_audit(audit_action, text, text, text, jsonb, uuid)
  to service_role;

revoke all on function public.notify(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.notify(uuid, text, jsonb)
  to service_role;

revoke all on function public.next_number(text, date)
  from public, anon, authenticated;
grant execute on function public.next_number(text, date)
  to service_role;

revoke all on function public.whatsapp_get_config()
  from public, anon, authenticated;
grant execute on function public.whatsapp_get_config()
  to service_role;

-- ---------------------------------------------------------------------
-- 5. Permission checks on client-facing finance RPCs that previously
--    trusted RLS/UI only.
-- ---------------------------------------------------------------------

create or replace function public.import_bank_statement(
  p_bank_account uuid, p_rows jsonb, p_opts jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import  uuid;
  v_row     jsonb;
  v_amt     numeric(14,2);
  v_dir     bank_txn_direction;
  v_date    date;
  v_key     text;
  v_ins     int := 0;
  v_dup     int := 0;
  v_total   int := 0;
  v_actor   uuid := public.current_app_user();
begin
  if not has_permission('accounting.manage') then
    raise exception 'import_bank_statement: not authorized (accounting.manage required)';
  end if;
  if not exists (select 1 from bank_accounts where id = p_bank_account) then
    raise exception 'import_bank_statement: unknown bank account %', p_bank_account;
  end if;

  insert into bank_statement_imports (bank_account_id, file_name, file_hash,
      period_start, period_end, closing_balance, row_count, imported_by)
  values (p_bank_account, p_opts->>'file_name', p_opts->>'file_hash',
      nullif(p_opts->>'period_start','')::date, nullif(p_opts->>'period_end','')::date,
      nullif(p_opts->>'closing_balance','')::numeric,
      coalesce(jsonb_array_length(p_rows),0), v_actor)
  returning id into v_import;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_total := v_total + 1;
    v_amt := coalesce((v_row->>'amount')::numeric,
                      coalesce((v_row->>'credit')::numeric,0)
                    - coalesce((v_row->>'debit')::numeric,0));
    v_date := (v_row->>'txn_date')::date;
    v_dir  := case when v_amt >= 0 then 'credit' else 'debit' end;
    v_key  := md5(v_date::text || '|' || v_amt::text || '|' ||
                  coalesce(nullif(v_row->>'ref_no',''), v_row->>'description', ''));

    insert into bank_transactions (bank_account_id, import_id, txn_date, value_date,
        description, ref_no, amount, direction, running_balance, dedup_key)
    values (p_bank_account, v_import, v_date, nullif(v_row->>'value_date','')::date,
        v_row->>'description', v_row->>'ref_no', v_amt, v_dir,
        nullif(v_row->>'running_balance','')::numeric, v_key)
    on conflict (bank_account_id, dedup_key) do nothing;

    if found then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
  end loop;

  update bank_statement_imports
     set inserted_count = v_ins, duplicate_count = v_dup where id = v_import;

  perform write_audit('insert','bank_statement_imports', v_import::text,
            format('Statement import: %s inserted, %s duplicate', v_ins, v_dup),
            jsonb_build_object('inserted', v_ins, 'duplicates', v_dup), v_actor);
  return jsonb_build_object('import_id', v_import, 'inserted', v_ins,
                            'duplicates', v_dup, 'total', v_total);
end $$;

create or replace function public.match_bank_txn(p_txn uuid, p_target jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn     bank_transactions;
  v_match   uuid;
  v_je      uuid := nullif(p_target->>'journal_entry_id','')::uuid;
  v_rcpt    uuid := nullif(p_target->>'receipt_id','')::uuid;
  v_pay     uuid := nullif(p_target->>'payment_id','')::uuid;
  v_add     numeric(14,2);
  v_already numeric(14,2);
  v_actor   uuid := public.current_app_user();
begin
  if not has_permission('accounting.manage') then
    raise exception 'match_bank_txn: not authorized (accounting.manage required)';
  end if;
  select * into v_txn from bank_transactions where id = p_txn for update;
  if not found then raise exception 'match_bank_txn: unknown txn %', p_txn; end if;
  v_add := coalesce((p_target->>'amount')::numeric, abs(v_txn.amount));
  if v_je is null and v_rcpt is null and v_pay is null then
    raise exception 'match_bank_txn: one of journal_entry_id, receipt_id, payment_id is required';
  end if;
  if v_add is null or v_add <= 0 then
    raise exception 'match_bank_txn: match amount must be > 0';
  end if;

  -- A receipt/journal may clear only one statement line, and a statement line
  -- may be cleared only up to its own amount. Without these guards the same
  -- source could be matched twice and double-count in reconciliation.
  if exists (
    select 1 from bank_txn_matches m
     where (v_je is not null and m.journal_entry_id = v_je)
        or (v_rcpt is not null and m.receipt_id = v_rcpt)
        or (v_pay is not null and m.payment_id = v_pay)
  ) then
    raise exception 'match_bank_txn: source document is already matched to a statement line';
  end if;

  select coalesce(sum(amount), 0) into v_already
    from bank_txn_matches where bank_transaction_id = p_txn;
  if v_already + v_add > abs(v_txn.amount) + 0.01 then
    raise exception 'match_bank_txn: match amount % exceeds unmatched %.2f on txn %',
      v_add, abs(v_txn.amount) - v_already, p_txn;
  end if;

  insert into bank_txn_matches (bank_transaction_id, journal_entry_id, receipt_id,
                                payment_id, amount, matched_by)
  values (p_txn, v_je, v_rcpt, v_pay, v_add, v_actor)
  returning id into v_match;

  update bank_transactions
     set matched = (v_already + v_add >= abs(v_txn.amount) - 0.01),
         matched_at = now()
   where id = p_txn;

  perform write_audit('update','bank_transactions', p_txn::text,
            'Statement line matched', p_target, v_actor);
  return v_match;
end $$;

create or replace function public.post_reconciliation_adjustment(
  p_bank_account uuid, p_amount numeric, p_kind bank_adj_type, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank   bank_accounts;
  v_gl     text;
  v_date   date := coalesce((p_opts->>'adj_date')::date, current_date);
  v_lines  jsonb;
  v_je     uuid;
  v_adj    uuid;
  v_txn    uuid := nullif(p_opts->>'bank_transaction_id','')::uuid;
  v_actor  uuid := public.current_app_user();
begin
  if not has_permission('accounting.manage') then
    raise exception 'post_reconciliation_adjustment: not authorized (accounting.manage required)';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'post_reconciliation_adjustment: amount must be > 0'; end if;
  select * into v_bank from bank_accounts where id = p_bank_account;
  if not found then raise exception 'post_reconciliation_adjustment: unknown bank account %', p_bank_account; end if;
  v_gl := v_bank.gl_account_code;

  if p_kind = 'bank_charge' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5610','debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_gl, 'debit', 0, 'credit', p_amount));
  elsif p_kind = 'interest_income' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_gl, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code','4200','debit', 0, 'credit', p_amount));
  else
    raise exception 'post_reconciliation_adjustment: kind % needs explicit accounts (use post_journal)', p_kind;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','bank_adjustment',
                       'narration', coalesce(p_opts->>'narration',
                         format('Bank %s on %s', p_kind, v_bank.name))),
    v_lines);

  insert into reconciliation_adjustments (bank_account_id, adj_type, amount, adj_date,
      narration, journal_entry_id, bank_transaction_id, created_by)
  values (p_bank_account, p_kind, p_amount, v_date, p_opts->>'narration', v_je, v_txn, v_actor)
  returning id into v_adj;

  update journal_entries set source_id = v_adj where id = v_je;
  if v_txn is not null then
    perform match_bank_txn(v_txn, jsonb_build_object('journal_entry_id', v_je::text, 'amount', p_amount));
  end if;

  perform write_audit('post','reconciliation_adjustments', v_adj::text,
            format('Bank %s: %s', p_kind, p_amount),
            jsonb_build_object('journal_entry_id', v_je, 'amount', p_amount), v_actor);
  return v_je;
end $$;

create or replace function public.calc_scheme_eligibility(p_scheme uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s       schemes;
  v_tier    jsonb;
  v_rec     record;
  v_best_r  numeric; v_best_t int; v_rebate numeric(14,2);
  v_n       int := 0; v_i int;
  v_actor   uuid := public.current_app_user();
begin
  if not has_permission('accounting.manage') then
    raise exception 'calc_scheme_eligibility: not authorized (accounting.manage required)';
  end if;
  select * into v_s from schemes where id = p_scheme;
  if not found then raise exception 'calc_scheme_eligibility: unknown scheme %', p_scheme; end if;

  for v_rec in
    select i.store_id, sum(il.qty) as vol
      from invoices i
      join invoice_lines il on il.invoice_id = i.id
     where i.status = 'posted'
       and i.invoice_date between v_s.period_start and v_s.period_end
     group by i.store_id
  loop
    v_best_r := 0; v_best_t := null; v_i := 0;
    for v_tier in select * from jsonb_array_elements(v_s.tiers_json) loop
      v_i := v_i + 1;
      if v_rec.vol >= (v_tier->>'min_cases')::numeric
         and (v_tier->>'rebate_per_case')::numeric >= v_best_r then
        v_best_r := (v_tier->>'rebate_per_case')::numeric;
        v_best_t := v_i;
      end if;
    end loop;

    if v_best_t is not null and v_best_r > 0 then
      v_rebate := round(v_rec.vol * v_best_r, 2);
      insert into scheme_eligibility (scheme_id, customer_store_id, total_volume,
                                      tier_achieved, rebate_amount, status)
      values (p_scheme, v_rec.store_id, v_rec.vol, v_best_t, v_rebate, 'pending_approval')
      on conflict (scheme_id, customer_store_id) do update
        set total_volume = excluded.total_volume,
            tier_achieved = excluded.tier_achieved,
            rebate_amount = excluded.rebate_amount,
            status = 'pending_approval'
        where scheme_eligibility.status = 'pending_approval';
      v_n := v_n + 1;
    end if;
  end loop;

  perform write_audit('update','schemes', p_scheme::text,
            format('Scheme %s eligibility computed: %s stores', v_s.name, v_n),
            jsonb_build_object('rows', v_n), v_actor);
  return v_n;
end $$;

create or replace function public.post_scheme_credit_note(p_eligibility uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e     scheme_eligibility;
  v_s     schemes;
  v_base  numeric(14,2); v_tax numeric(14,2);
  v_cn    uuid;
  v_actor uuid := public.current_app_user();
begin
  if not has_permission('accounting.manage') then
    raise exception 'post_scheme_credit_note: not authorized (accounting.manage required)';
  end if;
  select * into v_e from scheme_eligibility where id = p_eligibility;
  if not found then raise exception 'post_scheme_credit_note: unknown eligibility %', p_eligibility; end if;
  if v_e.status = 'posted' or v_e.credit_note_id is not null then
    raise exception 'post_scheme_credit_note: eligibility % already posted', p_eligibility;
  end if;
  if v_e.rebate_amount <= 0 then
    raise exception 'post_scheme_credit_note: zero rebate for eligibility %', p_eligibility;
  end if;
  select * into v_s from schemes where id = v_e.scheme_id;

  if v_s.gst_adjusted then
    v_base := round(v_e.rebate_amount / (1 + v_s.gst_rate/100.0), 2);
    v_tax  := round(v_e.rebate_amount - v_base, 2);
  else
    v_base := v_e.rebate_amount; v_tax := 0;
  end if;

  v_cn := _post_credit_note(v_e.customer_store_id, v_e.rebate_amount, 'scheme_rebate',
            jsonb_build_object('gst_adjusted', v_s.gst_adjusted,
                               'base_amount', v_base, 'tax_amount', v_tax,
                               'scheme_eligibility_id', p_eligibility::text,
                               'narration', format('Scheme rebate: %s', v_s.name)));

  update scheme_eligibility
     set status = 'posted', credit_note_id = v_cn,
         approved_by = coalesce(approved_by, v_actor),
         approved_at = coalesce(approved_at, now())
   where id = p_eligibility;
  return v_cn;
end $$;

-- ---------------------------------------------------------------------
-- 6. Self-service profile updates must not change privileged columns.
--    The app uses admin_set_user_status for status changes; drop the broad
--    policy and keep only the columns a profile actually owns.
-- ---------------------------------------------------------------------

drop policy if exists self_update on public.users;
create policy self_update_profile on public.users
  for update to authenticated
  using (id = public.current_app_user())
  with check (id = public.current_app_user());

revoke update on public.users from authenticated;
grant update (full_name, phone, email) on public.users to authenticated;

-- ---------------------------------------------------------------------
-- 7. Re-grant the client-facing functions we intentionally kept.
--    Explicit grants make the post-migration surface auditable.
-- ---------------------------------------------------------------------

grant execute on function public.import_bank_statement(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.match_bank_txn(uuid, jsonb) to authenticated, service_role;
grant execute on function public.post_reconciliation_adjustment(uuid, numeric, bank_adj_type, jsonb) to authenticated, service_role;
grant execute on function public.calc_scheme_eligibility(uuid) to authenticated, service_role;
grant execute on function public.post_scheme_credit_note(uuid) to authenticated, service_role;

-- invitation_for_phone stays callable by anon: the login page uses it before a
-- session exists to decide whether a phone may self-create. It returns only a
-- boolean; rate-limit it at the edge/API layer.

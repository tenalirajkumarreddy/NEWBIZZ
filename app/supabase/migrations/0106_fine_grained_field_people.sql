-- =====================================================================
-- 0106_fine_grained_field_people.sql
--
-- Fine-grained DB gates for Field & People + WhatsApp (Task 6).
--
--   14 functions get fine gates (adding a gate where none existed, or
--   replacing the coarse admin gate):
--
--     • create_transfer             → field.transfer / cash.transfer / stock.transfer
--     • respond_transfer            → field.transfer / cash.transfer / stock.transfer
--     • cancel_transfer             → roles.manage / field.transfer / cash.transfer / stock.transfer
--     • post_fuel_log               → field.fleet        (gate ADDED — had none)
--     • convert_lead                → crm.manage / customer.manage (gate ADDED — had none;
--                                     body uses current_setting, NOT current_app_user)
--     • compute_commissions         → commission.manage (gate ADDED — had none)
--     • post_commission_run         → commission.manage (gate ADDED — had none)
--     • whatsapp_save_config        → whatsapp.manage   (REPLACES admin)
--     • whatsapp_insert_message     → whatsapp.inbox    (gate ADDED — had none)
--     • whatsapp_mark_read          → whatsapp.inbox    (gate ADDED — had none)
--     • whatsapp_delete_conversation→ whatsapp.inbox    (gate ADDED — had none)
--     • whatsapp_template_save      → whatsapp.manage   (REPLACES admin)
--     • whatsapp_template_delete    → whatsapp.manage   (REPLACES admin)
--     • whatsapp_enqueue_test_notify→ whatsapp.manage   (REPLACES admin)
--
-- All 14 bodies are sourced from live pg_get_functiondef captures (live
-- bodies drifted to current_app_user() where applicable — repo copies were
-- not trusted). Only permission gates are added/changed; all bodies,
-- security definer and search_path are preserved byte-for-byte.
--
--   RLS rewires (2 — drop + create, permissive, to authenticated):
--     • vehicle_gps_logs  read_all_auth  SELECT using (true)  → has_permission('field.fleet')
--     • fuel_refill_events read_all_auth  SELECT using (field.view) → has_permission('field.fleet')
--   (Controller decisions — fleet read, not field.view, as the plan assumed.)
--   insert_system (vehicle_gps_logs), manage_all_auth (fuel_refill_events)
--   and the portal_deny_all policies are NOT touched.
--
--   Role grant: roles.manage was unassigned — added to manager (additive,
--   idempotent, superset-only). Controller decision.
--
--   target_achievement is SKIPPED: no such table exists (only sales_targets,
--   already fine-grained in 0105).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. create_transfer — field.transfer/cash.transfer/stock.transfer
--    Source: live capture. Union gate inserted after the actor check,
--    BEFORE the per-branch checks (those are untouched, as is the
--    roles.manage custody check later in the body).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_transfer(p_header jsonb, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor   uuid := current_app_user();
  v_type    text := p_header->>'type';
  v_from_u  uuid := nullif(p_header->>'from_user_id','')::uuid;
  v_from_b  uuid := nullif(p_header->>'from_branch_id','')::uuid;
  v_to_u    uuid := nullif(p_header->>'to_user_id','')::uuid;
  v_to_b    uuid := nullif(p_header->>'to_branch_id','')::uuid;
  v_amount  numeric := nullif(p_header->>'amount','')::numeric;
  v_deposit text := nullif(p_header->>'deposit_account','');
  v_id      uuid;
  v_no      text;
  v_fy      uuid;
  v_line    jsonb;
  v_entry   uuid;
  v_n       int := 0;
begin
  if v_actor is null then raise exception 'create_transfer: no authenticated user'; end if;
  if not (has_permission('field.transfer') or has_permission('cash.transfer') or has_permission('stock.transfer')) then raise exception 'create_transfer: not authorized (field.transfer/cash.transfer/stock.transfer required)'; end if;

  if v_type = 'cash' then
    if not has_permission('cash.transfer') then
      raise exception 'create_transfer: not authorized (needs cash.transfer)';
    end if;
    if v_from_u is null then raise exception 'create_transfer: cash needs from_user_id'; end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'create_transfer: cash amount must be > 0';
    end if;
    if v_deposit is not null and v_deposit <> '1120' then
      raise exception 'create_transfer: deposit_account must be 1120';
    end if;
    if v_deposit is null and v_to_u is null then
      raise exception 'create_transfer: cash needs to_user_id or deposit_account';
    end if;
    if v_to_u = v_from_u then raise exception 'create_transfer: sender and receiver are the same user'; end if;
  elsif v_type = 'stock' then
    if not has_permission('stock.transfer') then
      raise exception 'create_transfer: not authorized (needs stock.transfer)';
    end if;
    if num_nonnulls(v_from_u, v_from_b) <> 1 or num_nonnulls(v_to_u, v_to_b) <> 1 then
      raise exception 'create_transfer: stock needs exactly one origin and one destination';
    end if;
    if v_from_b is not null and v_to_b is not null then
      raise exception 'create_transfer: branch-to-branch moves use stock adjustments, not handovers';
    end if;
    if v_from_u is not null and v_from_u = v_to_u then
      raise exception 'create_transfer: sender and receiver are the same user';
    end if;
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'create_transfer: stock transfer needs at least one line';
    end if;
  else
    raise exception 'create_transfer: type must be stock or cash';
  end if;

  -- a user-origin transfer must be created by that user (or an admin/manager
  -- with roles.manage) — never silently move another user's custody.
  if v_from_u is not null and v_from_u <> v_actor and not has_permission('roles.manage') then
    raise exception 'create_transfer: only % can hand over their own custody', v_from_u;
  end if;

  v_fy := fy_for_date(current_date);
  v_no := next_number('transfer', current_date);

  insert into transfers (transfer_no, fy_id, type, from_user_id, from_branch_id,
                         to_user_id, to_branch_id, amount, deposit_account,
                         reference_order_id, note, created_by)
  values (v_no, v_fy, v_type, v_from_u, v_from_b, v_to_u, v_to_b, v_amount, v_deposit,
          nullif(p_header->>'reference_order_id','')::uuid,
          nullif(p_header->>'note',''), v_actor)
  returning id into v_id;

  if v_type = 'stock' then
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      if nullif(v_line->>'item_id','') is null or coalesce((v_line->>'qty')::numeric, 0) <= 0 then
        raise exception 'create_transfer: every line needs item_id and qty > 0';
      end if;
      insert into transfer_lines (transfer_id, item_id, qty, batch_no)
      values (v_id, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
              nullif(v_line->>'batch_no',''));
      v_n := v_n + 1;
    end loop;
  end if;

  -- bank deposit: no counterpart custodian — post now, atomically.
  if v_type = 'cash' and v_deposit is not null then
    -- lock + verify the sender actually holds the cash
    perform _bump_user_cash(v_from_u, 0);
    perform 1 from user_cash_holdings where user_id = v_from_u and amount >= v_amount for update;
    if not found then
      raise exception 'create_transfer: user holds less cash than the deposit amount';
    end if;
    v_entry := post_journal(
      jsonb_build_object('entry_date', current_date, 'source', 'transfer',
                         'source_id', v_id::text, 'doc_type', 'handover',
                         'narration', 'Bank deposit '||v_no),
      jsonb_build_array(
        jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_code', '2140', 'debit', 0, 'credit', v_amount,
                           'party_type', 'user', 'party_id', v_from_u::text)));
    perform _bump_user_cash(v_from_u, -v_amount);
    update transfers
       set status = 'accepted', responded_by = v_actor, responded_at = now(),
           journal_entry_id = v_entry
     where id = v_id;
  end if;

  perform write_audit('insert', 'transfers', v_id::text,
    v_type||' transfer '||v_no||case when v_deposit is not null then ' (bank deposit, posted)' else ' created (pending)' end,
    jsonb_build_object('header', p_header, 'lines', v_n));
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 2. respond_transfer — field.transfer/cash.transfer/stock.transfer
--    Source: live capture. Union gate inserted after the actor check,
--    BEFORE `select * into v_t`. Recipient/stock.transfer branch logic
--    untouched.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_transfer(p_id uuid, p_accept boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_t     transfers%rowtype;
  v_l     record;
  v_cost  numeric;
  v_ledger uuid;
  v_entry uuid;
begin
  if v_actor is null then raise exception 'respond_transfer: no authenticated user'; end if;
  if not (has_permission('field.transfer') or has_permission('cash.transfer') or has_permission('stock.transfer')) then raise exception 'respond_transfer: not authorized (field.transfer/cash.transfer/stock.transfer required)'; end if;

  select * into v_t from transfers where id = p_id for update;
  if v_t.id is null then raise exception 'respond_transfer: unknown transfer %', p_id; end if;
  if v_t.status <> 'pending' then
    raise exception 'respond_transfer: transfer % is already %', v_t.transfer_no, v_t.status;
  end if;

  if v_t.to_user_id is not null then
    if v_actor <> v_t.to_user_id then
      raise exception 'respond_transfer: only the receiving user can respond';
    end if;
  else
    if not has_permission('stock.transfer') then
      raise exception 'respond_transfer: not authorized (needs stock.transfer)';
    end if;
  end if;

  if not p_accept then
    update transfers set status = 'rejected', responded_by = v_actor, responded_at = now()
     where id = p_id;
    perform write_audit('reject', 'transfers', p_id::text,
      'Transfer '||v_t.transfer_no||' rejected');
    return p_id;
  end if;

  if v_t.type = 'cash' then
    -- lock + verify sender still holds the cash, then move it with a journal.
    perform _bump_user_cash(v_t.from_user_id, 0);
    perform 1 from user_cash_holdings
      where user_id = v_t.from_user_id and amount >= v_t.amount for update;
    if not found then
      raise exception 'respond_transfer: sender holds less cash than %', v_t.amount;
    end if;
    v_entry := post_journal(
      jsonb_build_object('entry_date', current_date, 'source', 'transfer',
                         'source_id', p_id::text, 'doc_type', 'handover',
                         'narration', 'Cash handover '||v_t.transfer_no),
      jsonb_build_array(
        jsonb_build_object('account_code', '2140', 'debit', v_t.amount, 'credit', 0,
                           'party_type', 'user', 'party_id', v_t.to_user_id::text),
        jsonb_build_object('account_code', '2140', 'debit', 0, 'credit', v_t.amount,
                           'party_type', 'user', 'party_id', v_t.from_user_id::text)));
    perform _bump_user_cash(v_t.from_user_id, -v_t.amount);
    perform _bump_user_cash(v_t.to_user_id,    v_t.amount);
    update transfers set journal_entry_id = v_entry where id = p_id;

  else -- stock: qty moves, value stays in inventory (no journal, no P&L)
    for v_l in select * from transfer_lines where transfer_id = p_id
    loop
      if v_t.from_branch_id is not null then
        -- WH → user: issue at branch WAC (post_stock_move enforces stock),
        -- carry that cost into the user's holding.
        v_ledger := post_stock_move(v_l.item_id, v_t.from_branch_id, 'transfer_out',
                                    -v_l.qty, 0, null, 'transfer', p_id, current_date);
        select unit_cost into v_cost from stock_ledger where id = v_ledger;
        perform _user_stock_in(v_t.to_user_id, v_l.item_id, v_l.qty, coalesce(v_cost, 0));
      elsif v_t.to_branch_id is not null then
        -- user → WH: pull from custody at the holding's WA cost, receive
        -- into the warehouse at that same cost (WAC re-merges there).
        v_cost := _user_stock_out(v_t.from_user_id, v_l.item_id, v_l.qty);
        perform post_stock_move(v_l.item_id, v_t.to_branch_id, 'transfer_in',
                                v_l.qty, v_cost, null, 'transfer', p_id, current_date);
      else
        -- user → user: custody-to-custody at the sender's WA cost.
        v_cost := _user_stock_out(v_t.from_user_id, v_l.item_id, v_l.qty);
        perform _user_stock_in(v_t.to_user_id, v_l.item_id, v_l.qty, v_cost);
      end if;
    end loop;
  end if;

  update transfers set status = 'accepted', responded_by = v_actor, responded_at = now()
   where id = p_id;
  perform write_audit('approve', 'transfers', p_id::text,
    'Transfer '||v_t.transfer_no||' accepted');
  return p_id;
end $function$;

-- ---------------------------------------------------------------------
-- 3. cancel_transfer — roles.manage/field.transfer/cash.transfer/stock.transfer
--    Source: live capture. Gate inserted as FIRST statement after begin;
--    existing sender/roles.manage check kept.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := current_app_user();
  v_t transfers%rowtype;
begin
  if not (has_permission('roles.manage') or has_permission('field.transfer') or has_permission('cash.transfer') or has_permission('stock.transfer')) then raise exception 'cancel_transfer: not authorized (roles.manage/field.transfer/cash.transfer/stock.transfer required)'; end if;
  select * into v_t from transfers where id = p_id for update;
  if v_t.id is null then raise exception 'cancel_transfer: unknown transfer %', p_id; end if;
  if v_t.status <> 'pending' then
    raise exception 'cancel_transfer: transfer % is already %', v_t.transfer_no, v_t.status;
  end if;
  if v_actor is distinct from v_t.created_by
     and v_actor is distinct from v_t.from_user_id
     and not has_permission('roles.manage') then
    raise exception 'cancel_transfer: only the sender can cancel';
  end if;
  update transfers set status = 'cancelled', responded_by = v_actor, responded_at = now()
   where id = p_id;
  perform write_audit('void', 'transfers', p_id::text,
    'Transfer '||v_t.transfer_no||' cancelled');
  return p_id;
end $function$;

-- ---------------------------------------------------------------------
-- 4. post_fuel_log — field.fleet
--    Source: live capture. NO gate existed — adding field.fleet after
--    begin, before any statement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_fuel_log(p_header jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vehicle uuid := (p_header->>'vehicle_id')::uuid;
  v_litres  numeric := (p_header->>'litres')::numeric;
  v_amount  numeric := (p_header->>'amount')::numeric;
  v_date    date    := coalesce((p_header->>'log_date')::date, current_date);
  v_pay     text    := coalesce(p_header->>'pay_from','cash');
  v_credit  text;
  v_je      uuid;
  v_log     uuid;
  v_actor   uuid := current_app_user();
begin
  if not has_permission('field.fleet') then raise exception 'post_fuel_log: not authorized (field.fleet required)'; end if;
  if v_vehicle is null then raise exception 'post_fuel_log: vehicle_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'post_fuel_log: amount must be > 0'; end if;
  if not exists (select 1 from vehicles where id = v_vehicle) then
    raise exception 'post_fuel_log: unknown vehicle %', v_vehicle;
  end if;
  v_credit := case v_pay when 'bank' then '1120' when 'cash' then '1110' else null end;
  if v_credit is null then raise exception 'post_fuel_log: pay_from must be cash or bank'; end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','fuel', 'narration',
                       format('Fuel: vehicle %s, %s L', v_vehicle, v_litres)),
    jsonb_build_array(
      jsonb_build_object('account_code','5540','debit', v_amount, 'credit', 0),
      jsonb_build_object('account_code', v_credit,'debit', 0, 'credit', v_amount)));

  insert into fuel_logs (vehicle_id, trip_id, log_date, litres, amount, odometer,
                         journal_entry_id, created_by)
  values (v_vehicle, nullif(p_header->>'trip_id','')::uuid, v_date, v_litres, v_amount,
          nullif(p_header->>'odometer','')::numeric, v_je, v_actor)
  returning id into v_log;

  update journal_entries set source_id = v_log where id = v_je;

  perform write_audit('post','fuel_logs', v_log::text,
            format('Fuel %s L / %s for vehicle %s', v_litres, v_amount, v_vehicle),
            jsonb_build_object('amount', v_amount, 'vehicle_id', v_vehicle), v_actor);
  return v_log;
end $function$;

-- ---------------------------------------------------------------------
-- 5. convert_lead — crm.manage / customer.manage
--    Source: live capture. NO gate existed — adding union gate after
--    begin. Controller decision: customer.manage added so agent/sales keep
--    conversion. Body uses current_setting, NOT current_app_user.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_lead(p_lead uuid, p_customer jsonb DEFAULT '{}'::jsonb, p_store jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead   leads;
  v_cust   uuid;
  v_store  uuid;
  v_ccode  text;
  v_scode  text;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not (has_permission('crm.manage') or has_permission('customer.manage')) then raise exception 'convert_lead: not authorized (crm.manage/customer.manage required)'; end if;
  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'convert_lead: unknown lead %', p_lead; end if;
  if v_lead.status = 'converted' or v_lead.converted_customer_id is not null then
    raise exception 'convert_lead: lead % already converted', p_lead;
  end if;

  v_ccode := 'CUST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_scode := 'STR-'  || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  -- Customer record — no kind (it lives on the store now)
  insert into customers (code, name, gstin, pan, state_code, phone, email,
                         credit_limit, credit_days, created_by)
  values (v_ccode,
          coalesce(p_customer->>'name', v_lead.company, v_lead.name),
          nullif(p_customer->>'gstin',''),
          nullif(p_customer->>'pan',''),
          coalesce(p_customer->>'state_code','33'),
          coalesce(p_customer->>'phone', v_lead.phone),
          coalesce(p_customer->>'email', v_lead.email),
          coalesce((p_customer->>'credit_limit')::numeric, 0),
          coalesce((p_customer->>'credit_days')::int, 0),
          v_actor)
  returning id into v_cust;

  -- First store — kind comes from p_customer (legacy), p_store (new), or 'retail'
  insert into customer_stores (customer_id, code, name, kind, contact_name, phone,
                               address_line, area, city, pincode, state_code,
                               route_id, created_by)
  values (v_cust, v_scode,
          coalesce(p_store->>'name', 'Main Store'),
          coalesce((p_store->>'kind')::customer_kind, (p_customer->>'kind')::customer_kind, 'retail'),
          coalesce(p_store->>'contact_name', v_lead.name),
          coalesce(p_store->>'phone', v_lead.phone),
          nullif(p_store->>'address_line',''),
          nullif(p_store->>'area',''),
          nullif(p_store->>'city',''),
          nullif(p_store->>'pincode',''),
          coalesce(p_store->>'state_code','33'),
          nullif(p_store->>'route_id','')::uuid,
          v_actor)
  returning id into v_store;

  update leads
     set status = 'converted', converted_customer_id = v_cust, updated_at = now()
   where id = p_lead;

  insert into interactions (lead_id, customer_store_id, type, by_user_id, note)
  values (p_lead, v_store, 'note', v_actor,
          format('Lead converted → customer %s / store %s', v_ccode, v_scode));

  perform write_audit('insert','customers', v_cust::text,
            format('Lead %s converted to customer %s', p_lead, v_ccode),
            jsonb_build_object('lead_id', p_lead, 'customer_code', v_ccode,
                               'store_code', v_scode), v_actor);
  return v_cust;
end $function$;

-- ---------------------------------------------------------------------
-- 6. compute_commissions — commission.manage
--    Source: live capture. NO gate existed — adding after begin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_commissions(p_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from   date := date_trunc('month', p_month)::date;
  v_to     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_run    uuid;
  v_rule   record;
  v_base   numeric(14,2);
  v_rate   numeric(6,3);
  v_tier   jsonb;
  v_amt    numeric(14,2);
  v_total  numeric(14,2) := 0;
  v_actor  uuid := current_app_user();
begin
  if not has_permission('commission.manage') then raise exception 'compute_commissions: not authorized (commission.manage required)'; end if;
  delete from commission_runs where period_month = v_from and status = 'draft';
  insert into commission_runs (period_month, status, created_by)
    values (v_from, 'draft', v_actor) returning id into v_run;

  for v_rule in
    with active_users as (
      select u.id as user_id, ur.role_id, ro.code as role_code
        from users u
        join user_roles ur on ur.user_id = u.id
        join roles ro on ro.id = ur.role_id
       where u.status = 'active'
    ),
    per_user as (
      select au.user_id,
             coalesce(cu.basis, cr.basis)         as basis,
             coalesce(cu.rate,  cr.rate)          as rate,
             coalesce(cu.threshold, cr.threshold) as threshold,
             coalesce(cu.tier_json, cr.tier_json) as tier_json,
             (cu.id is not null)                  as is_user_rule
        from active_users au
        left join commission_rules cu
          on cu.user_id = au.user_id and cu.status = 'active'
        left join commission_rules cr
          on cr.role_code = au.role_code and cr.user_id is null and cr.status = 'active'
       where cu.id is not null or cr.id is not null
    )
    select distinct on (user_id) user_id, basis, rate, threshold, tier_json
      from per_user
     order by user_id, is_user_rule desc
  loop
    v_base := _user_commission_base(v_rule.user_id, v_rule.basis, v_from, v_to);
    if v_base <= v_rule.threshold then continue; end if;

    v_rate := v_rule.rate;
    for v_tier in select * from jsonb_array_elements(v_rule.tier_json) loop
      if v_base >= (v_tier->>'min')::numeric and (v_tier->>'rate')::numeric >= v_rate then
        v_rate := (v_tier->>'rate')::numeric;
      end if;
    end loop;

    v_amt := round(v_base * v_rate / 100.0, 2);
    if v_amt <= 0 then continue; end if;

    insert into commission_lines (run_id, user_id, basis, base_amount, rate, commission_amount)
    values (v_run, v_rule.user_id, v_rule.basis, v_base, v_rate, v_amt);
    v_total := v_total + v_amt;
  end loop;

  update commission_runs
     set status = 'computed', total_amount = v_total, computed_at = now()
   where id = v_run;

  perform write_audit('update','commission_runs', v_run::text,
            format('Commissions computed for %s: %s total', to_char(v_from,'YYYY-MM'), v_total),
            jsonb_build_object('total', v_total), v_actor);
  return v_run;
end $function$;

-- ---------------------------------------------------------------------
-- 7. post_commission_run — commission.manage
--    Source: live capture. NO gate existed — adding after begin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_commission_run(p_run uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run    commission_runs;
  v_lines  jsonb := '[]'::jsonb;
  v_line   record;
  v_je     uuid;
  v_date   date;
  v_actor  uuid := current_app_user();
begin
  if not has_permission('commission.manage') then raise exception 'post_commission_run: not authorized (commission.manage required)'; end if;
  select * into v_run from commission_runs where id = p_run;
  if not found then raise exception 'post_commission_run: unknown run %', p_run; end if;
  if v_run.status = 'posted' or v_run.journal_entry_id is not null then
    raise exception 'post_commission_run: run % already posted', p_run;
  end if;
  if v_run.total_amount <= 0 then
    raise exception 'post_commission_run: nothing to post for run %', p_run;
  end if;
  v_date := (date_trunc('month', v_run.period_month) + interval '1 month - 1 day')::date;

  v_lines := v_lines || jsonb_build_object('account_code','5530','debit', v_run.total_amount, 'credit', 0);
  for v_line in select user_id, commission_amount from commission_lines where run_id = p_run loop
    v_lines := v_lines || jsonb_build_object('account_code','2135','debit',0,
                 'credit', v_line.commission_amount,
                 'party_type','user','party_id', v_line.user_id::text);
  end loop;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','commission_run', 'source_id', p_run::text,
                       'narration', format('Commissions %s', to_char(v_run.period_month,'YYYY-MM'))),
    v_lines);

  update commission_runs set status = 'posted', journal_entry_id = v_je where id = p_run;

  perform write_audit('post','commission_runs', p_run::text,
            format('Commission run posted: %s', v_run.total_amount),
            jsonb_build_object('journal_entry_id', v_je, 'total', v_run.total_amount), v_actor);
  return v_je;
end $function$;

-- ---------------------------------------------------------------------
-- 8. whatsapp_save_config — whatsapp.manage (REPLACES admin)
--    Source: live capture. `admin` gate swapped for whatsapp.manage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_save_config(p_waba_id text DEFAULT NULL::text, p_phone_number_id text DEFAULT NULL::text, p_access_token_encrypted text DEFAULT NULL::text, p_meta_app_id text DEFAULT NULL::text, p_verify_token text DEFAULT NULL::text, p_default_template text DEFAULT NULL::text, p_dry_run boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := public.current_app_user();
begin
  if not has_permission('whatsapp.manage') then raise exception 'whatsapp_save_config: not authorized (whatsapp.manage required)'; end if;
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
end $function$;

-- ---------------------------------------------------------------------
-- 9. whatsapp_insert_message — whatsapp.inbox
--    Source: live capture. NO gate existed — adding after begin.
--    (Original 0081 grant was to anon; the revoke block below handles it.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_insert_message(p_conversation_id uuid, p_direction text, p_msg_type text DEFAULT 'text'::text, p_body text DEFAULT NULL::text, p_media_url text DEFAULT NULL::text, p_media_mime text DEFAULT NULL::text, p_media_filename text DEFAULT NULL::text, p_template_name text DEFAULT NULL::text, p_template_params jsonb DEFAULT NULL::jsonb, p_whatsapp_message_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sent_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not has_permission('whatsapp.inbox') then raise exception 'whatsapp_insert_message: not authorized (whatsapp.inbox required)'; end if;
  insert into whatsapp_messages (
    conversation_id, direction, msg_type, body, media_url, media_mime,
    media_filename, template_name, template_params, whatsapp_message_id,
    status, sent_by)
  values (
    p_conversation_id, p_direction, p_msg_type, p_body, p_media_url, p_media_mime,
    p_media_filename, p_template_name, p_template_params, p_whatsapp_message_id,
    p_status, p_sent_by)
  returning id into v_id;

  update whatsapp_conversations
     set last_message_at = now(),
         status = case when p_direction = 'inbound' then 'open' else status end
   where id = p_conversation_id;
  return v_id;
end $function$;

-- ---------------------------------------------------------------------
-- 10. whatsapp_mark_read — whatsapp.inbox
--     Source: live capture. NO gate existed — adding after begin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_mark_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_permission('whatsapp.inbox') then raise exception 'whatsapp_mark_read: not authorized (whatsapp.inbox required)'; end if;
  update whatsapp_conversations
     set last_read_at = now()
   where id = p_conversation_id;
end $function$;

-- ---------------------------------------------------------------------
-- 11. whatsapp_delete_conversation — whatsapp.inbox
--     Source: live capture. NO gate existed — adding after begin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_delete_conversation(p_phone text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_conv uuid;
begin
  if not has_permission('whatsapp.inbox') then raise exception 'whatsapp_delete_conversation: not authorized (whatsapp.inbox required)'; end if;
  select id into v_conv from whatsapp_conversations where phone = p_phone limit 1;
  if v_conv is not null then
    -- notifications for inbound messages reference the conversation entity
    delete from notifications
     where entity_type = 'whatsapp_conversations'
       and entity_id = v_conv;
    -- whatsapp_messages cascade on conversation delete
    delete from whatsapp_conversations where id = v_conv;
  end if;
end $function$;

-- ---------------------------------------------------------------------
-- 12. whatsapp_template_save — whatsapp.manage (REPLACES admin)
--     Source: live capture. `admin` gate swapped for whatsapp.manage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_template_save(p_name text, p_body_text text, p_category text DEFAULT 'Utility'::text, p_language text DEFAULT 'en_US'::text, p_status text DEFAULT 'APPROVED'::text)
 RETURNS whatsapp_message_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row whatsapp_message_templates;
begin
  if not has_permission('whatsapp.manage') then raise exception 'whatsapp_template_save: not authorized (whatsapp.manage required)'; end if;
  if nullif(p_name, '') is null or nullif(p_body_text, '') is null then
    raise exception 'name and body_text are required';
  end if;
  insert into whatsapp_message_templates (user_id, name, category, language, body_text, status)
  values (public.current_app_user(), p_name, p_category, p_language, p_body_text, p_status)
  on conflict (name, language) do update set
    body_text = excluded.body_text,
    category  = excluded.category,
    status    = excluded.status
  returning * into v_row;
  return v_row;
end $function$;

-- ---------------------------------------------------------------------
-- 13. whatsapp_template_delete — whatsapp.manage (REPLACES admin)
--     Source: live capture. `admin` gate swapped for whatsapp.manage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_template_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_permission('whatsapp.manage') then raise exception 'whatsapp_template_delete: not authorized (whatsapp.manage required)'; end if;
  delete from whatsapp_message_templates where id = p_id;
end $function$;

-- ---------------------------------------------------------------------
-- 14. whatsapp_enqueue_test_notify — whatsapp.manage (REPLACES admin)
--     Source: live capture. `admin` gate swapped for whatsapp.manage.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_test_notify(p_phone text, p_title text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conv uuid;
  v_phone text := regexp_replace(p_phone, '\\D', '', 'g');
begin
  if not has_permission('whatsapp.manage') then raise exception 'whatsapp_enqueue_test_notify: not authorized (whatsapp.manage required)'; end if;
  select id into v_conv from whatsapp_conversations where phone = v_phone limit 1;
  if v_conv is null then
    insert into whatsapp_conversations (phone, status)
    values (v_phone, 'open') returning id into v_conv;
  end if;
  perform public.notify(
    public.current_app_user(),
    coalesce(nullif(p_title, ''), 'WhatsApp test notification'),
    jsonb_build_object(
      'body', p_body,
      'severity', 'info',
      'category', 'test',
      'delivery_channel', 'whatsapp'::notification_channel,
      'entity_type', 'whatsapp_conversations',
      'entity_id', v_conv::text));
  return v_conv;
end $function$;

-- =====================================================================
-- 15. RLS rewires — fleet read (field.fleet) in place of `true` / field.view.
--     Both policies stay PERMISSIVE, to authenticated, exactly as before;
--     only the permission expression changes. insert_system
--     (vehicle_gps_logs), manage_all_auth (fuel_refill_events) and the
--     portal_deny_all policies are NOT touched.
-- =====================================================================
drop policy if exists read_all_auth on public.vehicle_gps_logs;
create policy read_all_auth on public.vehicle_gps_logs
  for select to authenticated using (has_permission('field.fleet'));

drop policy if exists read_all_auth on public.fuel_refill_events;
create policy read_all_auth on public.fuel_refill_events
  for select to authenticated using (has_permission('field.fleet'));

-- =====================================================================
-- 16. Close the role-grant gap (superset-only, additive, idempotent)
--     roles.manage → manager. It was unassigned — controller decision.
-- =====================================================================
do $$
declare v uuid;
begin
  select id into v from public.roles where code = 'manager';
  if v is not null then
    insert into public.role_permissions (role_id, permission, scope) values
      (v, 'roles.manage','all')
    on conflict on constraint role_permissions_pkey do nothing;
  end if;
end $$;

-- =====================================================================
-- 17. Revoke/grant — authenticated only, exactly once per function.
--     Identities use the full argument signatures (defaults omitted).
--     whatsapp_insert_message was originally granted to anon (0081) — the
--     revoke below handles that.
-- =====================================================================
revoke all on function create_transfer(jsonb, jsonb) from public, anon;
grant execute on function create_transfer(jsonb, jsonb) to authenticated;

revoke all on function respond_transfer(uuid, boolean) from public, anon;
grant execute on function respond_transfer(uuid, boolean) to authenticated;

revoke all on function cancel_transfer(uuid) from public, anon;
grant execute on function cancel_transfer(uuid) to authenticated;

revoke all on function post_fuel_log(jsonb) from public, anon;
grant execute on function post_fuel_log(jsonb) to authenticated;

revoke all on function convert_lead(uuid, jsonb, jsonb) from public, anon;
grant execute on function convert_lead(uuid, jsonb, jsonb) to authenticated;

revoke all on function compute_commissions(date) from public, anon;
grant execute on function compute_commissions(date) to authenticated;

revoke all on function post_commission_run(uuid) from public, anon;
grant execute on function post_commission_run(uuid) to authenticated;

revoke all on function whatsapp_save_config(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function whatsapp_save_config(text, text, text, text, text, text, boolean) to authenticated;

revoke all on function whatsapp_insert_message(uuid, text, text, text, text, text, text, text, jsonb, text, text, uuid) from public, anon;
grant execute on function whatsapp_insert_message(uuid, text, text, text, text, text, text, text, jsonb, text, text, uuid) to authenticated;

revoke all on function whatsapp_mark_read(uuid) from public, anon;
grant execute on function whatsapp_mark_read(uuid) to authenticated;

revoke all on function whatsapp_delete_conversation(text) from public, anon;
grant execute on function whatsapp_delete_conversation(text) to authenticated;

revoke all on function whatsapp_template_save(text, text, text, text, text) from public, anon;
grant execute on function whatsapp_template_save(text, text, text, text, text) to authenticated;

revoke all on function whatsapp_template_delete(uuid) from public, anon;
grant execute on function whatsapp_template_delete(uuid) to authenticated;

revoke all on function whatsapp_enqueue_test_notify(text, text, text) from public, anon;
grant execute on function whatsapp_enqueue_test_notify(text, text, text) to authenticated;
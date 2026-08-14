-- =====================================================================
-- 0104_fine_grained_manufacturing.sql
--
-- Fine-grained DB gates for Manufacturing (Task 4).
--
--   • upsert_bom            → bom.manage
--   • post_production_run   → production.run   (gate ADDED — had none)
--   • upsert_job_card       → production.jobs  (replaces production.run)
--   • set_job_card_status   → production.jobs  (replaces production.run)
--   • reverse_production_run→ production.reverse (replaces production.run;
--                              manager-only reversal — controller decision)
--   • run_process_costing   → costing.manage   (gate ADDED — had none)
--   • compute_loaded_cost   → costing.manage   (gate ADDED — had none)
--   • set_cost_account_class→ costing.manage   (gate ADDED — had none)
--
-- The 5 functions whose live bodies drifted from repo (live uses
-- current_app_user()) are sourced from live pg_get_functiondef captures:
-- upsert_bom, post_production_run, run_process_costing, compute_loaded_cost,
-- set_cost_account_class. The 3 job-card / reversal functions match repo
-- 0090 exactly and are sourced from it verbatim.
--
-- Only permission gates are added/changed; all bodies, security definer and
-- search_path are preserved byte-for-byte.
--
-- Also: cost read RLS rewires (report.view_all → report.costing) and the
-- missing role grants for production.jobs / costing.manage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. upsert_bom — bom.manage
--    Source: live capture (drifter; current_app_user)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_bom(p_header jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parent uuid := (p_header->>'parent_item_id')::uuid;
  v_from   date := coalesce((p_header->>'effective_from')::date, current_date);
  v_to     date := nullif(p_header->>'effective_to','')::date;
  v_bom    uuid;
  v_line   jsonb;
  v_child  uuid; v_grp uuid; v_ln int := 0;
  v_actor  uuid := current_app_user();
begin
  if not has_permission('bom.manage') then raise exception 'upsert_bom: not authorized (bom.manage required)'; end if;
  if v_parent is null then raise exception 'upsert_bom: parent_item_id required'; end if;
  if not exists (select 1 from items where id = v_parent) then
    raise exception 'upsert_bom: unknown parent item %', v_parent;
  end if;
  if exists (
    select 1 from boms b
     where b.parent_item_id = v_parent and b.status = 'active'
       and daterange(b.effective_from, b.effective_to, '[)')
         && daterange(v_from, v_to, '[)')
  ) then
    raise exception 'upsert_bom: effective window overlaps an existing active BOM for item %', v_parent;
  end if;
  insert into boms (parent_item_id, stage, output_qty, effective_from, effective_to, notes, created_by)
  values (v_parent, coalesce((p_header->>'stage')::int, 1),
          coalesce((p_header->>'output_qty')::numeric, 1), v_from, v_to, p_header->>'notes', v_actor)
  returning id into v_bom;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_child := nullif(v_line->>'child_item_id','')::uuid;
    v_grp   := nullif(v_line->>'alternate_group_id','')::uuid;
    if v_child is null and v_grp is null then
      raise exception 'upsert_bom: each line needs child_item_id or alternate_group_id';
    end if;
    if v_child = v_parent then
      raise exception 'upsert_bom: BOM line cannot reference its own parent item (cycle)';
    end if;
    v_ln := v_ln + 1;
    insert into bom_lines (bom_id, child_item_id, alternate_group_id, quantity_per, scrap_percent, line_no)
      values (v_bom, v_child, v_grp, (v_line->>'quantity_per')::numeric,
              coalesce((v_line->>'scrap_percent')::numeric, 0), v_ln);
  end loop;
  if v_ln = 0 then raise exception 'upsert_bom: at least one line required'; end if;
  perform write_audit('insert','boms', v_bom::text,
            format('BOM for item %s (%s lines)', v_parent, v_ln),
            jsonb_build_object('parent_item_id', v_parent, 'effective_from', v_from), v_actor);
  return v_bom;
end $function$;

-- ---------------------------------------------------------------------
-- 2. post_production_run — production.run
--    Source: live capture (drifter; current_app_user). NO gate existed —
--    adding production.run. p_inputs has a DEFAULT → identity (jsonb, jsonb).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_production_run(p_header jsonb, p_inputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_out_item uuid := (p_header->>'output_item_id')::uuid;
  v_out_qty  numeric(14,3) := (p_header->>'output_qty')::numeric;
  v_date     date := coalesce((p_header->>'run_date')::date, current_date);
  v_branch   uuid;
  v_fy       uuid;
  v_stage    int  := coalesce((p_header->>'stage')::int, 1);
  v_abn      numeric(14,2) := coalesce((p_header->>'abnormal_wastage_value')::numeric, 0);
  v_run      uuid;
  v_no       text;
  v_type     item_type;
  v_inputs   jsonb := p_inputs;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_wac numeric(14,4); v_val numeric(14,2);
  v_intype   item_type;
  v_ln       int := 0;
  v_in_value numeric(14,2) := 0;
  v_out_cost numeric(14,4);
  v_out_val  numeric(14,2);
  v_residual numeric(14,2);
  v_actor    uuid := current_app_user();
begin
  if not has_permission('production.run') then raise exception 'post_production_run: not authorized (production.run required)'; end if;
  if v_out_item is null then raise exception 'post_production_run: output_item_id required'; end if;
  if v_out_qty is null or v_out_qty <= 0 then raise exception 'post_production_run: output_qty must be > 0'; end if;
  if v_abn < 0 then raise exception 'post_production_run: abnormal_wastage_value cannot be negative'; end if;
  select type into v_type from items where id = v_out_item;
  if v_type is null then raise exception 'post_production_run: unknown output item %', v_out_item; end if;
  if v_type = 'service' then raise exception 'post_production_run: cannot produce a service item'; end if;
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid, (select id from branches where code='HO' limit 1));
  v_fy  := fy_for_date(v_date);
  v_no  := next_number('prun', v_date);
  insert into production_runs (run_no, fy_id, branch_id, run_date, stage,
                              output_item_id, output_qty, abnormal_wastage_value, notes, created_by)
  values (v_no, v_fy, v_branch, v_date, v_stage, v_out_item, v_out_qty, v_abn, p_header->>'notes', v_actor)
  returning id into v_run;
  if jsonb_typeof(v_inputs) <> 'array' or jsonb_array_length(v_inputs) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', child_item_id, 'qty', gross_qty)), '[]'::jsonb)
      into v_inputs from explode_bom(v_out_item, v_out_qty, v_date);
    if jsonb_array_length(v_inputs) = 0 then
      raise exception 'post_production_run: no inputs given and no active BOM for %', v_out_item;
    end if;
  end if;
  for v_line in select * from jsonb_array_elements(v_inputs) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_production_run: input qty must be > 0'; end if;
    select type into v_intype from items where id = v_item;
    if v_intype is null then raise exception 'post_production_run: unknown input item %', v_item; end if;
    if v_intype = 'service' then raise exception 'post_production_run: input % is a service (not stocked)', v_item; end if;
    select avg_cost into v_wac from stock where item_id = v_item and branch_id = v_branch;
    v_wac := coalesce(v_wac, 0);
    perform post_stock_move(v_item, v_branch, 'production_out', -v_qty, v_wac, '1225', 'production', v_run, v_date);
    v_val := round(v_qty * v_wac, 2);
    v_ln  := v_ln + 1;
    insert into production_run_inputs (run_id, item_id, qty, unit_cost, value, line_no)
      values (v_run, v_item, v_qty, v_wac, v_val, v_ln);
    v_in_value := v_in_value + v_val;
  end loop;
  if v_ln = 0 then raise exception 'post_production_run: at least one input required'; end if;
  if v_abn > v_in_value then
    raise exception 'post_production_run: abnormal wastage % exceeds input value %', v_abn, v_in_value;
  end if;
  if v_abn > 0 then
    perform post_journal(
      jsonb_build_object('entry_date', v_date, 'source','production', 'source_id', v_run::text,
                         'narration','Abnormal wastage '||v_no),
      jsonb_build_array(
        jsonb_build_object('account_code','5170','debit', v_abn,'credit',0),
        jsonb_build_object('account_code','1225','debit',0,'credit', v_abn)));
  end if;
  v_out_cost := round((v_in_value - v_abn) / v_out_qty, 4);
  perform post_stock_move(v_out_item, v_branch, 'production_in', v_out_qty, v_out_cost, '1225', 'production', v_run, v_date);
  v_out_val := round(v_out_qty * v_out_cost, 2);
  select coalesce(sum(l.debit - l.credit),0) into v_residual
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '1225' and e.source = 'production' and e.source_id = v_run;
  if v_residual <> 0 then
    if v_residual > 0 then
      perform post_journal(
        jsonb_build_object('entry_date', v_date, 'source','production', 'source_id', v_run::text,
                           'narration','Rounding true-up '||v_no),
        jsonb_build_array(
          jsonb_build_object('account_code','5170','debit', v_residual,'credit',0),
          jsonb_build_object('account_code','1225','debit',0,'credit', v_residual)));
    else
      perform post_journal(
        jsonb_build_object('entry_date', v_date, 'source','production', 'source_id', v_run::text,
                           'narration','Rounding true-up '||v_no),
        jsonb_build_array(
          jsonb_build_object('account_code','1225','debit', abs(v_residual),'credit',0),
          jsonb_build_object('account_code','5170','debit',0,'credit', abs(v_residual))));
    end if;
  end if;
  update production_runs set output_unit_cost = v_out_cost, input_value = v_in_value, journal_run_id = v_run
    where id = v_run;
  perform write_audit('post','production_runs', v_run::text,
            format('Run %s: %s units of %s at %s/unit (inputs %s, abnormal %s)',
                   v_no, v_out_qty, v_out_item, v_out_cost, v_in_value, v_abn),
            jsonb_build_object('run_no', v_no, 'output_qty', v_out_qty,
                               'output_unit_cost', v_out_cost, 'input_value', v_in_value), v_actor);
  return v_run;
end $function$;

-- ---------------------------------------------------------------------
-- 3. upsert_job_card — production.jobs (REPLACES production.run)
--    Source: repo 0090 verbatim (matches live)
-- ---------------------------------------------------------------------
create or replace function upsert_job_card(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid := (p_card->>'id')::uuid;
  v_date        date := (p_card->>'card_date')::date;
  v_stage       int  := (p_card->>'stage')::int;
  v_item        uuid := (p_card->>'output_item_id')::uuid;
  v_qty         numeric(14,3) := (p_card->>'target_qty')::numeric;
  v_fy          uuid;
  v_no          text;
  v_actor       uuid := current_app_user();
  v_item_type   item_type;
begin
  if not has_permission('production.jobs') then
    raise exception 'upsert_job_card: not authorized (production.jobs required)';
  end if;
  if v_date is null then raise exception 'upsert_job_card: card_date required'; end if;
  if v_stage not in (1,2) then raise exception 'upsert_job_card: stage must be 1 or 2'; end if;
  if v_item is null then raise exception 'upsert_job_card: output_item_id required'; end if;
  if v_qty is null or v_qty <= 0 then raise exception 'upsert_job_card: target_qty must be > 0'; end if;

  select type into v_item_type from items where id = v_item;
  if v_item_type is null then raise exception 'upsert_job_card: unknown item'; end if;
  if v_item_type = 'service' then raise exception 'upsert_job_card: cannot plan production of a service'; end if;

  v_fy := fy_for_date(v_date);

  if v_id is null then
    v_no := next_number('job', v_date);
    insert into production_job_cards (job_no, fy_id, branch_id, card_date, stage,
                                      output_item_id, target_qty, device_id, assigned_to,
                                      planned_start_at, planned_end_at, instructions, created_by)
    values (v_no, v_fy, coalesce(nullif(p_card->>'branch_id','')::uuid,
                                 (select id from branches where code='HO' limit 1)),
            v_date, v_stage, v_item, v_qty,
            nullif(p_card->>'device_id','')::uuid,
            nullif(p_card->>'assigned_to','')::uuid,
            nullif(p_card->>'planned_start_at','')::timestamptz,
            nullif(p_card->>'planned_end_at','')::timestamptz,
            p_card->>'instructions', v_actor)
    returning id into v_id;
    perform write_audit('insert','production_job_cards', v_id::text,
              format('Job %s: %s units of %s (stage %s) on %s', v_no, v_qty, v_item, v_stage, v_date),
              jsonb_build_object('job_no', v_no, 'card_date', v_date, 'stage', v_stage), v_actor);
  else
    update production_job_cards
       set card_date        = v_date,
           stage            = v_stage,
           output_item_id   = v_item,
           target_qty       = v_qty,
           device_id        = nullif(p_card->>'device_id','')::uuid,
           assigned_to      = nullif(p_card->>'assigned_to','')::uuid,
           planned_start_at = nullif(p_card->>'planned_start_at','')::timestamptz,
           planned_end_at   = nullif(p_card->>'planned_end_at','')::timestamptz,
           instructions     = p_card->>'instructions',
           updated_at       = now()
     where id = v_id;
    if not found then raise exception 'upsert_job_card: card % not found', v_id; end if;
    perform write_audit('update','production_job_cards', v_id::text,
              format('Updated job %s', v_id), jsonb_build_object('card_date', v_date), v_actor);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. set_job_card_status — production.jobs (REPLACES production.run)
--    Source: repo 0090 verbatim (matches live)
-- ---------------------------------------------------------------------
create or replace function set_job_card_status(p_id uuid, p_status text, p_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status job_card_status;
  v_has_run uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('production.jobs') then
    raise exception 'set_job_card_status: not authorized (production.jobs required)';
  end if;
  begin
    v_status := p_status::job_card_status;
  exception when invalid_text_representation then
    raise exception 'set_job_card_status: invalid status %', p_status;
  end;

  select run_id into v_has_run from production_job_cards where id = p_id;
  if v_has_run is null then
    raise exception 'set_job_card_status: card % not found', p_id;
  end if;

  if v_status = 'completed' then
    if p_run_id is null then
      raise exception 'set_job_card_status: a run must be posted before completing a job';
    end if;
    if v_has_run is not null then
      raise exception 'set_job_card_status: card already completed by run %', v_has_run;
    end if;
    update production_job_cards
       set status = 'completed', run_id = p_run_id, updated_at = now()
     where id = p_id;
  else
    update production_job_cards
       set status = v_status, updated_at = now()
     where id = p_id;
  end if;

  perform write_audit('update','production_job_cards', p_id::text,
            format('Job card status -> %s', v_status),
            jsonb_build_object('run_id', p_run_id), v_actor);
end $$;

-- ---------------------------------------------------------------------
-- 5. reverse_production_run — production.reverse (REPLACES production.run;
--    manager-only reversal — controller decision)
--    Source: repo 0090 verbatim (matches live)
-- ---------------------------------------------------------------------
create or replace function reverse_production_run(p_run_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   production_runs%rowtype;
  v_entry uuid;
  v_new   uuid;
  v_fy    uuid;
  v_actor uuid := current_app_user();
begin
  select * into v_run from production_runs where id = p_run_id;
  if not found then raise exception 'reverse_production_run: run % not found', p_run_id; end if;
  if v_run.status = 'reversed' then raise exception 'reverse_production_run: run % already reversed', v_run.run_no; end if;
  if v_run.status <> 'posted' then raise exception 'reverse_production_run: run % is not posted', v_run.run_no; end if;
  if not has_permission('production.reverse') then
    raise exception 'reverse_production_run: not authorized (production.reverse required)';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reverse_production_run: reversal reason required';
  end if;

  v_fy := fy_for_date(current_date);
  if v_run.fy_id <> v_fy then
    raise exception 'reverse_production_run: cannot reverse run % from a prior financial year', v_run.run_no;
  end if;

  for v_entry in
    select id from journal_entries
     where source = 'production' and source_id = p_run_id::text
       and status = 'posted'
  loop
    v_new := reverse_journal(v_entry, p_reason);
  end loop;

  update production_runs set status = 'reversed' where id = p_run_id;
  perform write_audit('reverse','production_runs', p_run_id::text,
            format('Reversed run %s: %s', v_run.run_no, p_reason),
            jsonb_build_object('run_no', v_run.run_no, 'reason', p_reason), v_actor);
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 6. run_process_costing — costing.manage
--    Source: live capture (drifter; current_app_user). NO gate existed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_process_costing(p_month date, p_stage integer DEFAULT 1, p_finalize boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d_from date; d_to date;
  v_status text := case when p_finalize then 'final' else 'draft' end;
  v_run uuid;
  v_units      numeric(14,3);
  v_mat_cost   numeric(14,2);
  v_conv_cost  numeric(14,2);
  v_pool_cost  numeric(14,2);
  v_ti_cost    numeric(14,2) := 0;
  v_ti_per     numeric(14,4);
  v_cogm_total numeric(14,2);
  v_cogm_per   numeric(14,4);
  v_untagged   int;
  v_actor      uuid := current_app_user();
  r            record;
begin
  if not has_permission('costing.manage') then raise exception 'run_process_costing: not authorized (costing.manage required)'; end if;
  select b.d_from, b.d_to into d_from, d_to from month_bounds(p_month) b;
  if p_finalize then
    select count(*) into v_untagged from costing_untagged_accounts(p_month);
    if v_untagged > 0 then
      raise exception 'run_process_costing: % untagged cost account(s) block a final run for %', v_untagged, p_month;
    end if;
  end if;
  select coalesce(sum(output_qty),0) into v_units
    from production_runs
   where status='posted' and stage=p_stage and run_date >= d_from and run_date < d_to;
  if v_units = 0 then
    raise exception 'run_process_costing: zero production for stage % in % (skip run)', p_stage, p_month;
  end if;
  select coalesce(sum(pi.value),0) into v_mat_cost
    from production_run_inputs pi
    join production_runs pr on pr.id = pi.run_id
   where pr.status='posted' and pr.stage=p_stage and pr.run_date >= d_from and pr.run_date < d_to;
  select coalesce(sum(l.debit - l.credit),0) into v_conv_cost
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join cost_accounts_tag t on t.account_id = l.account_id
   where e.status='posted' and e.entry_date >= d_from and e.entry_date < d_to
     and t.class in ('direct_labour','mfg_overhead');
  select coalesce(sum(amount),0) into v_pool_cost
    from overhead_pools
   where period_month = d_from and (stage = 'shared'
         or stage = case p_stage when 1 then 'blowing' when 2 then 'filling' else 'shared' end);
  v_conv_cost := v_conv_cost + v_pool_cost;
  if p_stage = 2 then
    select coalesce(sum(pi.value),0) into v_ti_cost
      from production_run_inputs pi
      join production_runs pr on pr.id = pi.run_id
      join items i on i.id = pi.item_id
     where pr.status='posted' and pr.stage=2
       and pr.run_date >= d_from and pr.run_date < d_to and i.type = 'wip';
    v_mat_cost := v_mat_cost - v_ti_cost;
    v_ti_per   := round(v_ti_cost / v_units, 4);
  end if;
  v_cogm_total := v_mat_cost + v_conv_cost + v_ti_cost;
  v_cogm_per   := round(v_cogm_total / v_units, 4);
  delete from costing_runs where period_month = d_from and stage = p_stage and status = v_status;
  insert into costing_runs (period_month, stage, status, units_completed, wip_units,
                            mat_equiv_units, conv_equiv_units, cost_mat_per_eu, cost_conv_per_eu,
                            transferred_in_per_unit, cogm_per_unit, computed_by)
  values (d_from, p_stage, v_status, v_units, 0, v_units, v_units,
          round(v_mat_cost/v_units,4), round(v_conv_cost/v_units,4), v_ti_per, v_cogm_per, v_actor)
  returning id into v_run;
  for r in
    select output_item_id, sum(output_qty) as units
      from production_runs
     where status='posted' and stage=p_stage and run_date >= d_from and run_date < d_to
     group by output_item_id
  loop
    insert into costing_run_lines (run_id, item_id, units, cost_mat, cost_conv, transferred_in, cogm_total, cogm_per_unit)
    values (v_run, r.output_item_id, r.units,
            round(v_mat_cost  * r.units/v_units, 2),
            round(v_conv_cost * r.units/v_units, 2),
            round(v_ti_cost   * r.units/v_units, 2),
            round(v_cogm_total* r.units/v_units, 2), v_cogm_per);
    insert into product_cost_snapshots (item_id, period_month, cogm_per_case, loaded_per_case, source_run_id, updated_at)
    values (r.output_item_id, d_from, v_cogm_per, v_cogm_per, v_run, now())
    on conflict (item_id, period_month) do update
      set cogm_per_case = excluded.cogm_per_case, source_run_id = excluded.source_run_id, updated_at = now();
  end loop;
  perform write_audit('post','costing_runs', v_run::text,
            format('Costing %s stage %s (%s): %s units, COGM %s/unit', p_month, p_stage, v_status, v_units, v_cogm_per),
            jsonb_build_object('period_month', d_from, 'stage', p_stage, 'cogm_per_unit', v_cogm_per), v_actor);
  return v_run;
end $function$;

-- ---------------------------------------------------------------------
-- 7. compute_loaded_cost — costing.manage
--    Source: live capture (drifter; current_app_user). NO gate existed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_loaded_cost(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d_from date; d_to date;
  v_period_cost numeric(14,2);
  v_total_cases numeric(14,3);
  v_per_case    numeric(14,4);
  v_actor uuid := current_app_user();
begin
  if not has_permission('costing.manage') then raise exception 'compute_loaded_cost: not authorized (costing.manage required)'; end if;
  select b.d_from, b.d_to into d_from, d_to from month_bounds(p_month) b;
  select coalesce(sum(l.debit - l.credit),0) into v_period_cost
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join cost_accounts_tag t on t.account_id = l.account_id
   where e.status='posted' and e.entry_date >= d_from and e.entry_date < d_to
     and t.class in ('period_admin','period_selling','period_finance');
  select coalesce(sum(pr.output_qty),0) into v_total_cases
    from production_runs pr join items i on i.id = pr.output_item_id
   where pr.status='posted' and i.type='finished_good'
     and pr.run_date >= d_from and pr.run_date < d_to;
  if v_total_cases = 0 then return; end if;
  v_per_case := round(v_period_cost / v_total_cases, 4);
  update product_cost_snapshots s
     set loaded_per_case = s.cogm_per_case + v_per_case, updated_at = now()
   where s.period_month = d_from
     and exists (select 1 from items i where i.id = s.item_id and i.type='finished_good');
  perform write_audit('post','product_cost_snapshots', d_from::text,
            format('Loaded cost %s: period pool %s over %s cases = %s/case', p_month, v_period_cost, v_total_cases, v_per_case),
            jsonb_build_object('period_pool', v_period_cost, 'per_case', v_per_case), v_actor);
end $function$;

-- ---------------------------------------------------------------------
-- 8. set_cost_account_class — costing.manage
--    Source: live capture (drifter; current_app_user). NO gate existed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_cost_account_class(p_code text, p_class costing_class)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_acct uuid; v_actor uuid := current_app_user();
begin
  if not has_permission('costing.manage') then raise exception 'set_cost_account_class: not authorized (costing.manage required)'; end if;
  select id into v_acct from chart_of_accounts where code = p_code;
  if v_acct is null then raise exception 'set_cost_account_class: unknown account %', p_code; end if;
  insert into cost_accounts_tag (account_id, class, updated_by) values (v_acct, p_class, v_actor)
  on conflict (account_id) do update set class = excluded.class, updated_at = now(), updated_by = excluded.updated_by;
  perform write_audit('update','cost_accounts_tag', v_acct::text,
            format('Account %s classified %s', p_code, p_class), null, v_actor);
end $function$;

-- =====================================================================
-- 9. Costing read RLS rewires — report.view_all → report.costing
-- =====================================================================
drop policy if exists read_cost on public.cost_accounts_tag;
create policy read_cost on public.cost_accounts_tag
  for select to authenticated using (has_permission('report.costing'));

drop policy if exists read_cost on public.overhead_pools;
create policy read_cost on public.overhead_pools
  for select to authenticated using (has_permission('report.costing'));

drop policy if exists read_cost on public.costing_runs;
create policy read_cost on public.costing_runs
  for select to authenticated using (has_permission('report.costing'));

drop policy if exists read_cost on public.costing_run_lines;
create policy read_cost on public.costing_run_lines
  for select to authenticated using (has_permission('report.costing'));

drop policy if exists read_cost on public.product_cost_snapshots;
create policy read_cost on public.product_cost_snapshots
  for select to authenticated using (has_permission('report.costing'));

-- manage_pools on overhead_pools (config.edit) and portal_deny_all left alone.

-- =====================================================================
-- 10. Close the role-grant gap (superset-only, additive, idempotent)
--     production.jobs + costing.manage → manager; production.jobs → operator.
-- =====================================================================
do $$
declare v uuid;
begin
  select id into v from public.roles where code = 'manager';
  if v is not null then
    insert into public.role_permissions (role_id, permission, scope) values
      (v, 'production.jobs','all'), (v, 'costing.manage','all')
    on conflict on constraint role_permissions_pkey do nothing;
  end if;
  select id into v from public.roles where code = 'operator';
  if v is not null then
    insert into public.role_permissions (role_id, permission, scope) values
      (v, 'production.jobs','all')
    on conflict on constraint role_permissions_pkey do nothing;
  end if;
end $$;

-- =====================================================================
-- 11. Revoke/grant — authenticated only, exactly once per function
-- =====================================================================
revoke all on function upsert_bom(jsonb, jsonb) from public, anon;
grant execute on function upsert_bom(jsonb, jsonb) to authenticated;

revoke all on function post_production_run(jsonb, jsonb) from public, anon;
grant execute on function post_production_run(jsonb, jsonb) to authenticated;

revoke all on function upsert_job_card(jsonb) from public, anon;
grant execute on function upsert_job_card(jsonb) to authenticated;

revoke all on function set_job_card_status(uuid, text, uuid) from public, anon;
grant execute on function set_job_card_status(uuid, text, uuid) to authenticated;

revoke all on function reverse_production_run(uuid, text) from public, anon;
grant execute on function reverse_production_run(uuid, text) to authenticated;

revoke all on function run_process_costing(date, integer, boolean) from public, anon;
grant execute on function run_process_costing(date, integer, boolean) to authenticated;

revoke all on function compute_loaded_cost(date) from public, anon;
grant execute on function compute_loaded_cost(date) to authenticated;

revoke all on function set_cost_account_class(text, costing_class) from public, anon;
grant execute on function set_cost_account_class(text, costing_class) to authenticated;
-- =====================================================================
-- 0018_production.sql  ·  Phase 3 — atomic production run (§6.4, §6.5)
--
-- The single atomic transaction that turns inputs into output, moving STOCK,
-- weighted-average VALUE, and JOURNALS together or not at all (Invariants 1-4).
--
-- Costing model (weighted-average, mirrors the GRNI three-way pattern):
--   * Consume each input at its current WAC:
--         post_stock_move('production_out', -qty, contra=1225)
--         => Dr 1225 Production Clearing / Cr inventory(RM/WIP)     (value OUT)
--   * Abnormal wastage (a loss, NOT capitalised into good units):
--         Dr 5170 Mfg Wastage / Cr 1225                             (value OUT of pot)
--   * Produce the good units at the DERIVED unit cost so the remaining pot is
--     absorbed exactly into output (normal loss is thereby absorbed by good units):
--         derived_cost = (Σ consumed value − abnormal) / good_units
--         post_stock_move('production_in', +good_units, derived_cost, contra=1225)
--         => Dr inventory(WIP/FG) / Cr 1225                         (value IN)
--   * A residual of a few paise from rounding is trued up against 5170 so that
--     1225 nets to EXACTLY zero for the run (Invariant 1 self-proves).
--
-- Two-stage manufacture = two runs: Stage-1 produces the empty-bottle WIP item;
-- Stage-2 consumes that WIP + caps/labels/water and produces the filled-case FG.
-- Stage-1 output cost becomes Stage-2 "transferred-in" via the WIP item's WAC.
-- =====================================================================

-- --- Manufacturing wastage (abnormal loss) --------------------------------
insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system)
values ('5170','Manufacturing Wastage','expense','debit', true, null, true)
on conflict (code) do nothing;
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p where p.code = '5000' and c.code = '5170' and c.parent_id is null;

-- --- Production clearing (WIP-clearing; nets to zero per run) --------------
insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system)
values ('1225','Production Clearing','asset','debit', true, null, true)
on conflict (code) do nothing;
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p where p.code = '1200' and c.code = '1225' and c.parent_id is null;

create type production_status as enum ('posted','reversed');

-- ---------------------------------------------------------------------
-- production_runs  (the EOD/production event header)
-- ---------------------------------------------------------------------
create table production_runs (
  id               uuid primary key default gen_random_uuid(),
  run_no           text not null,
  fy_id            uuid not null references financial_years(id),
  branch_id        uuid not null references branches(id),
  run_date         date not null default current_date,
  stage            int  not null default 1,             -- 1 blowing, 2 filling (informational)
  output_item_id   uuid not null references items(id),
  output_qty       numeric(14,3) not null check (output_qty > 0),   -- GOOD units produced
  output_unit_cost numeric(14,4) not null default 0,    -- derived WA cost/unit of output
  input_value      numeric(14,2) not null default 0,    -- Σ consumed value (WAC)
  abnormal_wastage_value numeric(14,2) not null default 0,
  journal_run_id   uuid,                                 -- shared source_id across the run's entries
  status           production_status not null default 'posted',
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (fy_id, run_no)
);
create index production_runs_output_idx on production_runs (output_item_id, run_date);

create table production_run_inputs (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references production_runs(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),   -- consumed (base units)
  unit_cost    numeric(14,4) not null,                   -- WAC at consumption
  value        numeric(14,2) not null,                   -- qty * unit_cost
  line_no      int not null default 1
);
create index production_run_inputs_run_idx on production_run_inputs (run_id);

-- ---------------------------------------------------------------------
-- post_production_run(header jsonb, inputs jsonb default '[]') -> run id
--   header : { output_item_id, output_qty, branch_id?, run_date?, stage?,
--              abnormal_wastage_value?, notes? }
--   inputs : [ { item_id, qty }, ... ]   (base units; WAC applied on issue)
--            If omitted/empty, the active BOM (0017) is exploded for output_qty.
--
-- One transaction. Output item must be stocked (wip / finished_good).
-- ---------------------------------------------------------------------
create or replace function post_production_run(p_header jsonb, p_inputs jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_out_item is null then raise exception 'post_production_run: output_item_id required'; end if;
  if v_out_qty is null or v_out_qty <= 0 then raise exception 'post_production_run: output_qty must be > 0'; end if;
  if v_abn < 0 then raise exception 'post_production_run: abnormal_wastage_value cannot be negative'; end if;

  select type into v_type from items where id = v_out_item;
  if v_type is null then raise exception 'post_production_run: unknown output item %', v_out_item; end if;
  if v_type = 'service' then raise exception 'post_production_run: cannot produce a service item'; end if;

  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_fy  := fy_for_date(v_date);
  v_no  := next_number('prun', v_date);

  insert into production_runs (run_no, fy_id, branch_id, run_date, stage,
                              output_item_id, output_qty, abnormal_wastage_value, notes, created_by)
  values (v_no, v_fy, v_branch, v_date, v_stage,
          v_out_item, v_out_qty, v_abn, p_header->>'notes', v_actor)
  returning id into v_run;

  -- if no explicit inputs, explode the active BOM for the requested output
  if jsonb_typeof(v_inputs) <> 'array' or jsonb_array_length(v_inputs) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object('item_id', child_item_id, 'qty', gross_qty)), '[]'::jsonb)
      into v_inputs
      from explode_bom(v_out_item, v_out_qty, v_date);
    if jsonb_array_length(v_inputs) = 0 then
      raise exception 'post_production_run: no inputs given and no active BOM for %', v_out_item;
    end if;
  end if;

  ------------------------------------------------------------- consume inputs
  -- each issue: Dr 1225 Production Clearing / Cr inventory(input) at WAC
  for v_line in select * from jsonb_array_elements(v_inputs) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_production_run: input qty must be > 0'; end if;
    select type into v_intype from items where id = v_item;
    if v_intype is null then raise exception 'post_production_run: unknown input item %', v_item; end if;
    if v_intype = 'service' then raise exception 'post_production_run: input % is a service (not stocked)', v_item; end if;

    -- current WAC (value the issue will use); post_stock_move ignores caller cost on issue
    select avg_cost into v_wac from stock where item_id = v_item and branch_id = v_branch;
    v_wac := coalesce(v_wac, 0);

    perform post_stock_move(v_item, v_branch, 'production_out', -v_qty, v_wac,
                            '1225', 'production', v_run, v_date);

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

  ------------------------------------------------------------- abnormal loss
  -- pull abnormal wastage out of the pot: Dr 5170 Mfg Wastage / Cr 1225
  if v_abn > 0 then
    perform post_journal(
      jsonb_build_object('entry_date', v_date, 'source','production', 'source_id', v_run::text,
                         'narration','Abnormal wastage '||v_no),
      jsonb_build_array(
        jsonb_build_object('account_code','5170','debit', v_abn,'credit',0),
        jsonb_build_object('account_code','1225','debit',0,'credit', v_abn)));
  end if;

  ------------------------------------------------------------- produce output
  -- derived cost absorbs the remaining pot into the good units (normal loss included)
  v_out_cost := round((v_in_value - v_abn) / v_out_qty, 4);
  perform post_stock_move(v_out_item, v_branch, 'production_in', v_out_qty, v_out_cost,
                          '1225', 'production', v_run, v_date);
  v_out_val := round(v_out_qty * v_out_cost, 2);

  ------------------------------------------------------- true-up rounding paise
  -- clearing must net EXACTLY to zero for the run: residual = debit - credit on 1225
  select coalesce(sum(l.debit - l.credit),0) into v_residual
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '1225' and e.source = 'production' and e.source_id = v_run;

  if v_residual <> 0 then
    -- residual sits as a debit balance in clearing; clear it to wastage expense
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

  update production_runs set
      output_unit_cost = v_out_cost, input_value = v_in_value, journal_run_id = v_run
    where id = v_run;

  perform write_audit('post','production_runs', v_run::text,
            format('Run %s: %s units of %s at %s/unit (inputs %s, abnormal %s)',
                   v_no, v_out_qty, v_out_item, v_out_cost, v_in_value, v_abn),
            jsonb_build_object('run_no', v_no, 'output_qty', v_out_qty,
                               'output_unit_cost', v_out_cost, 'input_value', v_in_value), v_actor);
  return v_run;
end $$;
comment on function post_production_run is
  'Atomic production: consume inputs at WAC, absorb into good units, expense abnormal wastage; clearing 1225 nets to 0.';

-- ---------------------------------------------------------------------
-- RLS: reads open to authenticated; run header + inputs have NO write policy
-- — only post_production_run (definer) writes them (the value event).
-- ---------------------------------------------------------------------
alter table production_runs       enable row level security;
alter table production_run_inputs enable row level security;
create policy read_all_auth on production_runs       for select to authenticated using (true);
create policy read_all_auth on production_run_inputs for select to authenticated using (true);

-- =====================================================================
-- 0019_process_costing.sql  ·  Phase 3 — cost to make (COGM + fully-loaded) §6.8
--
-- Weighted-average PROCESS costing. This module is VALUATION / REPORTING: it
-- reads the ledger (journal_lines) + production runs (0018) and writes
-- read-model snapshots. It posts NO sales journals (Invariant 5 spirit:
-- costing_runs + product_cost_snapshots are rebuildable read-models).
--
-- Foundation = the product-vs-period classification: every cost account carries
-- a costing_class. direct_material/direct_labour/mfg_overhead flow into COGM;
-- period_admin/period_selling/period_finance flow only into fully-loaded;
-- not_expense (loan principal) never appears in any cost figure.
-- =====================================================================

create type costing_class as enum (
  'direct_material','direct_labour','mfg_overhead',
  'period_admin','period_selling','period_finance','not_expense');

-- ---------------------------------------------------------------------
-- cost_accounts_tag — one row per chart account that participates in costing
-- ---------------------------------------------------------------------
create table cost_accounts_tag (
  account_id uuid primary key references chart_of_accounts(id),
  class      costing_class not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);
comment on table cost_accounts_tag is 'Classifies each cost account for COGM vs period (fully-loaded). Untagged cost account blocks a final run.';

-- ---------------------------------------------------------------------
-- overhead_pools — accumulated (or estimated) indirect cost for a month/stage
-- ---------------------------------------------------------------------
create table overhead_pools (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  stage            text not null default 'shared',    -- blowing | filling | shared
  period_month     date not null,                     -- first-of-month
  amount           numeric(14,2) not null default 0,
  source           text not null default 'estimated', -- estimated | actual
  allocation_driver text not null default 'cases',    -- machine_hours | cases | labour_hours
  created_at       timestamptz not null default now(),
  created_by       uuid references users(id),
  unique (name, period_month, stage)
);
create index overhead_pools_period_idx on overhead_pools (period_month, stage);

-- ---------------------------------------------------------------------
-- costing_runs — one execution of the five-step method for a month+stage
-- ---------------------------------------------------------------------
create table costing_runs (
  id                  uuid primary key default gen_random_uuid(),
  period_month        date not null,
  stage               int  not null default 1,
  status              text not null default 'draft',  -- draft | final
  units_completed     numeric(14,3) not null default 0,
  wip_units           numeric(14,3) not null default 0,
  mat_equiv_units     numeric(14,3) not null default 0,
  conv_equiv_units    numeric(14,3) not null default 0,
  cost_mat_per_eu     numeric(14,4) not null default 0,
  cost_conv_per_eu    numeric(14,4) not null default 0,
  transferred_in_per_unit numeric(14,4),
  cogm_per_unit       numeric(14,4) not null default 0,
  computed_at         timestamptz not null default now(),
  computed_by         uuid references users(id),
  unique (period_month, stage, status) deferrable initially deferred
);

create table costing_run_lines (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references costing_runs(id) on delete cascade,
  item_id        uuid not null references items(id),
  units          numeric(14,3) not null default 0,
  cost_mat       numeric(14,2) not null default 0,
  cost_conv      numeric(14,2) not null default 0,
  transferred_in numeric(14,2) not null default 0,
  cogm_total     numeric(14,2) not null default 0,
  cogm_per_unit  numeric(14,4) not null default 0
);
create index costing_run_lines_run_idx on costing_run_lines (run_id);

-- ---------------------------------------------------------------------
-- product_cost_snapshots — the read-model the UI/margin views consume
-- ---------------------------------------------------------------------
create table product_cost_snapshots (
  item_id        uuid not null references items(id),
  period_month   date not null,
  cogm_per_case  numeric(14,4) not null default 0,
  loaded_per_case numeric(14,4) not null default 0,
  source_run_id  uuid references costing_runs(id),
  updated_at     timestamptz not null default now(),
  primary key (item_id, period_month)
);

-- ---------------------------------------------------------------------
-- month_bounds(period_month) -> (first_day, next_month_first_day)
-- ---------------------------------------------------------------------
create or replace function month_bounds(p_month date, out d_from date, out d_to date)
language sql immutable
set search_path = public
as $$ select date_trunc('month', p_month)::date,
             (date_trunc('month', p_month) + interval '1 month')::date; $$;

-- ---------------------------------------------------------------------
-- costing_untagged_accounts(period_month) -> table of cost accounts that were
-- used in the month but are not yet classified. A final run is blocked while
-- any exist (§6.8 edge case).
-- ---------------------------------------------------------------------
create or replace function costing_untagged_accounts(p_month date)
returns table (code text, name text)
language plpgsql stable
set search_path = public
as $$
declare d_from date; d_to date;
begin
  select b.d_from, b.d_to into d_from, d_to from month_bounds(p_month) b;
  return query
  select a.code, a.name
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join chart_of_accounts a on a.id = l.account_id
   where e.status = 'posted' and e.entry_date >= d_from and e.entry_date < d_to
     and a.type = 'expense' and a.is_postable
     and not exists (select 1 from cost_accounts_tag t where t.account_id = a.id)
   group by a.code, a.name
   order by a.code;
end $$;

-- ---------------------------------------------------------------------
-- run_process_costing(period_month, stage, finalize) -> costing_runs.id
-- Weighted-average five-step method as ONE transaction. v1 simplification
-- (documented): all output produced in the month is treated as COMPLETED (no
-- open WIP carried in the costing run — the physical WIP item itself carries its
-- own WAC via 0018, and closing WIP units net small for a continuous line).
-- Materials cost = Σ production_run_inputs value for the month's runs at this
-- stage; conversion cost = Σ posted direct_labour + mfg_overhead journal lines
-- for the month + any overhead_pools. Stage-2 adds Stage-1 transferred-in.
-- ---------------------------------------------------------------------
create or replace function run_process_costing(
  p_month date, p_stage int default 1, p_finalize boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
  v_actor      uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  r            record;
begin
  select b.d_from, b.d_to into d_from, d_to from month_bounds(p_month) b;

  -- classification gate for a final run
  if p_finalize then
    select count(*) into v_untagged from costing_untagged_accounts(p_month);
    if v_untagged > 0 then
      raise exception 'run_process_costing: % untagged cost account(s) block a final run for %', v_untagged, p_month;
    end if;
  end if;

  -- physical output completed this month at this stage
  select coalesce(sum(output_qty),0) into v_units
    from production_runs
   where status='posted' and stage=p_stage and run_date >= d_from and run_date < d_to;

  if v_units = 0 then
    raise exception 'run_process_costing: zero production for stage % in % (skip run)', p_stage, p_month;
  end if;

  -- direct materials consumed by this stage's runs (WAC actuals from 0018)
  select coalesce(sum(pi.value),0) into v_mat_cost
    from production_run_inputs pi
    join production_runs pr on pr.id = pi.run_id
   where pr.status='posted' and pr.stage=p_stage
     and pr.run_date >= d_from and pr.run_date < d_to;

  -- conversion cost: posted direct_labour + mfg_overhead expense lines this month
  select coalesce(sum(l.debit - l.credit),0) into v_conv_cost
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join cost_accounts_tag t on t.account_id = l.account_id
   where e.status='posted' and e.entry_date >= d_from and e.entry_date < d_to
     and t.class in ('direct_labour','mfg_overhead');

  -- plus any overhead pools booked for this month+stage (and 'shared')
  select coalesce(sum(amount),0) into v_pool_cost
    from overhead_pools
   where period_month = d_from and (stage = 'shared'
         or stage = case p_stage when 1 then 'blowing' when 2 then 'filling' else 'shared' end);
  v_conv_cost := v_conv_cost + v_pool_cost;

  -- Stage-2 transferred-in: value of Stage-1 WIP output consumed as an input
  if p_stage = 2 then
    select coalesce(sum(pi.value),0) into v_ti_cost
      from production_run_inputs pi
      join production_runs pr on pr.id = pi.run_id
      join items i on i.id = pi.item_id
     where pr.status='posted' and pr.stage=2
       and pr.run_date >= d_from and pr.run_date < d_to
       and i.type = 'wip';
    -- transferred-in is part of Stage-2 materials already (it is an input); keep the
    -- number for reporting but do not double count: subtract from mat then report separately.
    v_mat_cost := v_mat_cost - v_ti_cost;
    v_ti_per   := round(v_ti_cost / v_units, 4);
  end if;

  v_cogm_total := v_mat_cost + v_conv_cost + v_ti_cost;
  v_cogm_per   := round(v_cogm_total / v_units, 4);

  -- clear any prior run of the same period/stage/status, then insert fresh
  delete from costing_runs where period_month = d_from and stage = p_stage and status = v_status;

  insert into costing_runs (period_month, stage, status, units_completed, wip_units,
                            mat_equiv_units, conv_equiv_units, cost_mat_per_eu, cost_conv_per_eu,
                            transferred_in_per_unit, cogm_per_unit, computed_by)
  values (d_from, p_stage, v_status, v_units, 0, v_units, v_units,
          round(v_mat_cost/v_units,4), round(v_conv_cost/v_units,4),
          v_ti_per, v_cogm_per, v_actor)
  returning id into v_run;

  -- per-output-item lines (split the pool by each item's share of units)
  for r in
    select output_item_id, sum(output_qty) as units
      from production_runs
     where status='posted' and stage=p_stage and run_date >= d_from and run_date < d_to
     group by output_item_id
  loop
    insert into costing_run_lines (run_id, item_id, units, cost_mat, cost_conv, transferred_in,
                                   cogm_total, cogm_per_unit)
    values (v_run, r.output_item_id, r.units,
            round(v_mat_cost  * r.units/v_units, 2),
            round(v_conv_cost * r.units/v_units, 2),
            round(v_ti_cost   * r.units/v_units, 2),
            round(v_cogm_total* r.units/v_units, 2),
            v_cogm_per);

    -- refresh the snapshot read-model for this item/month
    insert into product_cost_snapshots (item_id, period_month, cogm_per_case, loaded_per_case, source_run_id, updated_at)
    values (r.output_item_id, d_from, v_cogm_per, v_cogm_per, v_run, now())
    on conflict (item_id, period_month) do update
      set cogm_per_case = excluded.cogm_per_case,
          source_run_id = excluded.source_run_id,
          updated_at    = now();
  end loop;

  perform write_audit('post','costing_runs', v_run::text,
            format('Costing %s stage %s (%s): %s units, COGM %s/unit', p_month, p_stage, v_status, v_units, v_cogm_per),
            jsonb_build_object('period_month', d_from, 'stage', p_stage, 'cogm_per_unit', v_cogm_per), v_actor);
  return v_run;
end $$;
comment on function run_process_costing is
  'Weighted-average process costing for a month+stage. Reads ledger + runs, writes read-model snapshots. Reporting only.';

-- ---------------------------------------------------------------------
-- compute_loaded_cost(period_month) — spread period_* pools over cases produced,
-- add to each item's COGM snapshot -> loaded_per_case. Excludes not_expense.
-- ---------------------------------------------------------------------
create or replace function compute_loaded_cost(p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d_from date; d_to date;
  v_period_cost numeric(14,2);
  v_total_cases numeric(14,3);
  v_per_case    numeric(14,4);
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select b.d_from, b.d_to into d_from, d_to from month_bounds(p_month) b;

  select coalesce(sum(l.debit - l.credit),0) into v_period_cost
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join cost_accounts_tag t on t.account_id = l.account_id
   where e.status='posted' and e.entry_date >= d_from and e.entry_date < d_to
     and t.class in ('period_admin','period_selling','period_finance');

  -- spread over finished-good cases produced this month (stage 2 output)
  select coalesce(sum(pr.output_qty),0) into v_total_cases
    from production_runs pr join items i on i.id = pr.output_item_id
   where pr.status='posted' and i.type='finished_good'
     and pr.run_date >= d_from and pr.run_date < d_to;

  if v_total_cases = 0 then
    return;  -- nothing to load onto; leave loaded = cogm
  end if;
  v_per_case := round(v_period_cost / v_total_cases, 4);

  update product_cost_snapshots s
     set loaded_per_case = s.cogm_per_case + v_per_case, updated_at = now()
   where s.period_month = d_from
     and exists (select 1 from items i where i.id = s.item_id and i.type='finished_good');

  perform write_audit('post','product_cost_snapshots', d_from::text,
            format('Loaded cost %s: period pool %s over %s cases = %s/case',
                   p_month, v_period_cost, v_total_cases, v_per_case),
            jsonb_build_object('period_pool', v_period_cost, 'per_case', v_per_case), v_actor);
end $$;

-- ---------------------------------------------------------------------
-- set_cost_account_class(account_code, class) — classify a cost account.
-- ---------------------------------------------------------------------
create or replace function set_cost_account_class(p_code text, p_class costing_class)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_acct uuid; v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select id into v_acct from chart_of_accounts where code = p_code;
  if v_acct is null then raise exception 'set_cost_account_class: unknown account %', p_code; end if;
  insert into cost_accounts_tag (account_id, class, updated_by)
    values (v_acct, p_class, v_actor)
  on conflict (account_id) do update set class = excluded.class, updated_at = now(), updated_by = excluded.updated_by;
  perform write_audit('update','cost_accounts_tag', v_acct::text,
            format('Account %s classified %s', p_code, p_class), null, v_actor);
end $$;

-- ---------------------------------------------------------------------
-- Seed the standard classification (§6.8 table). Idempotent via the RPC's upsert.
-- ---------------------------------------------------------------------
do $$
begin
  perform set_cost_account_class('5110','direct_material');  -- Material Consumed
  perform set_cost_account_class('5120','direct_labour');    -- Direct Labour
  perform set_cost_account_class('5130','mfg_overhead');     -- Factory Power & Fuel
  perform set_cost_account_class('5140','mfg_overhead');     -- Factory Rent
  perform set_cost_account_class('5150','mfg_overhead');     -- Depreciation - Plant
  perform set_cost_account_class('5160','mfg_overhead');     -- Manufacturing Overhead
  perform set_cost_account_class('5170','mfg_overhead');     -- Manufacturing Wastage
  perform set_cost_account_class('5100','direct_material');  -- COGS (product cost proxy)
  perform set_cost_account_class('5500','period_admin');     -- Salaries - Admin
  perform set_cost_account_class('5510','period_admin');     -- Office Rent
  perform set_cost_account_class('5520','period_admin');     -- Office Power & Utilities
  perform set_cost_account_class('5530','period_selling');   -- Selling & Distribution
  perform set_cost_account_class('5540','period_selling');   -- Vehicle Running
  perform set_cost_account_class('5600','period_finance');   -- Loan Interest
  perform set_cost_account_class('5610','period_finance');   -- Bank Charges
  perform set_cost_account_class('5700','period_admin');     -- Rounding Off
  -- loan principal (2510) is a liability, not a cost -> not tagged (never in any cost)
end $$;

-- ---------------------------------------------------------------------
-- permissions this module gates on (not in the Phase 0 catalogue yet).
-- report.view_all = see cost figures; config.edit = enter overhead pools.
-- Granted to manager + accountant; admin short-circuits has_permission().
-- ---------------------------------------------------------------------
insert into permissions (code, description) values
  ('report.view_all', 'View all reports incl. cost-to-make / margins'),
  ('config.edit',     'Edit configuration incl. overhead pools & drivers')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code in ('manager','accountant')
   and p.code in ('report.view_all','config.edit')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- RLS: costing is admin/manager/accountant only. Reads gated by report.view_all;
-- all write tables have NO write policy (definer RPCs only). Operators/agents
-- must not see cost (§6.8) — so no open read policy here (unlike other modules).
-- ---------------------------------------------------------------------
alter table cost_accounts_tag      enable row level security;
alter table overhead_pools         enable row level security;
alter table costing_runs           enable row level security;
alter table costing_run_lines      enable row level security;
alter table product_cost_snapshots enable row level security;

create policy read_cost on cost_accounts_tag      for select to authenticated using (has_permission('report.view_all'));
create policy read_cost on overhead_pools         for select to authenticated using (has_permission('report.view_all'));
create policy read_cost on costing_runs           for select to authenticated using (has_permission('report.view_all'));
create policy read_cost on costing_run_lines      for select to authenticated using (has_permission('report.view_all'));
create policy read_cost on product_cost_snapshots for select to authenticated using (has_permission('report.view_all'));

-- overhead pool entry is a manual master input (admin/accountant): allow with config.edit
create policy manage_pools on overhead_pools for all to authenticated
  using (has_permission('config.edit')) with check (has_permission('config.edit'));

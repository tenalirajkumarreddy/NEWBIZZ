-- 0046_assets_depreciation_loans.sql  (§5.7 Fixed Assets & Depreciation, §5.8 Loans & EMI)
--
-- Register capital assets and depreciate them (SLM or WDV) so P&L and the
-- Balance Sheet show gross block − accumulated depreciation. Model bank loans
-- with a reducing-balance EMI schedule; each EMI splits principal vs interest.
-- All money moves through post_journal (Inv 3/4); every mutating RPC is gated
-- on accounting.manage and writes the audit log.

-- ---------------------------------------------------------------------
-- New ledgers. Asset classes need their own gross-block accounts; disposal
-- needs a gain (income) and loss (expense) account; non-plant depreciation gets
-- its own expense line so plant vs office depreciation stay separable.
-- ---------------------------------------------------------------------
insert into chart_of_accounts (code, name, type, normal_side, is_postable, is_system, status, parent_id)
values
  ('1530','Buildings',              'asset',  'debit',  true, true, 'active', (select id from chart_of_accounts where code='1500')),
  ('1540','Furniture & Fixtures',   'asset',  'debit',  true, true, 'active', (select id from chart_of_accounts where code='1500')),
  ('1550','Computers',              'asset',  'debit',  true, true, 'active', (select id from chart_of_accounts where code='1500')),
  ('5155','Depreciation - Other',   'expense','debit',  true, true, 'active', (select id from chart_of_accounts where code='5000')),
  ('5185','Loss on Asset Disposal', 'expense','debit',  true, true, 'active', (select id from chart_of_accounts where code='5000')),
  ('4210','Gain on Asset Disposal', 'income', 'credit', true, true, 'active', (select id from chart_of_accounts where code='4000'))
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Enums (fresh CREATE TYPE — no same-txn restriction).
-- ---------------------------------------------------------------------
do $$ begin
  create type asset_class as enum ('plant_machinery','vehicle','building','furniture','computer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dep_method as enum ('slm','wdv');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_status as enum ('active','disposed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type loan_status as enum ('active','closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- fixed_assets. asset_account = gross-block ledger to debit at capitalization;
-- dep_expense_account/accum_dep_account drive the depreciation journal. WDV is
-- derived live from capitalized_value − Σ depreciation_lines (never stored).
-- ---------------------------------------------------------------------
create table if not exists fixed_assets (
  id                  uuid primary key default gen_random_uuid(),
  asset_no            text not null,
  fy_id               uuid not null references financial_years(id),
  name                text not null,
  asset_class         asset_class not null,
  purchase_date       date not null,
  capitalized_value   numeric(14,2) not null check (capitalized_value > 0),
  salvage_value       numeric(14,2) not null default 0 check (salvage_value >= 0),
  method              dep_method not null default 'slm',
  useful_life_years   int check (useful_life_years is null or useful_life_years > 0),
  dep_rate            numeric(6,3) check (dep_rate is null or dep_rate >= 0),   -- % per year (WDV)
  asset_account       text not null references chart_of_accounts(code),
  dep_expense_account text not null references chart_of_accounts(code),
  accum_dep_account   text not null default '1590' references chart_of_accounts(code),
  status              asset_status not null default 'active',
  disposed_on         date,
  disposal_journal_id uuid references journal_entries(id),
  capitalize_journal_id uuid references journal_entries(id),
  note                text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  unique (fy_id, asset_no),
  -- SLM needs a life; WDV needs a rate
  constraint fixed_assets_method_params check (
    (method = 'slm' and useful_life_years is not null) or
    (method = 'wdv' and dep_rate is not null)
  )
);
create index if not exists fixed_assets_status_idx on fixed_assets (status, purchase_date desc);

-- depreciation_runs: one per period; carries the posted journal for the batch.
create table if not exists depreciation_runs (
  id               uuid primary key default gen_random_uuid(),
  run_no           text not null,
  fy_id            uuid not null references financial_years(id),
  run_date         date not null,
  period_label     text,                              -- e.g. '2026-07' or 'FY26-27'
  journal_entry_id uuid references journal_entries(id),
  total_amount     numeric(14,2) not null default 0,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  unique (fy_id, run_no)
);

create table if not exists depreciation_lines (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references depreciation_runs(id) on delete cascade,
  asset_id   uuid not null references fixed_assets(id),
  amount     numeric(14,2) not null check (amount >= 0),
  wdv_before numeric(14,2) not null default 0,
  wdv_after  numeric(14,2) not null default 0
);
create index if not exists depreciation_lines_asset_idx on depreciation_lines (asset_id);
create index if not exists depreciation_lines_run_idx on depreciation_lines (run_id);

-- ---------------------------------------------------------------------
-- loans + amortization schedule. Reducing-balance EMI; each row splits
-- principal vs interest. paid flips as EMIs are paid.
-- ---------------------------------------------------------------------
create table if not exists loans (
  id               uuid primary key default gen_random_uuid(),
  loan_no          text not null,
  fy_id            uuid not null references financial_years(id),
  lender           text not null,
  principal        numeric(14,2) not null check (principal > 0),
  annual_rate      numeric(6,3) not null check (annual_rate >= 0),   -- % per annum
  start_date       date not null,
  tenure_months    int not null check (tenure_months > 0),
  emi_amount       numeric(14,2) not null check (emi_amount > 0),
  loan_account     text not null default '2510' references chart_of_accounts(code),
  interest_account text not null default '5600' references chart_of_accounts(code),
  status           loan_status not null default 'active',
  disburse_journal_id uuid references journal_entries(id),
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  unique (fy_id, loan_no)
);

create table if not exists loan_schedule (
  id                  uuid primary key default gen_random_uuid(),
  loan_id             uuid not null references loans(id) on delete cascade,
  installment_no      int not null,
  due_date            date not null,
  emi_amount          numeric(14,2) not null,
  principal_component numeric(14,2) not null,
  interest_component  numeric(14,2) not null,
  balance             numeric(14,2) not null,          -- outstanding principal after this EMI
  paid                boolean not null default false,
  paid_on             date,
  payment_journal_id  uuid references journal_entries(id),
  unique (loan_id, installment_no)
);
create index if not exists loan_schedule_due_idx on loan_schedule (loan_id, due_date);

-- number series for the new document types
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select d.doc_type, fy.id, d.prefix, 4, 1
from financial_years fy,
     (values ('fixed_asset','FA'), ('dep_run','DEP'), ('loan','LOAN')) as d(doc_type, prefix)
on conflict do nothing;

-- RLS: reads open to authenticated; writes only through the gated RPCs below.
alter table fixed_assets       enable row level security;
alter table depreciation_runs  enable row level security;
alter table depreciation_lines enable row level security;
alter table loans              enable row level security;
alter table loan_schedule      enable row level security;
do $$ begin
  create policy read_all_auth on fixed_assets       for select to authenticated using (true);
  create policy read_all_auth on depreciation_runs  for select to authenticated using (true);
  create policy read_all_auth on depreciation_lines for select to authenticated using (true);
  create policy read_all_auth on loans              for select to authenticated using (true);
  create policy read_all_auth on loan_schedule      for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- =====================================================================
-- Helper: live written-down value of an asset = capitalized − Σ depreciation.
-- =====================================================================
create or replace function asset_wdv(p_asset uuid)
returns numeric
language sql stable security definer set search_path to 'public'
as $$
  select fa.capitalized_value
       - coalesce((select sum(dl.amount) from depreciation_lines dl where dl.asset_id = p_asset), 0)
  from fixed_assets fa where fa.id = p_asset;
$$;

-- =====================================================================
-- create_fixed_asset(p_header) -> id
--   header: { name, asset_class, purchase_date, capitalized_value, salvage_value?,
--             method, useful_life_years?, dep_rate?, asset_account?,
--             dep_expense_account?, note?, capitalize? (bool), pay_account? }
-- If capitalize=true, posts Dr asset_account / Cr pay_account (default 1120 bank)
-- to bring the asset onto the books. Otherwise the asset is registered only
-- (assumed already on the books via a purchase/GRN).
-- =====================================================================
create or replace function create_fixed_asset(p_header jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_date  date := (p_header->>'purchase_date')::date;
  v_fy    uuid := fy_for_date(v_date);
  v_class asset_class := (p_header->>'asset_class')::asset_class;
  v_asset_acct text := coalesce(nullif(p_header->>'asset_account',''),
    case v_class
      when 'plant_machinery' then '1510'
      when 'vehicle' then '1520'
      when 'building' then '1530'
      when 'furniture' then '1540'
      when 'computer' then '1550'
    end);
  v_dep_acct text := coalesce(nullif(p_header->>'dep_expense_account',''),
    case when v_class = 'plant_machinery' then '5150' else '5155' end);
  v_no    text;
  v_cap   numeric(14,2) := (p_header->>'capitalized_value')::numeric;
  v_je    uuid;
  v_id    uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'create_fixed_asset: not authorized';
  end if;
  if v_date is null then raise exception 'create_fixed_asset: purchase_date required'; end if;

  v_no := next_number('fixed_asset', v_date);

  insert into fixed_assets
    (asset_no, fy_id, name, asset_class, purchase_date, capitalized_value, salvage_value,
     method, useful_life_years, dep_rate, asset_account, dep_expense_account, accum_dep_account,
     note, created_by)
  values
    (v_no, v_fy, p_header->>'name', v_class, v_date, v_cap,
     coalesce((p_header->>'salvage_value')::numeric, 0),
     (p_header->>'method')::dep_method,
     nullif(p_header->>'useful_life_years','')::int,
     nullif(p_header->>'dep_rate','')::numeric,
     v_asset_acct, v_dep_acct, '1590',
     nullif(p_header->>'note',''), v_actor)
  returning id into v_id;

  if coalesce((p_header->>'capitalize')::boolean, false) then
    v_je := post_journal(
      jsonb_build_object('entry_date', v_date, 'source', 'adjustment',
        'narration', format('Capitalize asset %s — %s', v_no, p_header->>'name')),
      jsonb_build_array(
        jsonb_build_object('account_code', v_asset_acct, 'debit', v_cap, 'credit', 0),
        jsonb_build_object('account_code', coalesce(nullif(p_header->>'pay_account',''),'1120'),
                           'debit', 0, 'credit', v_cap)
      ));
    update fixed_assets set capitalize_journal_id = v_je where id = v_id;
  end if;

  perform write_audit('insert','fixed_assets', v_id::text,
    format('Asset %s registered: %s', v_no, v_cap),
    jsonb_build_object('asset_no', v_no, 'capitalized_value', v_cap), v_actor);
  return v_id;
end $fn$;

-- =====================================================================
-- run_depreciation(p_date, p_period_label, p_months) -> run id
-- Depreciates every active asset for a period of p_months (default 12 = annual).
--   SLM  per-year = (capitalized − salvage) / useful_life_years
--   WDV  per-year = WDV × dep_rate/100
-- Charge = per-year × (p_months/12), capped so WDV never falls below salvage.
-- Posts one journal: Dr each dep_expense_account / Cr 1590 (accumulated).
-- =====================================================================
create or replace function run_depreciation(p_date date default current_date,
  p_period_label text default null, p_months int default 12)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_fy    uuid := fy_for_date(p_date);
  v_no    text;
  v_run   uuid;
  v_asset fixed_assets%rowtype;
  v_wdv   numeric(14,2);
  v_charge numeric(14,2);
  v_peryear numeric(14,2);
  v_total numeric(14,2) := 0;
  v_dr    jsonb := '{}'::jsonb;    -- dep_expense_account -> accumulated debit
  v_lines jsonb := '[]'::jsonb;
  v_key   text;
  v_je    uuid;
  v_frac  numeric := p_months::numeric / 12.0;
begin
  if not has_permission('accounting.manage') then
    raise exception 'run_depreciation: not authorized';
  end if;

  v_no := next_number('dep_run', p_date);
  insert into depreciation_runs (run_no, fy_id, run_date, period_label, created_by)
    values (v_no, v_fy, p_date, p_period_label, v_actor)
    returning id into v_run;

  for v_asset in select * from fixed_assets where status = 'active' loop
    v_wdv := asset_wdv(v_asset.id);
    if v_wdv <= v_asset.salvage_value then continue; end if;

    if v_asset.method = 'slm' then
      v_peryear := (v_asset.capitalized_value - v_asset.salvage_value) / v_asset.useful_life_years;
    else
      v_peryear := v_wdv * v_asset.dep_rate / 100.0;
    end if;
    v_charge := round(v_peryear * v_frac, 2);
    -- never depreciate below salvage
    if v_wdv - v_charge < v_asset.salvage_value then
      v_charge := round(v_wdv - v_asset.salvage_value, 2);
    end if;
    if v_charge <= 0 then continue; end if;

    insert into depreciation_lines (run_id, asset_id, amount, wdv_before, wdv_after)
      values (v_run, v_asset.id, v_charge, v_wdv, v_wdv - v_charge);

    v_dr := jsonb_set(v_dr, array[v_asset.dep_expense_account],
             to_jsonb(coalesce((v_dr->>v_asset.dep_expense_account)::numeric, 0) + v_charge));
    v_total := v_total + v_charge;
  end loop;

  if v_total <= 0 then
    -- nothing to depreciate; keep an empty run for the record
    update depreciation_runs set total_amount = 0 where id = v_run;
    return v_run;
  end if;

  -- build journal: one Dr line per expense account, one Cr to 1590
  for v_key in select jsonb_object_keys(v_dr) loop
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', v_key, 'debit', (v_dr->>v_key)::numeric, 'credit', 0));
  end loop;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_code', '1590', 'debit', 0, 'credit', v_total));

  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source', 'adjustment',
      'narration', format('Depreciation run %s (%s)', v_no, coalesce(p_period_label,''))),
    v_lines);

  update depreciation_runs set journal_entry_id = v_je, total_amount = v_total where id = v_run;

  perform write_audit('post','depreciation_runs', v_run::text,
    format('Depreciation %s: %s', v_no, v_total),
    jsonb_build_object('run_no', v_no, 'total', v_total), v_actor);
  return v_run;
end $fn$;

-- =====================================================================
-- dispose_fixed_asset(p_asset, p_proceeds, p_date, p_recv_account?) -> journal id
-- Removes the asset: reverse gross block + its accumulated depreciation, book
-- the proceeds, and recognise gain/loss vs WDV.
--   Dr 1590 accumulated (Σ dep)   Dr recv (proceeds)
--      Cr asset_account (gross)
--      Cr 4210 gain   OR   Dr 5185 loss   (balancing)
-- =====================================================================
create or replace function dispose_fixed_asset(p_asset uuid, p_proceeds numeric,
  p_date date default current_date, p_recv_account text default '1120')
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_asset fixed_assets%rowtype;
  v_accum numeric(14,2);
  v_wdv   numeric(14,2);
  v_gain  numeric(14,2);
  v_proceeds numeric(14,2) := coalesce(p_proceeds, 0);
  v_lines jsonb;
  v_je    uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'dispose_fixed_asset: not authorized';
  end if;
  select * into v_asset from fixed_assets where id = p_asset for update;
  if not found then raise exception 'dispose_fixed_asset: asset % not found', p_asset; end if;
  if v_asset.status = 'disposed' then raise exception 'dispose_fixed_asset: already disposed'; end if;

  v_accum := coalesce((select sum(amount) from depreciation_lines where asset_id = p_asset), 0);
  v_wdv   := v_asset.capitalized_value - v_accum;
  v_gain  := v_proceeds - v_wdv;    -- >0 gain, <0 loss

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_asset.accum_dep_account, 'debit', v_accum, 'credit', 0),
    jsonb_build_object('account_code', p_recv_account, 'debit', v_proceeds, 'credit', 0),
    jsonb_build_object('account_code', v_asset.asset_account, 'debit', 0, 'credit', v_asset.capitalized_value));
  if v_gain > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','4210','debit',0,'credit', v_gain));
  elsif v_gain < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','5185','debit', -v_gain,'credit',0));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source','adjustment',
      'narration', format('Dispose asset %s (proceeds %s, WDV %s)', v_asset.asset_no, v_proceeds, v_wdv)),
    v_lines);

  update fixed_assets
     set status='disposed', disposed_on = p_date, disposal_journal_id = v_je
   where id = p_asset;

  perform write_audit('update','fixed_assets', p_asset::text,
    format('Asset %s disposed: proceeds %s, %s %s', v_asset.asset_no, v_proceeds,
           case when v_gain>=0 then 'gain' else 'loss' end, abs(v_gain)),
    jsonb_build_object('proceeds', v_proceeds, 'wdv', v_wdv, 'gain', v_gain), v_actor);
  return v_je;
end $fn$;

-- =====================================================================
-- create_loan(p_header) -> id  (generates the reducing-balance EMI schedule)
--   header: { lender, principal, annual_rate, start_date, tenure_months,
--             emi_amount?, loan_account?, interest_account?, note?,
--             disburse? (bool), deposit_account? }
-- If emi_amount omitted, computed by the standard annuity formula. If
-- disburse=true, posts Dr deposit_account (default 1120) / Cr loan_account.
-- =====================================================================
create or replace function create_loan(p_header jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_start date := (p_header->>'start_date')::date;
  v_fy    uuid := fy_for_date(v_start);
  v_no    text;
  v_id    uuid;
  v_p     numeric(14,2) := (p_header->>'principal')::numeric;
  v_rate  numeric := (p_header->>'annual_rate')::numeric;
  v_n     int := (p_header->>'tenure_months')::int;
  v_mrate numeric := v_rate / 1200.0;    -- monthly rate as a fraction
  v_emi   numeric(14,2);
  v_loan_acct text := coalesce(nullif(p_header->>'loan_account',''), '2510');
  v_int_acct  text := coalesce(nullif(p_header->>'interest_account',''), '5600');
  v_bal   numeric(14,2);
  v_int   numeric(14,2);
  v_prin  numeric(14,2);
  v_due   date;
  v_je    uuid;
  i       int;
begin
  if not has_permission('accounting.manage') then
    raise exception 'create_loan: not authorized';
  end if;
  if v_start is null then raise exception 'create_loan: start_date required'; end if;

  -- EMI: annuity formula, or flat principal/n if zero-interest
  if nullif(p_header->>'emi_amount','') is not null then
    v_emi := (p_header->>'emi_amount')::numeric;
  elsif v_mrate = 0 then
    v_emi := round(v_p / v_n, 2);
  else
    v_emi := round(v_p * v_mrate * power(1 + v_mrate, v_n) / (power(1 + v_mrate, v_n) - 1), 2);
  end if;

  v_no := next_number('loan', v_start);
  insert into loans (loan_no, fy_id, lender, principal, annual_rate, start_date, tenure_months,
                     emi_amount, loan_account, interest_account, note, created_by)
  values (v_no, v_fy, p_header->>'lender', v_p, v_rate, v_start, v_n, v_emi,
          v_loan_acct, v_int_acct, nullif(p_header->>'note',''), v_actor)
  returning id into v_id;

  -- build the amortization schedule
  v_bal := v_p;
  for i in 1..v_n loop
    v_due  := (v_start + make_interval(months => i))::date;
    v_int  := round(v_bal * v_mrate, 2);
    v_prin := round(v_emi - v_int, 2);
    if i = v_n or v_prin > v_bal then
      v_prin := v_bal;    -- final installment clears the balance
    end if;
    v_bal := round(v_bal - v_prin, 2);
    insert into loan_schedule (loan_id, installment_no, due_date, emi_amount,
                               principal_component, interest_component, balance)
    values (v_id, i, v_due, round(v_prin + v_int, 2), v_prin, v_int, v_bal);
  end loop;

  if coalesce((p_header->>'disburse')::boolean, false) then
    v_je := post_journal(
      jsonb_build_object('entry_date', v_start, 'source','adjustment',
        'narration', format('Loan %s disbursed from %s', v_no, p_header->>'lender')),
      jsonb_build_array(
        jsonb_build_object('account_code', coalesce(nullif(p_header->>'deposit_account',''),'1120'),
                           'debit', v_p, 'credit', 0),
        jsonb_build_object('account_code', v_loan_acct, 'debit', 0, 'credit', v_p)
      ));
    update loans set disburse_journal_id = v_je where id = v_id;
  end if;

  perform write_audit('insert','loans', v_id::text,
    format('Loan %s: %s @ %s%%', v_no, v_p, v_rate),
    jsonb_build_object('loan_no', v_no, 'principal', v_p, 'emi', v_emi), v_actor);
  return v_id;
end $fn$;

-- =====================================================================
-- pay_emi(p_schedule, p_date?, p_pay_account?) -> journal id
-- Pay one scheduled installment: Dr loan_account (principal) + Dr interest_account
-- (interest) / Cr pay_account (bank). Marks the row paid; closes the loan when
-- the last installment is paid.
-- =====================================================================
create or replace function pay_emi(p_schedule uuid, p_date date default current_date,
  p_pay_account text default '1120')
returns uuid
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_sch   loan_schedule%rowtype;
  v_loan  loans%rowtype;
  v_je    uuid;
  v_lines jsonb;
  v_remaining int;
begin
  if not has_permission('accounting.manage') then
    raise exception 'pay_emi: not authorized';
  end if;
  select * into v_sch from loan_schedule where id = p_schedule for update;
  if not found then raise exception 'pay_emi: installment % not found', p_schedule; end if;
  if v_sch.paid then raise exception 'pay_emi: installment already paid'; end if;
  select * into v_loan from loans where id = v_sch.loan_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_loan.loan_account, 'debit', v_sch.principal_component, 'credit', 0),
    jsonb_build_object('account_code', v_loan.interest_account, 'debit', v_sch.interest_component, 'credit', 0),
    jsonb_build_object('account_code', p_pay_account, 'debit', 0, 'credit', v_sch.emi_amount));

  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'source','payment',
      'narration', format('EMI %s/%s for loan %s', v_sch.installment_no, v_loan.tenure_months, v_loan.loan_no)),
    v_lines);

  update loan_schedule set paid = true, paid_on = p_date, payment_journal_id = v_je
   where id = p_schedule;

  select count(*) into v_remaining from loan_schedule where loan_id = v_loan.id and not paid;
  if v_remaining = 0 then
    update loans set status = 'closed' where id = v_loan.id;
  end if;

  perform write_audit('post','loan_schedule', p_schedule::text,
    format('EMI %s paid for loan %s: %s', v_sch.installment_no, v_loan.loan_no, v_sch.emi_amount),
    jsonb_build_object('principal', v_sch.principal_component, 'interest', v_sch.interest_component), v_actor);
  return v_je;
end $fn$;

-- grants: reads via RLS, writes via these definer RPCs (gated inside).
revoke all on function create_fixed_asset(jsonb)                    from anon, public;
revoke all on function run_depreciation(date, text, int)            from anon, public;
revoke all on function dispose_fixed_asset(uuid, numeric, date, text) from anon, public;
revoke all on function create_loan(jsonb)                           from anon, public;
revoke all on function pay_emi(uuid, date, text)                    from anon, public;
revoke all on function asset_wdv(uuid)                              from anon, public;
grant execute on function create_fixed_asset(jsonb)                    to authenticated;
grant execute on function run_depreciation(date, text, int)            to authenticated;
grant execute on function dispose_fixed_asset(uuid, numeric, date, text) to authenticated;
grant execute on function create_loan(jsonb)                           to authenticated;
grant execute on function pay_emi(uuid, date, text)                    to authenticated;
grant execute on function asset_wdv(uuid)                              to authenticated;

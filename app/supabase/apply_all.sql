-- ===================================================================
-- NEWBIZZ · apply_all.sql  (auto-generated: migrations + seed in order)
-- Paste into Supabase SQL Editor, or run via psql / Management API.
-- Phase 0 + accounting core (0001-0004) and Phase 1 sell & collect (0005-0009).
-- Smoke tests (tests/09xx) are NOT included — run them separately; they roll back.
-- ===================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0001_foundation.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0001_foundation.sql  ·  NEWBIZZ Phase 0 foundation
-- company config, financial years, users, roles/permissions, audit log,
-- gap-free number series.  Everything else depends on this.
-- Invariants: see app/README.md.  Money numeric(14,2); qty numeric(14,3).
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Enums (small, fixed vocabularies)
-- ---------------------------------------------------------------------
create type fy_status        as enum ('open','closed');
create type number_reset     as enum ('never','yearly');          -- how a series resets
create type audit_action     as enum ('insert','update','delete','approve','reject','post','void','login');

-- ---------------------------------------------------------------------
-- company_settings  (single row: the legal entity)
-- ---------------------------------------------------------------------
create table company_settings (
  id                uuid primary key default gen_random_uuid(),
  legal_name        text not null,
  trade_name        text,
  primary_gstin     text,                         -- 15-char GSTIN of the head office
  pan               text,
  state_code        text not null default '33',   -- 33 = Tamil Nadu; drives place-of-supply
  address           text,
  fssai_no          text,
  bis_no            text,
  invoice_footer    text,
  fy_start_month    int  not null default 4        -- April
                    check (fy_start_month between 1 and 12),
  base_currency     char(3) not null default 'INR',
  feature_flags     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
comment on table company_settings is 'Single-row legal entity config. state_code drives IGST vs CGST/SGST.';

-- Enforce truly single-row.
create unique index company_settings_singleton on company_settings ((true));

-- ---------------------------------------------------------------------
-- branches / locations  (stock is tracked per location)
-- ---------------------------------------------------------------------
create table branches (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  gstin         text,                              -- branch may have its own GSTIN
  state_code    text not null default '33',
  is_plant      boolean not null default false,    -- manufacturing happens here
  is_warehouse  boolean not null default true,
  address       text,
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- financial_years  (period control; drives number-series reset & posting window)
-- ---------------------------------------------------------------------
create table financial_years (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                -- 'FY26-27'
  start_date  date not null,
  end_date    date not null,
  status      fy_status not null default 'open',
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);
comment on table financial_years is 'Only open FYs accept postings (Invariant enforced in post_journal).';

-- Exactly one open FY at a time is not enforced (allows overlap at year boundary),
-- but posting always targets the FY that contains the entry date.

-- ---------------------------------------------------------------------
-- users  (profile mirror of Supabase auth.users)
-- auth.uid() = users.id.  We never store passwords here.
-- ---------------------------------------------------------------------
create table users (
  id           uuid primary key,                   -- == auth.users.id
  full_name    text not null,
  phone        text,
  email        text,
  status       text not null default 'active',     -- active | suspended
  branch_id    uuid references branches(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
comment on table users is 'Profile row per auth user. id must equal auth.users.id.';

-- ---------------------------------------------------------------------
-- roles / permissions / role_permissions  (generic capability engine)
-- A user can hold multiple roles; permissions are the union.
-- ---------------------------------------------------------------------
create table roles (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,               -- 'admin','manager','operator',...
  name         text not null,
  description  text,
  is_system    boolean not null default false,     -- system roles cannot be deleted
  created_at   timestamptz not null default now()
);

create table permissions (
  code         text primary key,                   -- 'order.create','payment.record',...
  description  text
);

create table role_permissions (
  role_id      uuid not null references roles(id) on delete cascade,
  permission   text not null references permissions(code) on delete cascade,
  scope        text not null default 'all',        -- 'all' | 'own' | 'none' (matrix cell)
  primary key (role_id, permission)
);

create table user_roles (
  user_id      uuid not null references users(id) on delete cascade,
  role_id      uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- ---------------------------------------------------------------------
-- user_pay_config  (salary / OT / commission basis — used by payroll later)
-- ---------------------------------------------------------------------
create table user_pay_config (
  user_id            uuid primary key references users(id) on delete cascade,
  monthly_salary     numeric(14,2) not null default 0,
  ot_hourly_rate     numeric(14,2) not null default 0,
  standard_shift_hrs numeric(5,2)  not null default 8,
  commission_basis   text,                          -- 'revenue' | 'cases' | 'collection' | null
  commission_rate    numeric(6,3) not null default 0,
  effective_from     date not null default current_date
);

-- ---------------------------------------------------------------------
-- audit_log  (Invariant 7: every mutation + approval lands here; append-only)
-- ---------------------------------------------------------------------
create table audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid references users(id),
  action       audit_action not null,
  entity       text not null,                       -- table / logical entity name
  entity_id    text,                                -- pk of the affected row (text: covers uuid/bigint)
  summary      text,                                -- human-readable one-liner
  diff         jsonb,                               -- before/after or payload
  ip           inet
);
create index audit_log_entity_idx on audit_log (entity, entity_id);
create index audit_log_actor_idx  on audit_log (actor_id, at desc);
comment on table audit_log is 'Append-only. No update/delete permitted (enforced by RLS + trigger).';

-- Block updates/deletes on audit_log at the DB level (defence in depth).
create or replace function audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only (Invariant 7)';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- ---------------------------------------------------------------------
-- number_series  (Invariant 8: gap-free per doc-type per FY, row-locked)
-- One row per (doc_type, fy). next_number() locks the row and bumps counter.
-- ---------------------------------------------------------------------
create table number_series (
  id           uuid primary key default gen_random_uuid(),
  doc_type     text not null,                       -- 'invoice','order','challan','po','grn','voucher',...
  fy_id        uuid not null references financial_years(id),
  prefix       text not null default '',            -- e.g. 'INV/26-27/'
  reset        number_reset not null default 'yearly',
  next_val     bigint not null default 1,
  pad_width    int not null default 4,              -- zero-pad the numeric part
  updated_at   timestamptz,
  unique (doc_type, fy_id)
);
comment on table number_series is 'Gap-free counters. Allocate ONLY via next_number() which row-locks.';

-- updated_at touch trigger (generic)
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger company_settings_touch before update on company_settings
  for each row execute function touch_updated_at();
create trigger users_touch before update on users
  for each row execute function touch_updated_at();
create trigger number_series_touch before update on number_series
  for each row execute function touch_updated_at();


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0002_accounting_core.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0002_accounting_core.sql  ·  double-entry ledger
-- chart_of_accounts, journal_entries, journal_lines, account_balances,
-- cost_centers.  Invariant 1 (journal_lines = truth for money & stock value),
-- Invariant 5 (account_balances is a read-model), Invariant 6 (immutability).
-- =====================================================================

create type account_type   as enum ('asset','liability','equity','income','expense');
create type normal_side    as enum ('debit','credit');
create type entry_status   as enum ('draft','posted','void');

-- ---------------------------------------------------------------------
-- chart_of_accounts  (ledger accounts; typed, hierarchical)
-- ---------------------------------------------------------------------
create table chart_of_accounts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,              -- '1000','1100',...
  name          text not null,
  type          account_type not null,
  normal_side   normal_side not null,              -- debit-normal (asset/expense) or credit-normal
  parent_id     uuid references chart_of_accounts(id),
  is_postable   boolean not null default true,     -- false = header/rollup only
  -- optional linkage to subledgers (a control account):
  control_of    text,                              -- 'customer' | 'supplier' | 'bank' | 'user_cash' | null
  is_system     boolean not null default false,
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);
comment on column chart_of_accounts.control_of is
  'If set, this is a control account whose detail lives in a subledger; balances still flow via journal_lines.';

-- ---------------------------------------------------------------------
-- cost_centers  (optional analytic dimension on journal_lines)
-- ---------------------------------------------------------------------
create table cost_centers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- journal_entries  (header)  — Invariant 6: once posted, immutable.
-- ---------------------------------------------------------------------
create table journal_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_no     text not null,                      -- from number_series doc_type 'voucher'/source
  fy_id        uuid not null references financial_years(id),
  entry_date   date not null,                      -- business date (IST); FY derived from this
  source       text not null,                      -- 'sale','payment','purchase','production','manual',...
  source_id    uuid,                               -- pk of the originating document, if any
  narration    text,
  status       entry_status not null default 'posted',
  reverses_id  uuid references journal_entries(id),-- if this entry reverses another
  posted_by    uuid references users(id),
  posted_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (fy_id, entry_no)
);
create index journal_entries_source_idx on journal_entries (source, source_id);
create index journal_entries_date_idx   on journal_entries (entry_date);

-- ---------------------------------------------------------------------
-- journal_lines  (THE source of truth for money & stock VALUE)
-- Each line: a debit or credit to one account. Optionally carries a
-- stock movement (item + signed qty) so inventory value ties to the ledger.
-- ---------------------------------------------------------------------
create table journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references journal_entries(id) on delete cascade,
  account_id    uuid not null references chart_of_accounts(id),
  debit         numeric(14,2) not null default 0 check (debit  >= 0),
  credit        numeric(14,2) not null default 0 check (credit >= 0),
  -- analytic dimensions:
  cost_center_id uuid references cost_centers(id),
  -- subledger party (which customer/supplier/user this line belongs to):
  party_type    text,                              -- 'customer_store' | 'supplier' | 'user' | 'bank' | null
  party_id      uuid,
  -- optional physical stock movement tied to this line (value only lives here):
  stock_item_id uuid,                              -- FK added in a later phase (items table)
  stock_qty     numeric(14,3) not null default 0,  -- signed: + in, - out
  branch_id     uuid references branches(id),
  memo          text,
  -- a line is exactly one side, never both, never neither:
  check ( (debit > 0 and credit = 0) or (credit > 0 and debit = 0) ),
  -- if a stock qty is present, an item must be named:
  check ( stock_qty = 0 or stock_item_id is not null )
);
create index journal_lines_entry_idx   on journal_lines (entry_id);
create index journal_lines_account_idx on journal_lines (account_id);
create index journal_lines_party_idx   on journal_lines (party_type, party_id);
create index journal_lines_item_idx    on journal_lines (stock_item_id) where stock_item_id is not null;

comment on table journal_lines is
  'Single source of truth for money and stock value (Invariants 1 & 2 for value). '
  'Never mutated after the entry is posted; correct via reversing entries.';

-- ---------------------------------------------------------------------
-- account_balances  (READ-MODEL — Invariant 5. Rebuildable from journal_lines.)
-- Kept per account per FY for fast reporting; maintained by post_journal.
-- ---------------------------------------------------------------------
create table account_balances (
  account_id   uuid not null references chart_of_accounts(id),
  fy_id        uuid not null references financial_years(id),
  debit_total  numeric(16,2) not null default 0,
  credit_total numeric(16,2) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (account_id, fy_id)
);
comment on table account_balances is 'Derived cache. Truth is journal_lines. rebuild_account_balances() can regenerate it.';

-- =====================================================================
-- Invariant 6 — immutability of posted entries & their lines.
-- Draft entries may be edited; posted/void entries are frozen.
-- =====================================================================
create or replace function journal_entry_guard() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    -- allow only a controlled transition draft->posted / posted->void via status,
    -- and posted_by/posted_at stamping; block edits to financial fields once posted.
    if old.status = 'posted' and new.status = 'posted'
       and (new.entry_date, new.source, new.fy_id, new.narration)
        is distinct from (old.entry_date, old.source, old.fy_id, old.narration) then
      raise exception 'Posted journal entry % is immutable (Invariant 6)', old.entry_no;
    end if;
    if old.status = 'void' then
      raise exception 'Void journal entry % cannot be modified', old.entry_no;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.status <> 'draft' then
      raise exception 'Cannot delete a % journal entry (Invariant 6)', old.status;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger journal_entry_guard_trg
  before update or delete on journal_entries
  for each row execute function journal_entry_guard();

create or replace function journal_line_guard() returns trigger
language plpgsql as $$
declare st entry_status;
begin
  select status into st from journal_entries
    where id = coalesce(new.entry_id, old.entry_id);
  if st is distinct from 'draft' then
    raise exception 'Journal lines of a % entry are immutable (Invariant 6)', st;
  end if;
  return coalesce(new, old);
end $$;
create trigger journal_line_guard_trg
  before insert or update or delete on journal_lines
  for each row execute function journal_line_guard();
-- NOTE: post_journal() inserts lines while the entry is still 'draft', then flips
-- status to 'posted' inside the same transaction, so the guard permits the build-up.


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0003_core_rpcs.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0003_core_rpcs.sql  ·  the transaction layer
-- next_number()  · gap-free doc numbers under a row lock (Invariant 8)
-- write_audit()   · append-only audit helper (Invariant 7)
-- post_journal()  · the ONLY way money/stock value enters the ledger
--                   (Invariants 1,3,4,5,6,8) — balanced, single transaction
-- assert_trial_balance() / rebuild_account_balances() · read-model tools (Inv 5)
-- All RPCs are security definer; callable via RLS-checked wrappers later.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fy_for_date(business_date) -> financial_years.id
-- Resolves which FY owns a business date; raises if none / closed.
-- ---------------------------------------------------------------------
create or replace function fy_for_date(p_date date)
returns uuid
language plpgsql stable as $$
declare v_fy uuid; v_status fy_status;
begin
  select id, status into v_fy, v_status
    from financial_years
   where p_date between start_date and end_date
   order by start_date desc
   limit 1;
  if v_fy is null then
    raise exception 'No financial year defined for date %', p_date;
  end if;
  if v_status <> 'open' then
    raise exception 'Financial year for % is closed; posting refused', p_date;
  end if;
  return v_fy;
end $$;

-- ---------------------------------------------------------------------
-- next_number(doc_type, business_date) -> formatted document number
-- Invariant 8: allocates under FOR UPDATE row lock, gap-free per FY.
-- Auto-creates the series row on first use for that (doc_type, fy).
-- ---------------------------------------------------------------------
create or replace function next_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy      uuid;
  v_prefix  text;
  v_val     bigint;
  v_pad     int;
begin
  v_fy := fy_for_date(p_date);

  -- ensure a row exists (default prefix/pad), then lock it.
  insert into number_series (doc_type, fy_id)
    values (p_doc_type, v_fy)
    on conflict (doc_type, fy_id) do nothing;

  select next_val, prefix, pad_width
    into v_val, v_prefix, v_pad
    from number_series
   where doc_type = p_doc_type and fy_id = v_fy
   for update;                                  -- <<< row lock: serialises allocation

  update number_series
     set next_val = next_val + 1
   where doc_type = p_doc_type and fy_id = v_fy;

  return v_prefix || lpad(v_val::text, v_pad, '0');
end $$;
comment on function next_number is 'Gap-free per (doc_type, FY). Row-locked. Invariant 8.';

-- ---------------------------------------------------------------------
-- write_audit(...)  — append a single audit_log row (Invariant 7).
-- ---------------------------------------------------------------------
create or replace function write_audit(
  p_action   audit_action,
  p_entity   text,
  p_entity_id text,
  p_summary  text default null,
  p_diff     jsonb default null,
  p_actor    uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, summary, diff)
    values (coalesce(p_actor, nullif(current_setting('request.jwt.claim.sub', true),'')::uuid),
            p_action, p_entity, p_entity_id, p_summary, p_diff);
end $$;

-- ---------------------------------------------------------------------
-- post_journal(header jsonb, lines jsonb) -> journal_entries.id
--
-- The single gateway for value into the ledger. One transaction (Inv 4).
--   header: { entry_date, source, source_id?, narration?, doc_type? }
--   lines : [ { account_code | account_id, debit, credit,
--               party_type?, party_id?, cost_center_code?, branch_id?,
--               stock_item_id?, stock_qty?, memo? }, ... ]
--
-- Guarantees:
--   * Σdebit = Σcredit  (balanced, else raise)              — double entry
--   * FY resolved from entry_date and must be OPEN          — period control
--   * entry_no from next_number under row lock              — Invariant 8
--   * builds entry as 'draft', inserts lines, flips 'posted'— Invariant 6 guard
--   * refreshes account_balances read-model                 — Invariant 5
--   * writes audit_log                                      — Invariant 7
-- ---------------------------------------------------------------------
create or replace function post_journal(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy         uuid;
  v_date       date;
  v_doc_type   text;
  v_entry_no   text;
  v_entry_id   uuid;
  v_actor      uuid;
  v_line       jsonb;
  v_acct       uuid;
  v_cc         uuid;
  v_dr         numeric(14,2);
  v_cr         numeric(14,2);
  v_sum_dr     numeric(16,2) := 0;
  v_sum_cr     numeric(16,2) := 0;
  v_count      int := 0;
begin
  v_date     := (p_header->>'entry_date')::date;
  if v_date is null then
    raise exception 'post_journal: entry_date is required';
  end if;
  v_doc_type := coalesce(p_header->>'doc_type', 'voucher');
  v_fy       := fy_for_date(v_date);              -- also enforces OPEN fy
  v_actor    := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'post_journal: at least two lines required';
  end if;

  v_entry_no := next_number(v_doc_type, v_date);

  -- 1) header as DRAFT so the immutability guard permits line inserts
  insert into journal_entries
      (entry_no, fy_id, entry_date, source, source_id, narration, status, posted_by)
  values
      (v_entry_no, v_fy, v_date,
       coalesce(p_header->>'source','manual'),
       nullif(p_header->>'source_id','')::uuid,
       p_header->>'narration',
       'draft', v_actor)
  returning id into v_entry_id;

  -- 2) lines
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    -- resolve account by id or code
    if (v_line ? 'account_id') and nullif(v_line->>'account_id','') is not null then
      v_acct := (v_line->>'account_id')::uuid;
    else
      select id into v_acct from chart_of_accounts
        where code = v_line->>'account_code';
      if v_acct is null then
        raise exception 'post_journal: unknown account_code %', v_line->>'account_code';
      end if;
    end if;

    v_cc := null;
    if nullif(v_line->>'cost_center_code','') is not null then
      select id into v_cc from cost_centers where code = v_line->>'cost_center_code';
    elsif nullif(v_line->>'cost_center_id','') is not null then
      v_cc := (v_line->>'cost_center_id')::uuid;
    end if;

    v_dr := coalesce((v_line->>'debit')::numeric, 0);
    v_cr := coalesce((v_line->>'credit')::numeric, 0);

    insert into journal_lines
        (entry_id, account_id, debit, credit, cost_center_id,
         party_type, party_id, stock_item_id, stock_qty, branch_id, memo)
    values
        (v_entry_id, v_acct, v_dr, v_cr, v_cc,
         nullif(v_line->>'party_type',''),
         nullif(v_line->>'party_id','')::uuid,
         nullif(v_line->>'stock_item_id','')::uuid,
         coalesce((v_line->>'stock_qty')::numeric, 0),
         nullif(v_line->>'branch_id','')::uuid,
         v_line->>'memo');

    v_sum_dr := v_sum_dr + v_dr;
    v_sum_cr := v_sum_cr + v_cr;
    v_count  := v_count + 1;
  end loop;

  -- 3) balance check — the heart of double entry
  if v_sum_dr <> v_sum_cr then
    raise exception 'post_journal: unbalanced entry (debit % <> credit %)', v_sum_dr, v_sum_cr;
  end if;
  if v_sum_dr = 0 then
    raise exception 'post_journal: zero-value entry refused';
  end if;

  -- 4) flip to POSTED (freezes the entry & its lines via guards)
  update journal_entries set status = 'posted', posted_at = now()
    where id = v_entry_id;

  -- 5) refresh read-model (Invariant 5) for the accounts touched
  insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
  select l.account_id, v_fy, sum(l.debit), sum(l.credit), now()
    from journal_lines l
   where l.entry_id = v_entry_id
   group by l.account_id
  on conflict (account_id, fy_id) do update
     set debit_total  = account_balances.debit_total  + excluded.debit_total,
         credit_total = account_balances.credit_total + excluded.credit_total,
         updated_at   = now();

  -- 6) audit (Invariant 7)
  perform write_audit('post', 'journal_entries', v_entry_id::text,
            format('%s %s: %s lines, %s', p_header->>'source', v_entry_no, v_count, v_sum_dr),
            jsonb_build_object('entry_no', v_entry_no, 'amount', v_sum_dr), v_actor);

  return v_entry_id;
end $$;
comment on function post_journal is
  'Single gateway for value into the ledger. Balanced, one transaction, refreshes read-model, audits. Invariants 1,3,4,5,6,7,8.';

-- ---------------------------------------------------------------------
-- reverse_journal(entry_id, reason) -> new reversing entry id
-- Invariant 6: never mutate a posted entry; negate it with a mirror.
-- ---------------------------------------------------------------------
create or replace function reverse_journal(p_entry_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src     journal_entries%rowtype;
  v_lines   jsonb;
  v_new     uuid;
begin
  select * into v_src from journal_entries where id = p_entry_id;
  if not found then raise exception 'reverse_journal: entry % not found', p_entry_id; end if;
  if v_src.status <> 'posted' then
    raise exception 'reverse_journal: only posted entries can be reversed (is %)', v_src.status;
  end if;

  -- build mirrored lines (swap debit<->credit, negate stock qty)
  select jsonb_agg(jsonb_build_object(
           'account_id',  l.account_id,
           'debit',       l.credit,
           'credit',      l.debit,
           'party_type',  l.party_type,
           'party_id',    l.party_id,
           'cost_center_id', l.cost_center_id,
           'stock_item_id',  l.stock_item_id,
           'stock_qty',   (-1 * l.stock_qty),
           'branch_id',   l.branch_id,
           'memo',        'reversal'))
    into v_lines
    from journal_lines l where l.entry_id = p_entry_id;

  v_new := post_journal(
    jsonb_build_object('entry_date', current_date, 'source', v_src.source,
                       'source_id', v_src.source_id::text,
                       'narration', coalesce(p_reason, 'Reversal of ' || v_src.entry_no)),
    v_lines);

  update journal_entries set reverses_id = p_entry_id where id = v_new;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- rebuild_account_balances(fy_id?)  — regenerate the read-model from truth.
-- Proves Invariant 5: account_balances is disposable.
-- ---------------------------------------------------------------------
create or replace function rebuild_account_balances(p_fy uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fy is null then
    delete from account_balances;
    insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
    select l.account_id, e.fy_id, sum(l.debit), sum(l.credit), now()
      from journal_lines l join journal_entries e on e.id = l.entry_id
     where e.status = 'posted'
     group by l.account_id, e.fy_id;
  else
    delete from account_balances where fy_id = p_fy;
    insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
    select l.account_id, e.fy_id, sum(l.debit), sum(l.credit), now()
      from journal_lines l join journal_entries e on e.id = l.entry_id
     where e.status = 'posted' and e.fy_id = p_fy
     group by l.account_id, e.fy_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- assert_trial_balance(fy_id?) -> numeric  (Σdebit - Σcredit, must be 0)
-- A health check computed straight from journal_lines (truth, not cache).
-- ---------------------------------------------------------------------
create or replace function assert_trial_balance(p_fy uuid default null)
returns numeric
language plpgsql stable as $$
declare v_diff numeric(16,2);
begin
  select coalesce(sum(l.debit) - sum(l.credit), 0)
    into v_diff
    from journal_lines l join journal_entries e on e.id = l.entry_id
   where e.status = 'posted'
     and (p_fy is null or e.fy_id = p_fy);
  if v_diff <> 0 then
    raise exception 'Trial balance broken: debit-credit difference = %', v_diff;
  end if;
  return v_diff;
end $$;
comment on function assert_trial_balance is 'Returns 0 when the ledger balances; raises otherwise. Computed from journal_lines.';


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0004_rls_policies.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0004_rls_policies.sql  ·  Row-Level Security + permission helper
-- Invariant 3: the app NEVER writes money/stock tables directly. RLS makes
-- that structural — journal_entries / journal_lines / account_balances are
-- read-only to end users; only security-definer RPCs (running as owner) write.
-- Reference/config tables are readable by any authenticated user and
-- writable only with the matching permission via has_permission().
-- =====================================================================

-- ---------------------------------------------------------------------
-- current_app_user() -> uuid   (the authenticated user's id, or null)
-- ---------------------------------------------------------------------
create or replace function current_app_user()
returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- has_permission(code)  — true if the current user holds it via any role.
-- 'admin' role short-circuits to true. Scope column reserved for row-level
-- 'own' checks layered on by individual policies later.
-- ---------------------------------------------------------------------
create or replace function has_permission(p_code text)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from user_roles ur
      join roles r on r.id = ur.role_id
     where ur.user_id = current_app_user()
       and (r.code = 'admin'
            or exists (select 1 from role_permissions rp
                        where rp.role_id = r.id
                          and rp.permission = p_code
                          and rp.scope <> 'none'))
  );
$$;
comment on function has_permission is 'Union of permissions across the user''s roles; admin role is all-access.';

-- ---------------------------------------------------------------------
-- Enable RLS everywhere. Default-deny; we add explicit policies below.
-- ---------------------------------------------------------------------
alter table company_settings   enable row level security;
alter table branches           enable row level security;
alter table financial_years    enable row level security;
alter table users              enable row level security;
alter table roles              enable row level security;
alter table permissions        enable row level security;
alter table role_permissions   enable row level security;
alter table user_roles         enable row level security;
alter table user_pay_config    enable row level security;
alter table audit_log          enable row level security;
alter table number_series      enable row level security;
alter table chart_of_accounts  enable row level security;
alter table cost_centers       enable row level security;
alter table journal_entries    enable row level security;
alter table journal_lines      enable row level security;
alter table account_balances   enable row level security;

-- ---------------------------------------------------------------------
-- Read access: any authenticated user may SELECT reference/config data.
-- (Fine-grained masking of pay/salary handled by a dedicated policy.)
-- ---------------------------------------------------------------------
create policy read_all_auth on company_settings for select to authenticated using (true);
create policy read_all_auth on branches         for select to authenticated using (true);
create policy read_all_auth on financial_years  for select to authenticated using (true);
create policy read_all_auth on roles            for select to authenticated using (true);
create policy read_all_auth on permissions      for select to authenticated using (true);
create policy read_all_auth on role_permissions for select to authenticated using (true);
create policy read_all_auth on user_roles       for select to authenticated using (true);
create policy read_all_auth on chart_of_accounts for select to authenticated using (true);
create policy read_all_auth on cost_centers     for select to authenticated using (true);
create policy read_all_auth on number_series    for select to authenticated using (true);

-- users: everyone authenticated can read profiles (names shown across UI).
create policy read_users on users for select to authenticated using (true);
-- a user may update only their own profile's soft fields (via app, not money).
create policy self_update on users for update to authenticated
  using (id = current_app_user()) with check (id = current_app_user());

-- pay config: only the owner or someone with hr.view may read it.
create policy read_own_pay on user_pay_config for select to authenticated
  using (user_id = current_app_user() or has_permission('hr.view'));

-- ---------------------------------------------------------------------
-- Ledger tables — READ-ONLY to end users; writes happen only inside
-- security-definer RPCs (post_journal, etc.) which run as the table owner
-- and therefore bypass RLS. No INSERT/UPDATE/DELETE policy = denied. (Inv 3)
-- ---------------------------------------------------------------------
create policy read_ledger on journal_entries  for select to authenticated using (true);
create policy read_ledger on journal_lines    for select to authenticated using (true);
create policy read_ledger on account_balances for select to authenticated using (true);

-- audit_log: readable with permission; never writable via the API (Inv 7).
create policy read_audit on audit_log for select to authenticated
  using (has_permission('audit.view'));

-- ---------------------------------------------------------------------
-- Config writes — gated by permission. These are plain tables (not money),
-- so the app may write them directly when the user is authorised.
-- ---------------------------------------------------------------------
create policy manage_company on company_settings for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_branches on branches for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_fy on financial_years for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_coa on chart_of_accounts for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_cc on cost_centers for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_roles on roles for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_role_perms on role_permissions for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_user_roles on user_roles for all to authenticated
  using (has_permission('roles.manage')) with check (has_permission('roles.manage'));
create policy manage_pay on user_pay_config for all to authenticated
  using (has_permission('hr.manage')) with check (has_permission('hr.manage'));

-- number_series is bumped only inside next_number() (definer). No write policy.


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0005_catalog.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0005_catalog.sql  ·  Phase 1 — product catalogue
-- units of measure, item categories, items (with HSN + GST rate),
-- price lists.  Items are the anchor for stock (Invariant 2) and for the
-- stock_item_id column on journal_lines (value, Invariant 1).
-- =====================================================================

-- item_type drives which accounts a stock move touches and where it can live:
--   raw_material  -> 1210   (preforms, caps, labels, water)
--   wip           -> 1220   (empty bottles between blowing & filling)
--   finished_good -> 1230   (filled cases — the sellable SKU)
--   consumable    -> 1240   (packing, glue, misc)
--   service       -> non-stock (freight, labour charged out) — no stock row
create type item_type as enum ('raw_material','wip','finished_good','consumable','service');

-- ---------------------------------------------------------------------
-- units of measure
-- ---------------------------------------------------------------------
create table units (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,               -- 'PCS','CASE','LTR','KG','BOX'
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- item_categories  (simple one-level grouping for reporting/filtering)
-- ---------------------------------------------------------------------
create table item_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- items  (SKU master)
-- ---------------------------------------------------------------------
create table items (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,             -- '500ML-CASE','PREFORM-24G',...
  name           text not null,
  type           item_type not null,
  category_id    uuid references item_categories(id),
  base_unit_id   uuid not null references units(id),   -- the unit stock is counted in
  -- packaging: a finished-good CASE may hold N bottles; kept for reporting only,
  -- stock is always tracked in base_unit.
  pack_size      numeric(14,3) not null default 1,     -- e.g. 12 bottles / case
  pack_unit_id   uuid references units(id),
  -- tax
  hsn_code       text,                              -- HSN/SAC for GST
  gst_rate       numeric(5,2) not null default 18,  -- % total (split CGST/SGST or IGST at invoice time)
  cess_rate      numeric(5,2) not null default 0,
  -- pricing defaults (a price list overrides these)
  default_price  numeric(14,2) not null default 0,  -- default selling price / base unit
  -- valuation: weighted-average carrying values live on the stock row, not here.
  is_sellable    boolean not null default true,
  is_purchasable boolean not null default true,
  is_stocked     boolean not null default true,     -- false for 'service' items
  reorder_level  numeric(14,3) not null default 0,
  status         text not null default 'active',
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  check (gst_rate >= 0 and gst_rate <= 40),
  check (not (type = 'service' and is_stocked))     -- services are never stocked
);
create index items_type_idx on items (type) where status = 'active';
comment on table items is 'SKU master. Finished goods are the sellable cases; raw/wip/consumable feed manufacturing.';

create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- Now that items exists, wire the deferred FK from journal_lines.stock_item_id.
-- (Declared without FK in 0002 because items did not yet exist.)
alter table journal_lines
  add constraint journal_lines_stock_item_fk
  foreign key (stock_item_id) references items(id);

-- ---------------------------------------------------------------------
-- price_lists  (named, dated selling-price sets: retail, wholesale, ...)
-- ---------------------------------------------------------------------
create table price_lists (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,               -- 'RETAIL','WHOLESALE','DISTRIBUTOR'
  name         text not null,
  is_default   boolean not null default false,
  currency     char(3) not null default 'INR',
  valid_from   date not null default current_date,
  valid_to     date,
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);
-- at most one default price list
create unique index price_lists_one_default on price_lists (is_default) where is_default;

create table price_list_items (
  price_list_id uuid not null references price_lists(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  unit_price    numeric(14,2) not null,            -- per base unit, GST-exclusive
  min_qty       numeric(14,3) not null default 0,  -- slab pricing threshold
  primary key (price_list_id, item_id, min_qty),
  check (unit_price >= 0)
);
comment on table price_list_items is 'GST-exclusive selling price per base unit; min_qty enables simple slabs.';

-- ---------------------------------------------------------------------
-- effective_price(item, price_list, qty) -> unit price (GST-exclusive)
-- Picks the best matching slab, falling back to the item default.
-- ---------------------------------------------------------------------
create or replace function effective_price(p_item uuid, p_price_list uuid, p_qty numeric default 1)
returns numeric
language sql stable as $$
  select coalesce(
    (select unit_price from price_list_items
      where item_id = p_item and price_list_id = p_price_list and min_qty <= p_qty
      order by min_qty desc limit 1),
    (select default_price from items where id = p_item)
  );
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0006_customers.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0006_customers.sql  ·  Phase 1 — store-centric customer hierarchy
-- A customer (billing party / account) owns one or more stores (ship-to
-- outlets). Orders, deliveries and receivables hang off stores, but credit
-- and the AR control account (1130) roll up to the customer.
-- =====================================================================

create type customer_kind as enum ('retail','wholesale','distributor','institution');

-- ---------------------------------------------------------------------
-- customers  (the billing account / legal party)
-- ---------------------------------------------------------------------
create table customers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,             -- 'CUST0001'
  name           text not null,
  kind           customer_kind not null default 'retail',
  gstin          text,                             -- null for unregistered/B2C
  pan            text,
  state_code     text not null default '33',       -- place of supply default
  phone          text,
  email          text,
  -- default commercial terms (a store may override the price list)
  price_list_id  uuid references price_lists(id),
  credit_limit   numeric(14,2) not null default 0, -- 0 = cash only
  credit_days    int not null default 0,
  -- receivable control: every customer's AR posts to 1130 with party_id = customer.id
  status         text not null default 'active',   -- active | on_hold | blacklisted
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index customers_kind_idx on customers (kind) where status = 'active';
comment on table customers is 'Billing party. AR (1130) is keyed by party_type=customer, party_id=customers.id.';

create trigger customers_touch before update on customers
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- customer_stores  (ship-to outlets under a customer)
-- The operational unit: routes, orders, deliveries and visits target a store.
-- ---------------------------------------------------------------------
create table customer_stores (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id) on delete cascade,
  code           text not null unique,             -- 'STR0001'
  name           text not null,                    -- 'MG Road Outlet'
  -- shipping address
  contact_name   text,
  phone          text,
  address_line   text,
  area           text,
  city           text,
  pincode        text,
  state_code     text not null default '33',       -- store's place of supply (can differ from customer)
  geo_lat        numeric(9,6),
  geo_lng        numeric(9,6),
  -- overrides (else inherit from customer)
  price_list_id  uuid references price_lists(id),
  route_id       uuid,                             -- FK added in Phase 4 (field routes); nullable now
  is_primary     boolean not null default false,   -- the customer's main outlet
  status         text not null default 'active',
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index customer_stores_customer_idx on customer_stores (customer_id) where status = 'active';
create index customer_stores_geo_idx on customer_stores (geo_lat, geo_lng);
comment on table customer_stores is 'Ship-to outlet. Orders & deliveries reference the store; money rolls up to the customer.';

create trigger customer_stores_touch before update on customer_stores
  for each row execute function touch_updated_at();

-- exactly one primary store per customer
create unique index customer_stores_one_primary
  on customer_stores (customer_id) where is_primary;

-- ---------------------------------------------------------------------
-- resolve_price_list(store) -> price_list_id
-- store override → customer default → the system default price list.
-- ---------------------------------------------------------------------
create or replace function resolve_price_list(p_store uuid)
returns uuid
language sql stable as $$
  select coalesce(
    (select s.price_list_id from customer_stores s where s.id = p_store),
    (select c.price_list_id from customer_stores s join customers c on c.id = s.customer_id
      where s.id = p_store),
    (select id from price_lists where is_default and status = 'active' limit 1)
  );
$$;

-- ---------------------------------------------------------------------
-- customer_opening_balance(customer, amount, as_of, narration)
-- Seeds an opening receivable via the ledger — never a direct balance write
-- (Invariants 1 & 3). Dr AR (1130, party=customer) / Cr Opening Balance Equity (3900).
-- ---------------------------------------------------------------------
create or replace function customer_opening_balance(
  p_customer uuid, p_amount numeric, p_as_of date default current_date, p_narration text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_entry uuid;
begin
  if p_amount = 0 then raise exception 'opening balance must be non-zero'; end if;
  v_entry := post_journal(
    jsonb_build_object('entry_date', p_as_of, 'source','opening',
                       'narration', coalesce(p_narration,'Opening receivable')),
    jsonb_build_array(
      jsonb_build_object('account_code','1130','debit', p_amount, 'credit',0,
                         'party_type','customer','party_id', p_customer::text),
      jsonb_build_object('account_code','3900','debit',0,'credit', p_amount)
    ));
  return v_entry;
end $$;


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0007_stock.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0007_stock.sql  ·  Phase 1 — inventory quantity + weighted-average value
--
-- Invariant 2: `stock` (+ user_stock_holdings) is the ONLY source of truth
--   for physical QUANTITY. Invariant 1: journal_lines is truth for VALUE.
-- This module keeps the two tied: every value-bearing move calls post_journal
-- AND updates stock in the SAME transaction via post_stock_move (Invariant 3,4).
--
-- Valuation method: weighted-average cost (WAC) per (item, branch).
--   new_avg = (qty_on_hand*avg + in_qty*in_cost) / (qty_on_hand + in_qty)
--   issues leave avg unchanged and value out at the current avg.
-- =====================================================================

-- movement reasons — drive which ledger accounts a move touches.
create type stock_move_type as enum (
  'opening',          -- initial load        Dr inventory / Cr opening equity
  'purchase_in',      -- GRN receipt         Dr inventory / Cr GRN-clearing (Phase 2)
  'sale_out',         -- delivery/invoice    Dr COGS / Cr inventory
  'production_in',    -- output of a run     Dr FG/WIP / Cr WIP-clearing (Phase 3)
  'production_out',   -- consumption in run  Dr WIP / Cr RM (Phase 3)
  'adjust_in',        -- positive adjustment Dr inventory / Cr adjustment
  'adjust_out',       -- shrinkage/damage    Dr adjustment / Cr inventory
  'transfer_out',     -- branch transfer     Cr inventory @ from-branch
  'transfer_in'       -- branch transfer     Dr inventory @ to-branch
);

-- ---------------------------------------------------------------------
-- stock  (on-hand qty + running WAC, per item per branch) — Invariant 2
-- ---------------------------------------------------------------------
create table stock (
  item_id       uuid not null references items(id),
  branch_id     uuid not null references branches(id),
  qty_on_hand   numeric(14,3) not null default 0,   -- TRUTH for quantity
  avg_cost      numeric(14,4) not null default 0,    -- weighted-average unit cost
  -- value = qty_on_hand * avg_cost is the carrying value; it must tie to the
  -- inventory control accounts in journal_lines (checked by a reconcile view).
  updated_at    timestamptz not null default now(),
  primary key (item_id, branch_id),
  check (qty_on_hand >= 0),                          -- no negative stock in v1
  check (avg_cost   >= 0)
);
comment on table stock is 'Source of truth for physical quantity (Invariant 2). avg_cost = weighted-average unit cost.';

-- ---------------------------------------------------------------------
-- stock_ledger  (immutable, append-only movement log) — the audit trail
-- of every quantity change; mirrors journal_lines for physical goods.
-- ---------------------------------------------------------------------
create table stock_ledger (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id),
  branch_id     uuid not null references branches(id),
  move_type     stock_move_type not null,
  qty_delta     numeric(14,3) not null,             -- signed: + in, - out
  unit_cost     numeric(14,4) not null,             -- cost used for this move
  value_delta   numeric(14,2) not null,             -- qty_delta * unit_cost (rounded)
  qty_after     numeric(14,3) not null,             -- on-hand after this move
  avg_after     numeric(14,4) not null,             -- WAC after this move
  journal_entry_id uuid references journal_entries(id),  -- the value posting, if any
  source        text,                               -- 'invoice','grn','adjustment',...
  source_id     uuid,
  moved_by      uuid references users(id),
  moved_at      timestamptz not null default now(),
  check (qty_delta <> 0)
);
create index stock_ledger_item_idx   on stock_ledger (item_id, branch_id, moved_at);
create index stock_ledger_source_idx on stock_ledger (source, source_id);
comment on table stock_ledger is 'Append-only physical movement log; qty_after/avg_after snapshot WAC after each move.';

-- append-only guard (Invariant 6 spirit for physical ledger)
create or replace function stock_ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'stock_ledger is append-only; reverse with an offsetting move';
end $$;
create trigger stock_ledger_no_change before update or delete on stock_ledger
  for each row execute function stock_ledger_immutable();

-- ---------------------------------------------------------------------
-- inventory_account_for(item_type) -> chart_of_accounts.code
-- Maps an item's type to its inventory control account.
-- ---------------------------------------------------------------------
create or replace function inventory_account_for(p_type item_type)
returns text
language sql immutable as $$
  select case p_type
    when 'raw_material'  then '1210'
    when 'wip'           then '1220'
    when 'finished_good' then '1230'
    when 'consumable'    then '1240'
    else null                       -- service: not stocked
  end;
$$;

-- ---------------------------------------------------------------------
-- post_stock_move — the ONLY way stock quantity changes (Invariant 3).
-- One transaction: update stock (qty + WAC), append stock_ledger, and post
-- the paired journal entry so value ties to the ledger (Invariants 1,2,4).
--
--   p_item, p_branch, p_move_type, p_qty(+in/-out), p_unit_cost
--   p_contra_account : the OTHER side of the value posting
--                      (COGS 5100 for sale_out, opening equity 3900 for opening,
--                       a clearing account for purchase/production, etc.)
--   p_source, p_source_id, p_entry_date
--
-- Returns the stock_ledger row id.
-- For issues (qty<0) the unit_cost used is the CURRENT avg_cost (WAC), so the
-- caller's p_unit_cost is ignored on the way out.
-- ---------------------------------------------------------------------
create or replace function post_stock_move(
  p_item uuid, p_branch uuid, p_move_type stock_move_type,
  p_qty numeric, p_unit_cost numeric default 0,
  p_contra_account text default null,
  p_source text default null, p_source_id uuid default null,
  p_entry_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type      item_type;
  v_inv_acct  text;
  v_cur_qty   numeric(14,3);
  v_cur_avg   numeric(14,4);
  v_new_qty   numeric(14,3);
  v_new_avg   numeric(14,4);
  v_unit      numeric(14,4);
  v_value     numeric(14,2);
  v_entry     uuid;
  v_ledger    uuid;
  v_actor     uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_qty = 0 then raise exception 'post_stock_move: qty cannot be zero'; end if;

  select type into v_type from items where id = p_item;
  if v_type is null then raise exception 'post_stock_move: unknown item %', p_item; end if;
  v_inv_acct := inventory_account_for(v_type);
  if v_inv_acct is null then
    raise exception 'post_stock_move: item type % is not stocked', v_type;
  end if;

  -- lock the stock row (create at zero if first move for this item/branch)
  insert into stock (item_id, branch_id) values (p_item, p_branch)
    on conflict (item_id, branch_id) do nothing;
  select qty_on_hand, avg_cost into v_cur_qty, v_cur_avg
    from stock where item_id = p_item and branch_id = p_branch for update;

  if p_qty > 0 then
    ------------------------------------------------ receipt: recompute WAC
    v_unit    := p_unit_cost;
    v_new_qty := v_cur_qty + p_qty;
    v_new_avg := case when v_new_qty = 0 then 0
                 else round(((v_cur_qty * v_cur_avg) + (p_qty * v_unit)) / v_new_qty, 4) end;
  else
    ------------------------------------------------ issue: value at current WAC
    if (v_cur_qty + p_qty) < 0 then
      raise exception 'post_stock_move: insufficient stock for item % at branch % (have %, need %)',
        p_item, p_branch, v_cur_qty, (-p_qty);
    end if;
    v_unit    := v_cur_avg;                 -- WAC, ignore caller cost on the way out
    v_new_qty := v_cur_qty + p_qty;
    v_new_avg := case when v_new_qty = 0 then 0 else v_cur_avg end;
  end if;

  v_value := round(p_qty * v_unit, 2);      -- signed money value of this move

  -- 1) update the truth (Invariant 2)
  update stock set qty_on_hand = v_new_qty, avg_cost = v_new_avg, updated_at = now()
    where item_id = p_item and branch_id = p_branch;

  -- 2) post the paired value entry (Invariant 1 & 3) if a contra account is given.
  --    inventory side carries the stock_item_id + signed stock_qty so value ties out.
  if p_contra_account is not null and v_value <> 0 then
    if p_qty > 0 then
      -- receipt: Dr inventory / Cr contra
      v_entry := post_journal(
        jsonb_build_object('entry_date', p_entry_date, 'source', coalesce(p_source,'stock'),
                           'source_id', p_source_id::text, 'narration','Stock '||p_move_type),
        jsonb_build_array(
          jsonb_build_object('account_code', v_inv_acct, 'debit', v_value, 'credit', 0,
                             'stock_item_id', p_item::text, 'stock_qty', p_qty, 'branch_id', p_branch::text),
          jsonb_build_object('account_code', p_contra_account, 'debit', 0, 'credit', v_value)));
    else
      -- issue: Dr contra (e.g. COGS) / Cr inventory
      v_entry := post_journal(
        jsonb_build_object('entry_date', p_entry_date, 'source', coalesce(p_source,'stock'),
                           'source_id', p_source_id::text, 'narration','Stock '||p_move_type),
        jsonb_build_array(
          jsonb_build_object('account_code', p_contra_account, 'debit', abs(v_value), 'credit', 0),
          jsonb_build_object('account_code', v_inv_acct, 'debit', 0, 'credit', abs(v_value),
                             'stock_item_id', p_item::text, 'stock_qty', p_qty, 'branch_id', p_branch::text)));
    end if;
  end if;

  -- 3) append the physical ledger row
  insert into stock_ledger
      (item_id, branch_id, move_type, qty_delta, unit_cost, value_delta,
       qty_after, avg_after, journal_entry_id, source, source_id, moved_by)
  values
      (p_item, p_branch, p_move_type, p_qty, v_unit, v_value,
       v_new_qty, v_new_avg, v_entry, p_source, p_source_id, v_actor)
  returning id into v_ledger;

  return v_ledger;
end $$;
comment on function post_stock_move is
  'Single gateway for quantity change. Updates WAC stock, appends stock_ledger, posts paired value entry. Invariants 1-4.';

-- ---------------------------------------------------------------------
-- receive_opening_stock(item, branch, qty, unit_cost, as_of)
-- Convenience wrapper for initial stock load: Dr inventory / Cr 3900.
-- ---------------------------------------------------------------------
create or replace function receive_opening_stock(
  p_item uuid, p_branch uuid, p_qty numeric, p_unit_cost numeric, p_as_of date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return post_stock_move(p_item, p_branch, 'opening', p_qty, p_unit_cost,
                         '3900', 'opening', null, p_as_of);
end $$;

-- ---------------------------------------------------------------------
-- stock_value_reconcile  (view) — proves qty*avg ties to ledger inventory.
-- Invariant 5 style check: physical carrying value vs journal_lines value.
-- ---------------------------------------------------------------------
create or replace view stock_value_reconcile as
select
  a.code                                        as inv_account,
  round(sum(s.qty_on_hand * s.avg_cost), 2)     as stock_carrying_value,
  coalesce(round(sum(l.debit - l.credit), 2),0) as ledger_value,
  round(sum(s.qty_on_hand * s.avg_cost), 2)
    - coalesce(round(sum(l.debit - l.credit),2),0) as difference
from stock s
join items i on i.id = s.item_id
join chart_of_accounts a on a.code = inventory_account_for(i.type)
left join journal_lines l on l.account_id = a.id
group by a.code;
comment on view stock_value_reconcile is 'difference should be ~0: WAC carrying value vs inventory control accounts.';


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0008_sales.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0008_sales.sql  ·  Phase 1 — sales orders, invoices, GST, delivery
--
-- Flow:  place_order (draft demand, no ledger impact)
--        -> post_invoice (the value event):
--             * stock OUT at WAC via post_stock_move  -> Dr COGS / Cr FG
--             * revenue + GST + AR via post_journal     -> Dr AR / Cr Sales / Cr Output GST
--        Everything in one transaction (Invariant 4). No direct table money writes.
--
-- GST: intra-state (supplier state == place of supply) splits CGST+SGST;
--      inter-state uses IGST. Place of supply = store.state_code.
-- =====================================================================

create type order_status   as enum ('draft','confirmed','invoiced','cancelled');
create type invoice_status as enum ('posted','paid','part_paid','void');

-- ---------------------------------------------------------------------
-- sales_orders  (demand; no accounting impact until invoiced)
-- ---------------------------------------------------------------------
create table sales_orders (
  id           uuid primary key default gen_random_uuid(),
  order_no     text not null,
  fy_id        uuid not null references financial_years(id),
  store_id     uuid not null references customer_stores(id),
  customer_id  uuid not null references customers(id),
  order_date   date not null default current_date,
  price_list_id uuid references price_lists(id),
  branch_id    uuid not null references branches(id),       -- fulfilling branch
  status       order_status not null default 'draft',
  notes        text,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  unique (fy_id, order_no)
);
create index sales_orders_store_idx on sales_orders (store_id, order_date);
create index sales_orders_status_idx on sales_orders (status);

create table sales_order_lines (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references sales_orders(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,             -- GST-exclusive, per base unit
  gst_rate     numeric(5,2)  not null,             -- snapshot at order time
  line_no      int not null default 1
);
create index sales_order_lines_order_idx on sales_order_lines (order_id);

-- ---------------------------------------------------------------------
-- invoices  (tax invoice — the value document)
-- ---------------------------------------------------------------------
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text not null,
  fy_id         uuid not null references financial_years(id),
  order_id      uuid references sales_orders(id),  -- nullable: direct/counter sale
  store_id      uuid not null references customer_stores(id),
  customer_id   uuid not null references customers(id),
  branch_id     uuid not null references branches(id),
  invoice_date  date not null default current_date,
  place_of_supply text not null,                   -- state_code driving CGST/SGST vs IGST
  is_interstate boolean not null default false,
  -- money (all derived from lines; stored for the printed document)
  taxable_amount numeric(14,2) not null default 0,
  cgst_amount    numeric(14,2) not null default 0,
  sgst_amount    numeric(14,2) not null default 0,
  igst_amount    numeric(14,2) not null default 0,
  cess_amount    numeric(14,2) not null default 0,
  round_off      numeric(14,2) not null default 0,
  grand_total    numeric(14,2) not null default 0,
  -- linkage to the accounting entry (Invariant: value lives in journal_lines)
  journal_entry_id uuid references journal_entries(id),
  cogs_entry_id    uuid references journal_entries(id),
  status         invoice_status not null default 'posted',
  amount_paid    numeric(14,2) not null default 0, -- read-model, maintained by receipts
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (fy_id, invoice_no)
);
create index invoices_customer_idx on invoices (customer_id, invoice_date);
create index invoices_store_idx    on invoices (store_id);
create index invoices_status_idx   on invoices (status) where status in ('posted','part_paid');
comment on column invoices.amount_paid is 'Read-model (Invariant 5); truth is receipt_allocations sum.';

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,             -- GST-exclusive
  taxable_amount numeric(14,2) not null,           -- qty * unit_price
  gst_rate     numeric(5,2)  not null,
  cgst_amount  numeric(14,2) not null default 0,
  sgst_amount  numeric(14,2) not null default 0,
  igst_amount  numeric(14,2) not null default 0,
  cess_amount  numeric(14,2) not null default 0,
  line_total   numeric(14,2) not null,             -- taxable + taxes
  line_no      int not null default 1
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- ---------------------------------------------------------------------
-- place_order(header jsonb, lines jsonb) -> sales_orders.id
--   header: { store_id, order_date?, branch_id?, notes? }
--   lines : [ { item_id, qty, unit_price? }, ... ]  (price auto-resolved if omitted)
-- Pure demand capture; no ledger, no stock impact.
-- ---------------------------------------------------------------------
create or replace function place_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_pl       uuid;
  v_date     date := coalesce((p_header->>'order_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_order    uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_price    numeric(14,2);
  v_rate     numeric(5,2);
  v_ln       int := 0;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_store is null then raise exception 'place_order: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'place_order: unknown store %', v_store; end if;
  v_fy     := fy_for_date(v_date);
  v_pl     := resolve_price_list(v_store);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('order', v_date);

  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by)
  values (v_no, v_fy, v_store, v_cust, v_date, v_pl, v_branch, 'confirmed',
          p_header->>'notes', v_actor)
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_order: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into sales_order_lines (order_id, item_id, qty, unit_price, gst_rate, line_no)
      values (v_order, v_item, v_qty, v_price, coalesce(v_rate,0), v_ln);
  end loop;

  perform write_audit('insert','sales_orders', v_order::text,
            format('Order %s for store %s', v_no, v_store), null, v_actor);
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- post_invoice(p_order uuid | p_header jsonb, p_lines jsonb) -> invoices.id
-- The value event. Computes GST (CGST/SGST or IGST by place of supply),
-- posts revenue+tax+AR, and issues stock at WAC (COGS). One transaction.
--
-- Two call styles:
--   * from an order:   post_invoice_from_order(order_id, invoice_date?)
--   * direct sale:     post_invoice(header, lines)  (header like place_order)
-- ---------------------------------------------------------------------
create or replace function post_invoice(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_date     date := coalesce((p_header->>'invoice_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_supply   text;                 -- place of supply (store state)
  v_home     text;                 -- our state (company / branch)
  v_inter    boolean;
  v_pl       uuid;
  v_inv      uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid; v_qty numeric(14,3); v_price numeric(14,2); v_rate numeric(5,2);
  v_cess_r   numeric(5,2);
  v_taxable  numeric(14,2); v_cgst numeric(14,2); v_sgst numeric(14,2);
  v_igst     numeric(14,2); v_cess numeric(14,2); v_ltot numeric(14,2);
  v_sum_tax  numeric(14,2) := 0; v_sum_cgst numeric(14,2) := 0; v_sum_sgst numeric(14,2) := 0;
  v_sum_igst numeric(14,2) := 0; v_sum_cess numeric(14,2) := 0;
  v_grand    numeric(14,2);
  v_round    numeric(14,2);
  v_ln       int := 0;
  v_je       uuid; v_cogs_je uuid;
  v_ar_lines jsonb := '[]'::jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_type     item_type;
begin
  if v_store is null then raise exception 'post_invoice: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'post_invoice: unknown store %', v_store; end if;

  v_fy     := fy_for_date(v_date);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_pl     := resolve_price_list(v_store);
  v_supply := coalesce(nullif(p_header->>'place_of_supply',''),
                       (select state_code from customer_stores where id = v_store));
  select state_code into v_home from branches where id = v_branch;
  v_home   := coalesce(v_home, (select state_code from company_settings limit 1), '33');
  v_inter  := (v_supply is distinct from v_home);
  v_no     := next_number('invoice', v_date);

  -- header shell (money filled after lines)
  insert into invoices (invoice_no, fy_id, order_id, store_id, customer_id, branch_id,
                        invoice_date, place_of_supply, is_interstate, status, created_by)
  values (v_no, v_fy, nullif(p_header->>'order_id','')::uuid, v_store, v_cust, v_branch,
          v_date, v_supply, v_inter, 'posted', v_actor)
  returning id into v_inv;

  ------------------------------------------------------------------- lines
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'post_invoice: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate, cess_rate, type into v_rate, v_cess_r, v_type from items where id = v_item;
    v_rate := coalesce(v_rate,0); v_cess_r := coalesce(v_cess_r,0);

    v_taxable := round(v_qty * v_price, 2);
    v_cess    := round(v_taxable * v_cess_r / 100, 2);
    if v_inter then
      v_igst := round(v_taxable * v_rate / 100, 2); v_cgst := 0; v_sgst := 0;
    else
      v_cgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_sgst := round(v_taxable * (v_rate/2) / 100, 2);
      v_igst := 0;
    end if;
    v_ltot := v_taxable + v_cgst + v_sgst + v_igst + v_cess;
    v_ln := v_ln + 1;

    insert into invoice_lines (invoice_id, item_id, qty, unit_price, taxable_amount, gst_rate,
                               cgst_amount, sgst_amount, igst_amount, cess_amount, line_total, line_no)
    values (v_inv, v_item, v_qty, v_price, v_taxable, v_rate,
            v_cgst, v_sgst, v_igst, v_cess, v_ltot, v_ln);

    v_sum_tax  := v_sum_tax + v_taxable; v_sum_cgst := v_sum_cgst + v_cgst;
    v_sum_sgst := v_sum_sgst + v_sgst;   v_sum_igst := v_sum_igst + v_igst;
    v_sum_cess := v_sum_cess + v_cess;

    -- issue stock at WAC for stocked items (Dr COGS 5100 / Cr FG 1230…).
    if v_type <> 'service' then
      perform post_stock_move(v_item, v_branch, 'sale_out', (-1 * v_qty), 0,
                              '5100', 'invoice', v_inv, v_date);
    end if;
  end loop;

  if v_ln = 0 then raise exception 'post_invoice: at least one line required'; end if;

  -- rounding to whole rupee on the grand total
  v_grand := v_sum_tax + v_sum_cgst + v_sum_sgst + v_sum_igst + v_sum_cess;
  v_round := round(v_grand) - v_grand;
  v_grand := v_grand + v_round;

  ------------------------------------------------------------ revenue posting
  -- Dr AR (customer) grand_total ; Cr Sales taxable ; Cr Output GST ; +round-off
  v_ar_lines := jsonb_build_array(
    jsonb_build_object('account_code','1130','debit', v_grand,'credit',0,
                       'party_type','customer','party_id', v_cust::text),
    jsonb_build_object('account_code','4100','debit',0,'credit', v_sum_tax));
  if (v_sum_cgst + v_sum_sgst + v_sum_igst) > 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,
                         'credit', v_sum_cgst + v_sum_sgst + v_sum_igst));
  end if;
  if v_sum_cess <> 0 then
    v_ar_lines := v_ar_lines || jsonb_build_array(
      jsonb_build_object('account_code','2120','debit',0,'credit', v_sum_cess));
  end if;
  if v_round <> 0 then
    -- positive round_off = income to us => credit 5700; negative => debit 5700
    if v_round > 0 then
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit',0,'credit', v_round));
    else
      v_ar_lines := v_ar_lines || jsonb_build_array(
        jsonb_build_object('account_code','5700','debit', abs(v_round),'credit',0));
    end if;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','sale', 'source_id', v_inv::text,
                       'narration','Invoice '||v_no),
    v_ar_lines);

  -- fill header money + linkage
  update invoices set
      taxable_amount = v_sum_tax, cgst_amount = v_sum_cgst, sgst_amount = v_sum_sgst,
      igst_amount = v_sum_igst, cess_amount = v_sum_cess, round_off = v_round,
      grand_total = v_grand, journal_entry_id = v_je
    where id = v_inv;

  -- mark source order invoiced
  if (p_header ? 'order_id') and nullif(p_header->>'order_id','') is not null then
    update sales_orders set status='invoiced', updated_at=now()
      where id = (p_header->>'order_id')::uuid;
  end if;

  perform write_audit('post','invoices', v_inv::text,
            format('Invoice %s total %s', v_no, v_grand),
            jsonb_build_object('invoice_no', v_no, 'grand_total', v_grand), v_actor);
  return v_inv;
end $$;
comment on function post_invoice is
  'Value event: computes GST, posts revenue+tax+AR, issues stock at WAC (COGS). One transaction.';

-- ---------------------------------------------------------------------
-- post_invoice_from_order(order_id, invoice_date?) -> invoice id
-- Copies confirmed order lines into an invoice payload and posts it.
-- ---------------------------------------------------------------------
create or replace function post_invoice_from_order(p_order uuid, p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o    sales_orders%rowtype;
  v_lines jsonb;
begin
  select * into v_o from sales_orders where id = p_order;
  if not found then raise exception 'post_invoice_from_order: order % not found', p_order; end if;
  if v_o.status = 'invoiced' then raise exception 'order % already invoiced', v_o.order_no; end if;
  if v_o.status = 'cancelled' then raise exception 'order % is cancelled', v_o.order_no; end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)
                   order by line_no)
    into v_lines
    from sales_order_lines where order_id = p_order;

  return post_invoice(
    jsonb_build_object('store_id', v_o.store_id::text, 'branch_id', v_o.branch_id::text,
                       'invoice_date', p_date, 'order_id', p_order::text),
    v_lines);
end $$;


-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0009_collections.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- 0009_collections.sql  ·  Phase 1 — customer collections (receipts)
--
-- record_receipt: Dr Cash/Bank (or user custody) / Cr AR (customer). One
-- transaction via post_journal (Invariants 1,3,4). Allocations knock down
-- specific invoices and maintain the invoices.amount_paid read-model (Inv 5).
--
-- If the receipt is collected in the field by a staff member holding cash,
-- the debit lands in 2140 (User Custody / Float) keyed to that user, until
-- they deposit it (a later cash-deposit move clears 2140 into bank 1120).
-- =====================================================================

create type receipt_mode as enum ('cash','upi','bank','cheque','card','adjustment');

-- ---------------------------------------------------------------------
-- customer_receipts  (money in)
-- ---------------------------------------------------------------------
create table customer_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text not null,
  fy_id         uuid not null references financial_years(id),
  customer_id   uuid not null references customers(id),
  store_id      uuid references customer_stores(id),      -- where it was collected
  receipt_date  date not null default current_date,
  mode          receipt_mode not null,
  amount        numeric(14,2) not null check (amount > 0),
  reference     text,                                     -- UPI ref / cheque no / txn id
  -- where the debit landed:
  deposit_account text not null default '1110',           -- 1110 cash, 1120 bank, or 2140 custody
  collected_by  uuid references users(id),                -- staff who took custody (for 2140)
  journal_entry_id uuid references journal_entries(id),
  allocated_amount numeric(14,2) not null default 0,      -- read-model: sum of allocations
  status        text not null default 'posted',           -- posted | void
  notes         text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (fy_id, receipt_no)
);
create index customer_receipts_customer_idx on customer_receipts (customer_id, receipt_date);
comment on column customer_receipts.allocated_amount is 'Read-model; unallocated = amount - allocated_amount (on-account).';

-- ---------------------------------------------------------------------
-- receipt_allocations  (which invoices a receipt paid down)
-- ---------------------------------------------------------------------
create table receipt_allocations (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references customer_receipts(id) on delete cascade,
  invoice_id   uuid not null references invoices(id),
  amount       numeric(14,2) not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);
create index receipt_allocations_invoice_idx on receipt_allocations (invoice_id);

-- ---------------------------------------------------------------------
-- invoice_outstanding(invoice) -> amount still due (from truth: allocations)
-- ---------------------------------------------------------------------
create or replace function invoice_outstanding(p_invoice uuid)
returns numeric
language sql stable as $$
  select i.grand_total
       - coalesce((select sum(a.amount) from receipt_allocations a
                    join customer_receipts r on r.id = a.receipt_id
                   where a.invoice_id = p_invoice and r.status = 'posted'), 0)
    from invoices i where i.id = p_invoice;
$$;

-- ---------------------------------------------------------------------
-- record_receipt(header jsonb, allocations jsonb) -> receipt id
--   header: { customer_id, store_id?, receipt_date?, mode, amount,
--             reference?, deposit_account?, collected_by?, notes? }
--   allocations: [ { invoice_id, amount }, ... ]  (optional; rest = on-account)
--
-- Posts Dr deposit_account / Cr AR(customer). Validates allocations don't
-- exceed the receipt or an invoice's outstanding. Updates read-models.
-- ---------------------------------------------------------------------
create or replace function record_receipt(p_header jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid := (p_header->>'customer_id')::uuid;
  v_date    date := coalesce((p_header->>'receipt_date')::date, current_date);
  v_fy      uuid;
  v_amount  numeric(14,2) := (p_header->>'amount')::numeric;
  v_mode    receipt_mode := (p_header->>'mode')::receipt_mode;
  v_deposit text := coalesce(nullif(p_header->>'deposit_account',''), '1110');
  v_staff   uuid := nullif(p_header->>'collected_by','')::uuid;
  v_rno     text;
  v_rcpt    uuid;
  v_je      uuid;
  v_alloc   jsonb;
  v_inv     uuid; v_aamt numeric(14,2); v_out numeric(14,2);
  v_sum_alloc numeric(14,2) := 0;
  v_dr_lines jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_cust is null then raise exception 'record_receipt: customer_id required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'record_receipt: amount must be > 0'; end if;
  v_fy  := fy_for_date(v_date);
  v_rno := next_number('receipt', v_date);

  insert into customer_receipts (receipt_no, fy_id, customer_id, store_id, receipt_date,
                                 mode, amount, reference, deposit_account, collected_by, notes, created_by)
  values (v_rno, v_fy, v_cust, nullif(p_header->>'store_id','')::uuid, v_date,
          v_mode, v_amount, p_header->>'reference', v_deposit, v_staff, p_header->>'notes', v_actor)
  returning id into v_rcpt;

  ------------------------------------------------------------ value posting
  -- Dr deposit account (cash/bank/custody) / Cr AR (customer control)
  -- custody (2140) carries the collecting user as its party.
  v_dr_lines := jsonb_build_array(
    case when v_deposit = '2140' then
      jsonb_build_object('account_code','2140','debit', v_amount,'credit',0,
                         'party_type','user','party_id', coalesce(v_staff, v_actor)::text)
    else
      jsonb_build_object('account_code', v_deposit,'debit', v_amount,'credit',0)
    end,
    jsonb_build_object('account_code','1130','debit',0,'credit', v_amount,
                       'party_type','customer','party_id', v_cust::text));

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'source','receipt', 'source_id', v_rcpt::text,
                       'narration','Receipt '||v_rno),
    v_dr_lines);

  update customer_receipts set journal_entry_id = v_je where id = v_rcpt;

  ------------------------------------------------------------- allocations
  if jsonb_typeof(p_allocations) = 'array' then
    for v_alloc in select * from jsonb_array_elements(p_allocations) loop
      v_inv  := (v_alloc->>'invoice_id')::uuid;
      v_aamt := (v_alloc->>'amount')::numeric;
      if v_aamt is null or v_aamt <= 0 then raise exception 'allocation amount must be > 0'; end if;

      -- guard: cannot pay an invoice belonging to another customer
      if (select customer_id from invoices where id = v_inv) is distinct from v_cust then
        raise exception 'allocation invoice % is not for customer %', v_inv, v_cust;
      end if;
      v_out := invoice_outstanding(v_inv);
      if v_aamt > v_out then
        raise exception 'allocation % exceeds invoice % outstanding %', v_aamt, v_inv, v_out;
      end if;

      insert into receipt_allocations (receipt_id, invoice_id, amount)
        values (v_rcpt, v_inv, v_aamt);
      v_sum_alloc := v_sum_alloc + v_aamt;

      -- maintain invoice read-model (Invariant 5)
      update invoices set
          amount_paid = amount_paid + v_aamt,
          status = case when (amount_paid + v_aamt) >= grand_total then 'paid'
                        else 'part_paid' end
        where id = v_inv;
    end loop;
  end if;

  if v_sum_alloc > v_amount then
    raise exception 'record_receipt: allocations % exceed receipt amount %', v_sum_alloc, v_amount;
  end if;
  update customer_receipts set allocated_amount = v_sum_alloc where id = v_rcpt;

  perform write_audit('post','customer_receipts', v_rcpt::text,
            format('Receipt %s %s from customer', v_rno, v_amount),
            jsonb_build_object('receipt_no', v_rno, 'amount', v_amount, 'allocated', v_sum_alloc), v_actor);
  return v_rcpt;
end $$;
comment on function record_receipt is
  'Money in: Dr cash/bank/custody, Cr AR. Allocates to invoices, updates read-models. One transaction.';

-- ---------------------------------------------------------------------
-- customer_outstanding(customer) -> total AR due (from posted invoices)
-- ---------------------------------------------------------------------
create or replace function customer_outstanding(p_customer uuid)
returns numeric
language sql stable as $$
  select coalesce(sum(invoice_outstanding(i.id)), 0)
    from invoices i
   where i.customer_id = p_customer and i.status in ('posted','part_paid');
$$;

-- =====================================================================
-- RLS for Phase 1 tables — reads open to authenticated; writes go through
-- the security-definer RPCs above (Invariant 3). Config/master tables
-- (items, customers, price lists) are directly writable with permission.
-- =====================================================================
alter table units                enable row level security;
alter table item_categories      enable row level security;
alter table items                enable row level security;
alter table price_lists          enable row level security;
alter table price_list_items     enable row level security;
alter table customers            enable row level security;
alter table customer_stores      enable row level security;
alter table stock                enable row level security;
alter table stock_ledger         enable row level security;
alter table sales_orders         enable row level security;
alter table sales_order_lines    enable row level security;
alter table invoices             enable row level security;
alter table invoice_lines        enable row level security;
alter table customer_receipts    enable row level security;
alter table receipt_allocations  enable row level security;

-- read access for any authenticated user
create policy read_all_auth on units             for select to authenticated using (true);
create policy read_all_auth on item_categories   for select to authenticated using (true);
create policy read_all_auth on items             for select to authenticated using (true);
create policy read_all_auth on price_lists       for select to authenticated using (true);
create policy read_all_auth on price_list_items  for select to authenticated using (true);
create policy read_all_auth on customers         for select to authenticated using (true);
create policy read_all_auth on customer_stores   for select to authenticated using (true);
create policy read_all_auth on stock             for select to authenticated using (true);
create policy read_all_auth on stock_ledger      for select to authenticated using (true);
create policy read_all_auth on sales_orders      for select to authenticated using (true);
create policy read_all_auth on sales_order_lines for select to authenticated using (true);
create policy read_all_auth on invoices          for select to authenticated using (true);
create policy read_all_auth on invoice_lines     for select to authenticated using (true);
create policy read_all_auth on customer_receipts for select to authenticated using (true);
create policy read_all_auth on receipt_allocations for select to authenticated using (true);

-- master-data writes gated by permission (these are not money tables)
create policy manage_items on items for all to authenticated
  using (has_permission('customer.manage') or has_permission('inventory.view'))
  with check (has_permission('customer.manage') or has_permission('inventory.view'));
create policy manage_units on units for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_item_cats on item_categories for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));
create policy manage_price_lists on price_lists for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_price_items on price_list_items for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_customers on customers for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_stores on customer_stores for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));

-- orders may be created by sales staff directly (demand, not money); the value
-- events (invoice/receipt/stock) have NO write policy => only definer RPCs write.
create policy manage_orders on sales_orders for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));
create policy manage_order_lines on sales_order_lines for all to authenticated
  using (has_permission('order.create')) with check (has_permission('order.create'));


-- >>>>>>>>>>>>>>>>>>>>>>>> seed/0100_seed_foundation.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- seed/0100_seed_foundation.sql
-- Bootstraps the entity: company row, financial year, roles, the
-- permission catalogue, and the role→permission matrix.
-- Idempotent (safe to re-run) via ON CONFLICT.
-- =====================================================================

-- --- company (single row) -------------------------------------------
insert into company_settings (legal_name, trade_name, state_code, fy_start_month, invoice_footer)
select 'NEWBIZZ Beverages', 'NEWBIZZ', '33', 4, 'Thank you for your business.'
where not exists (select 1 from company_settings);

-- --- financial year 2026-27 (Apr–Mar) -------------------------------
insert into financial_years (code, start_date, end_date, status)
values ('FY26-27', date '2026-04-01', date '2027-03-31', 'open')
on conflict (code) do nothing;

-- --- default plant / warehouse branch --------------------------------
insert into branches (code, name, state_code, is_plant, is_warehouse)
values ('HO', 'Head Office & Plant', '33', true, true)
on conflict (code) do nothing;

-- --- roles -----------------------------------------------------------
insert into roles (code, name, description, is_system) values
  ('admin',    'Administrator',   'Full access to everything',                 true),
  ('manager',  'Manager',         'Operations + accounting oversight',         true),
  ('accountant','Accountant',     'Ledger, purchases, payments',               true),
  ('sales',    'Sales / Field',   'Orders, collections, customers',            true),
  ('operator', 'Plant Operator',  'Production entries, stock moves',           true),
  ('viewer',   'Viewer',          'Read-only dashboards',                      true)
on conflict (code) do nothing;

-- --- permission catalogue -------------------------------------------
insert into permissions (code, description) values
  ('settings.manage',   'Edit company settings, branches, financial years'),
  ('roles.manage',      'Manage roles, permissions, user-role assignment'),
  ('accounting.manage', 'Manage chart of accounts & cost centers'),
  ('journal.post',      'Post journal entries (via RPC)'),
  ('journal.view',      'View the ledger & trial balance'),
  ('audit.view',        'View the audit log'),
  ('hr.view',           'View pay configuration'),
  ('hr.manage',         'Edit pay configuration & payroll'),
  ('order.create',      'Create sales orders'),
  ('payment.record',    'Record customer collections'),
  ('customer.manage',   'Create / edit customers & stores'),
  ('purchase.manage',   'Create purchases, GRNs, supplier payments'),
  ('production.record', 'Record production runs & stock moves'),
  ('inventory.view',    'View stock levels & valuation')
on conflict (code) do nothing;

-- --- role → permission matrix ---------------------------------------
-- admin needs no rows (has_permission short-circuits on role 'admin').

-- manager: broad oversight, everything except role/settings hard-admin
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'manager'
   and p.code in ('accounting.manage','journal.post','journal.view','audit.view',
                  'hr.view','order.create','payment.record','customer.manage',
                  'purchase.manage','production.record','inventory.view')
on conflict do nothing;

-- accountant: the ledger + purchasing
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'accountant'
   and p.code in ('accounting.manage','journal.post','journal.view','audit.view',
                  'payment.record','purchase.manage','inventory.view')
on conflict do nothing;

-- sales / field
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'sales'
   and p.code in ('order.create','payment.record','customer.manage','inventory.view')
on conflict do nothing;

-- plant operator
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'operator'
   and p.code in ('production.record','inventory.view')
on conflict do nothing;

-- viewer: read-only surfaces
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join permissions p
 where r.code = 'viewer'
   and p.code in ('journal.view','inventory.view')
on conflict do nothing;


-- >>>>>>>>>>>>>>>>>>>>>>>> seed/0110_seed_chart_of_accounts.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- seed/0110_seed_chart_of_accounts.sql
-- Standard chart of accounts for the water-bottle manufacturing +
-- distribution business. Codes follow the classic 1-5 blocks:
--   1xxx assets · 2xxx liabilities · 3xxx equity · 4xxx income · 5xxx expense
-- normal_side: asset/expense = debit; liability/equity/income = credit.
-- Header (rollup) accounts have is_postable=false. Idempotent.
-- =====================================================================

insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system) values
  -- ---- 1000 ASSETS ----
  ('1000','ASSETS',                     'asset','debit', false, null, true),
  ('1100','Current Assets',             'asset','debit', false, null, true),
  ('1110','Cash in Hand',               'asset','debit', true,  'user_cash', true),
  ('1120','Bank Accounts',              'asset','debit', true,  'bank', true),
  ('1130','Accounts Receivable',        'asset','debit', true,  'customer', true),
  ('1140','Input GST Credit',           'asset','debit', true,  null, true),
  ('1200','Inventory',                  'asset','debit', false, null, true),
  ('1210','Raw Materials',              'asset','debit', true,  null, true),  -- preforms, caps, labels, water
  ('1220','Work in Progress',           'asset','debit', true,  null, true),  -- empty bottles between stages
  ('1230','Finished Goods',             'asset','debit', true,  null, true),  -- filled cases
  ('1240','Packing & Consumables',      'asset','debit', true,  null, true),
  ('1500','Fixed Assets',               'asset','debit', false, null, true),
  ('1510','Plant & Machinery',          'asset','debit', true,  null, true),
  ('1520','Vehicles',                   'asset','debit', true,  null, true),
  ('1590','Accumulated Depreciation',   'asset','credit',true,  null, true),  -- contra-asset

  -- ---- 2000 LIABILITIES ----
  ('2000','LIABILITIES',                'liability','credit', false, null, true),
  ('2100','Current Liabilities',        'liability','credit', false, null, true),
  ('2110','Accounts Payable',           'liability','credit', true,  'supplier', true),
  ('2120','Output GST Payable',         'liability','credit', true,  null, true),
  ('2130','Wages Payable',              'liability','credit', true,  null, true),
  ('2140','User Custody / Float',       'liability','credit', true,  'user', true), -- cash/stock held by staff
  ('2500','Loans',                      'liability','credit', false, null, true),
  ('2510','Equipment Loan (EMI)',       'liability','credit', true,  null, true),  -- principal lives here

  -- ---- 3000 EQUITY ----
  ('3000','EQUITY',                     'equity','credit', false, null, true),
  ('3100','Owner''s Capital',           'equity','credit', true,  null, true),
  ('3200','Retained Earnings',          'equity','credit', true,  null, true),
  ('3900','Opening Balance Equity',     'equity','credit', true,  null, true),

  -- ---- 4000 INCOME ----
  ('4000','INCOME',                     'income','credit', false, null, true),
  ('4100','Sales - Wholesale',          'income','credit', true,  null, true),
  ('4110','Sales - Retail',             'income','credit', true,  null, true),
  ('4200','Other Income',               'income','credit', true,  null, true),
  ('4900','Sales Returns',              'income','debit',  true,  null, true),  -- contra-income

  -- ---- 5000 EXPENSES ----
  ('5000','EXPENSES',                   'expense','debit', false, null, true),
  -- product cost (flows into COGM / inventory valuation)
  ('5100','Cost of Goods Sold',         'expense','debit', true,  null, true),
  ('5110','Material Consumed',          'expense','debit', true,  null, true),
  ('5120','Direct Labour',              'expense','debit', true,  null, true),
  ('5130','Factory Power & Fuel',       'expense','debit', true,  null, true),
  ('5140','Factory Rent',               'expense','debit', true,  null, true),
  ('5150','Depreciation - Plant',       'expense','debit', true,  null, true),
  ('5160','Manufacturing Overhead',     'expense','debit', true,  null, true),
  -- period cost (admin/selling/finance — never in COGM)
  ('5500','Salaries - Admin',           'expense','debit', true,  null, true),
  ('5510','Office Rent',                'expense','debit', true,  null, true),
  ('5520','Office Power & Utilities',   'expense','debit', true,  null, true),
  ('5530','Selling & Distribution',     'expense','debit', true,  null, true),
  ('5540','Vehicle Running',            'expense','debit', true,  null, true),
  ('5600','Loan Interest',              'expense','debit', true,  null, true),  -- EMI interest portion
  ('5610','Bank Charges',               'expense','debit', true,  null, true),
  ('5700','Rounding Off',               'expense','debit', true,  null, true)
on conflict (code) do nothing;

-- wire parent_id from the numeric prefix hierarchy (rollups)
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p
 where p.code = case
     when c.code like '1_00' then '1000'
     when c.code like '2_00' then '2000'
     when c.code like '3_00' then '3000'
     when c.code like '4_00' then '4000'
     when c.code like '5_00' then '5000'
     else null end
   and c.parent_id is null
   and c.code <> p.code;


-- >>>>>>>>>>>>>>>>>>>>>>>> seed/0120_seed_catalog.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- =====================================================================
-- seed/0120_seed_catalog.sql  ·  Phase 1 master data
-- units, categories, a few water SKUs, retail + wholesale price lists.
-- Idempotent.
-- =====================================================================

insert into units (code, name) values
  ('PCS','Pieces'), ('CASE','Case'), ('LTR','Litre'), ('KG','Kilogram'), ('BOX','Box')
on conflict (code) do nothing;

insert into item_categories (code, name) values
  ('WATER','Packaged Drinking Water'),
  ('RM','Raw Materials'),
  ('PACK','Packing & Consumables')
on conflict (code) do nothing;

-- finished goods (sellable cases) + a couple of raw materials
insert into items (sku, name, type, category_id, base_unit_id, pack_size, pack_unit_id,
                   hsn_code, gst_rate, default_price, is_sellable, is_purchasable, is_stocked)
select v.sku, v.name, v.type::item_type, c.id, bu.id, v.pack_size, pu.id,
       v.hsn, v.gst, v.price, v.sell, v.buy, true
from (values
  -- sku,            name,                       type,            cat,     base, pack, packu, hsn,     gst, price, sell, buy
  ('500ML-CASE',  '500ml Bottle - Case of 24', 'finished_good','WATER','CASE', 24, 'PCS','22011010', 18,  120.00, true,  false),
  ('1L-CASE',     '1L Bottle - Case of 12',    'finished_good','WATER','CASE', 12, 'PCS','22011010', 18,  144.00, true,  false),
  ('20L-JAR',     '20L Jar',                   'finished_good','WATER','PCS',   1, 'PCS','22011010', 18,   70.00, true,  false),
  ('PREFORM-24G', 'PET Preform 24g',           'raw_material', 'RM',   'PCS',   1, 'BOX','39232990',  18,    2.40, false, true),
  ('CAP-STD',     'Bottle Cap',                'raw_material', 'RM',   'PCS',   1, 'BOX','39235010',  18,    0.35, false, true),
  ('LABEL-500',   'Label 500ml',               'consumable',   'PACK', 'PCS',   1, 'BOX','48211010',  18,    0.20, false, true)
) as v(sku,name,type,cat,base,pack_size,packu,hsn,gst,price,sell,buy)
join item_categories c on c.code = v.cat
join units bu on bu.code = v.base
join units pu on pu.code = v.packu
on conflict (sku) do nothing;

-- price lists
insert into price_lists (code, name, is_default) values
  ('RETAIL','Retail Price List', true),
  ('WHOLESALE','Wholesale Price List', false)
on conflict (code) do nothing;

-- retail prices (GST-exclusive per base unit)
insert into price_list_items (price_list_id, item_id, unit_price, min_qty)
select pl.id, i.id, v.price, 0
from (values
  ('500ML-CASE', 120.00), ('1L-CASE', 144.00), ('20L-JAR', 70.00)
) as v(sku, price)
join items i on i.sku = v.sku
join price_lists pl on pl.code = 'RETAIL'
on conflict do nothing;

-- wholesale prices + a slab on 20L jars (>=50 jars cheaper)
insert into price_list_items (price_list_id, item_id, unit_price, min_qty)
select pl.id, i.id, v.price, v.minq
from (values
  ('500ML-CASE', 108.00, 0), ('1L-CASE', 130.00, 0),
  ('20L-JAR', 62.00, 0), ('20L-JAR', 58.00, 50)
) as v(sku, price, minq)
join items i on i.sku = v.sku
join price_lists pl on pl.code = 'WHOLESALE'
on conflict do nothing;

-- a sample customer + store (Tamil Nadu, intra-state)
insert into customers (code, name, kind, gstin, state_code, phone, price_list_id, credit_limit, credit_days)
select 'CUST0001','Sri Balaji Stores','wholesale','33ABCDE1234F1Z5','33','9840012345',
       (select id from price_lists where code='WHOLESALE'), 50000, 15
on conflict (code) do nothing;

insert into customer_stores (customer_id, code, name, phone, address_line, area, city, pincode, state_code, is_primary)
select c.id, 'STR0001','Sri Balaji - Main','9840012345','12 Anna Salai','T Nagar','Chennai','600017','33', true
from customers c where c.code = 'CUST0001'
on conflict (code) do nothing;



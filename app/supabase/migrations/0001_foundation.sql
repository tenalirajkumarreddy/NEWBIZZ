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

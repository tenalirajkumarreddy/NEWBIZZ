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

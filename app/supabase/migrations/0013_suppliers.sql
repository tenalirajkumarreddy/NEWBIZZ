-- =====================================================================
-- 0013_suppliers.sql  ·  Phase 2 — supplier master (the buy-side party)
--
-- Mirror of the customer party (0006) but for accounts payable. A supplier is
-- a single legal party; there is no store hierarchy on the buy side. Every
-- supplier's payable posts to AP control 2110 with party_type=supplier,
-- party_id=suppliers.id (the mirror of AR 1130 / customer).
-- =====================================================================

create type supplier_kind as enum ('material','packing','services','asset','utility');

create table suppliers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,             -- 'SUPP0001'
  name           text not null,
  kind           supplier_kind not null default 'material',
  gstin          text,                             -- null for unregistered/composition
  pan            text,
  state_code     text not null default '33',       -- drives interstate (IGST vs CGST/SGST) on bills
  phone          text,
  email          text,
  address_line   text,
  city           text,
  pincode        text,
  -- default commercial terms
  credit_days    int not null default 0,           -- payment terms
  payment_terms  text,                             -- free text ('Net 30', 'Advance', ...)
  -- payable control: AP (2110) keyed by party_type=supplier, party_id=suppliers.id
  status         text not null default 'active',   -- active | on_hold | blacklisted
  notes          text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index suppliers_kind_idx on suppliers (kind) where status = 'active';
comment on table suppliers is 'Buy-side party. AP (2110) is keyed by party_type=supplier, party_id=suppliers.id.';

create trigger suppliers_touch before update on suppliers
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- supplier_opening_balance(supplier, amount, as_of, narration)
-- Seeds an opening payable via the ledger (Invariants 1 & 3), never a direct
-- balance write. Dr Opening Balance Equity (3900) / Cr AP (2110, party=supplier).
-- (Mirror of customer_opening_balance, sides swapped: a payable is a credit.)
-- ---------------------------------------------------------------------
create or replace function supplier_opening_balance(
  p_supplier uuid, p_amount numeric, p_as_of date default current_date, p_narration text default null)
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
                       'narration', coalesce(p_narration,'Opening payable')),
    jsonb_build_array(
      jsonb_build_object('account_code','3900','debit', p_amount, 'credit',0),
      jsonb_build_object('account_code','2110','debit',0,'credit', p_amount,
                         'party_type','supplier','party_id', p_supplier::text)
    ));
  return v_entry;
end $$;

-- ---------------------------------------------------------------------
-- RLS: suppliers readable by any authenticated user; writable with
-- purchase.manage (the buy-side management permission).
-- ---------------------------------------------------------------------
alter table suppliers enable row level security;
create policy read_all_auth on suppliers for select to authenticated using (true);
create policy manage_suppliers on suppliers for all to authenticated
  using (has_permission('purchase.manage')) with check (has_permission('purchase.manage'));

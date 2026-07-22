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

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

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

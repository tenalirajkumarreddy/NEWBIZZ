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

-- 0063_auto_codes.sql
-- Auto-numbering with FY-prefixed codes for documents + entity serials for masters.
--
-- Document codes (replaces next_number format for FY-based doc types):
--   Order:    OD26270001
--   Invoice:  SL26270001
--   Challan:  DC26270001
--   Receipt:  PT26270001
--   PO:       PR26270001
--   Expense:  EX26270001
--
-- Entity codes (yearless — globally unique):
--   Customer: CUS00001
--   Store:    STR00001
--   Supplier: SUP00001
--   Item:     ITM00001
--   Staff:    AP0001

-- =====================================================================
-- 1. Entity serials table (for master records that never reset yearly)
-- =====================================================================
create table if not exists entity_serials (
  entity_type text primary key,
  prefix      text not null,
  pad_width   int not null default 5,
  next_val    bigint not null default 1
);

insert into entity_serials (entity_type, prefix, pad_width, next_val) values
  ('customer', 'CUS', 5, 1),
  ('store',    'STR', 5, 1),
  ('supplier', 'SUP', 5, 1),
  ('item',     'ITM', 5, 1),
  ('staff',    'AP',  4, 1)
on conflict (entity_type) do nothing;

-- =====================================================================
-- 2. next_entity_code — row-locked counter for master records
-- =====================================================================
create or replace function next_entity_code(p_entity_type text)
returns text
language plpgsql
as $$
declare
  v_prefix  text;
  v_pad     int;
  v_val     bigint;
begin
  insert into entity_serials (entity_type, prefix, pad_width, next_val)
  values (
    p_entity_type,
    case p_entity_type
      when 'customer' then 'CUS'
      when 'store'    then 'STR'
      when 'supplier' then 'SUP'
      when 'item'     then 'ITM'
      when 'staff'    then 'AP'
      else upper(left(p_entity_type, 3))
    end,
    case p_entity_type when 'staff' then 4 else 5 end,
    1
  )
  on conflict (entity_type) do nothing;

  select prefix, pad_width, next_val
    into v_prefix, v_pad, v_val
    from entity_serials
   where entity_type = p_entity_type
   for update;

  update entity_serials
     set next_val = next_val + 1
   where entity_type = p_entity_type;

  return v_prefix || lpad(v_val::text, v_pad, '0');
end;
$$;

grant execute on function next_entity_code(text) to authenticated;
grant execute on function next_entity_code(text) to service_role;

-- =====================================================================
-- 3. Enhanced next_number with FY-prefixed codes for doc types
--    Existing prefix-based behaviour preserved for other doc types.
-- =====================================================================
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
  v_fy_code text;
begin
  v_fy := fy_for_date(p_date);

  insert into number_series (doc_type, fy_id)
    values (p_doc_type, v_fy)
    on conflict (doc_type, fy_id) do nothing;

  select next_val, pad_width
    into v_val, v_pad
    from number_series
   where doc_type = p_doc_type and fy_id = v_fy
   for update;

  update number_series
     set next_val = next_val + 1
   where doc_type = p_doc_type and fy_id = v_fy;

  -- Derive FY code: 'FY26-27' → '2627'
  select regexp_replace(code, '[^0-9]', '', 'g') into v_fy_code
    from financial_years where id = v_fy;

  v_prefix := case p_doc_type
    when 'order'   then 'OD' || v_fy_code
    when 'invoice' then 'SL' || v_fy_code
    when 'challan' then 'DC' || v_fy_code
    when 'receipt' then 'PT' || v_fy_code
    when 'po'      then 'PR' || v_fy_code
    when 'expense' then 'EX' || v_fy_code
    when 'payment' then 'PY' || v_fy_code
    else (select prefix from number_series where doc_type = p_doc_type and fy_id = v_fy)
  end;

  return v_prefix || lpad(v_val::text, v_pad, '0');
end;
$$;

-- =====================================================================
-- 4. Seed existing number_series entries with proper prefixes
-- =====================================================================
do $$
declare
  r record;
  v_fy_code text;
begin
  for r in select * from number_series
    where doc_type in ('order', 'invoice', 'challan', 'receipt', 'po', 'expense', 'payment')
  loop
    select regexp_replace(code, '[^0-9]', '', 'g') into v_fy_code
      from financial_years where id = r.fy_id;

    update number_series
       set prefix = case r.doc_type
         when 'order'   then 'OD'
         when 'invoice' then 'SL'
         when 'challan' then 'DC'
         when 'receipt' then 'PT'
         when 'po'      then 'PR'
         when 'expense' then 'EX'
         when 'payment' then 'PY'
       end || v_fy_code
     where id = r.id;
  end loop;
end;
$$;

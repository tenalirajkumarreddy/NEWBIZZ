-- =====================================================================
-- 0057_kind_to_stores.sql  —  Move kind from customers → customer_stores
--
-- Changes:
--   1. Add `kind` column to customer_stores (same customer_kind enum).
--   2. Backfill each store from its parent customer's kind.
--   3. Drop the now-unnecessary customers.kind column + its index.
--   4. Add an index on customer_stores.kind.
--   5. Update convert_lead to write kind to the store, not the customer.
-- =====================================================================

-- 1. Add kind to customer_stores
alter table customer_stores
  add column kind customer_kind not null default 'retail';

-- 2. Backfill from existing customers
update customer_stores cs
   set kind = c.kind
  from customers c
 where cs.customer_id = c.id;

-- 3. Drop customers.kind
drop index if exists customers_kind_idx;
alter table customers alter column kind drop default;
alter table customers drop column kind;

-- 4. Add store-kind index
create index customer_stores_kind_idx
  on customer_stores (kind)
  where status = 'active';

-- 5. Update convert_lead: kind goes on the store, not the customer.
create or replace function convert_lead(
  p_lead uuid, p_customer jsonb default '{}'::jsonb, p_store jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   leads;
  v_cust   uuid;
  v_store  uuid;
  v_ccode  text;
  v_scode  text;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'convert_lead: unknown lead %', p_lead; end if;
  if v_lead.status = 'converted' or v_lead.converted_customer_id is not null then
    raise exception 'convert_lead: lead % already converted', p_lead;
  end if;

  v_ccode := 'CUST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_scode := 'STR-'  || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  -- Customer record — no kind (it lives on the store now)
  insert into customers (code, name, gstin, pan, state_code, phone, email,
                         credit_limit, credit_days, created_by)
  values (v_ccode,
          coalesce(p_customer->>'name', v_lead.company, v_lead.name),
          nullif(p_customer->>'gstin',''),
          nullif(p_customer->>'pan',''),
          coalesce(p_customer->>'state_code','33'),
          coalesce(p_customer->>'phone', v_lead.phone),
          coalesce(p_customer->>'email', v_lead.email),
          coalesce((p_customer->>'credit_limit')::numeric, 0),
          coalesce((p_customer->>'credit_days')::int, 0),
          v_actor)
  returning id into v_cust;

  -- First store — kind comes from p_customer (legacy), p_store (new), or 'retail'
  insert into customer_stores (customer_id, code, name, kind, contact_name, phone,
                               address_line, area, city, pincode, state_code,
                               route_id, created_by)
  values (v_cust, v_scode,
          coalesce(p_store->>'name', 'Main Store'),
          coalesce((p_store->>'kind')::customer_kind, (p_customer->>'kind')::customer_kind, 'retail'),
          coalesce(p_store->>'contact_name', v_lead.name),
          coalesce(p_store->>'phone', v_lead.phone),
          nullif(p_store->>'address_line',''),
          nullif(p_store->>'area',''),
          nullif(p_store->>'city',''),
          nullif(p_store->>'pincode',''),
          coalesce(p_store->>'state_code','33'),
          nullif(p_store->>'route_id','')::uuid,
          v_actor)
  returning id into v_store;

  update leads
     set status = 'converted', converted_customer_id = v_cust, updated_at = now()
   where id = p_lead;

  insert into interactions (lead_id, customer_store_id, type, by_user_id, note)
  values (p_lead, v_store, 'note', v_actor,
          format('Lead converted → customer %s / store %s', v_ccode, v_scode));

  perform write_audit('insert','customers', v_cust::text,
            format('Lead %s converted to customer %s', p_lead, v_ccode),
            jsonb_build_object('lead_id', p_lead, 'customer_code', v_ccode,
                               'store_code', v_scode), v_actor);
  return v_cust;
end $$;

comment on function convert_lead is 'Lead → real customer + first store (masters only, no ledger). Kind now set on the store. §7.3.';

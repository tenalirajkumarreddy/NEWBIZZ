-- 0061_customer_phone_uniqueness_link.sql
-- 1. Enforce unique phone numbers for customers and stores
-- 2. Make customer_id nullable so stores can be unlinked / moved

-- -----------------------------------------------------------------------
-- Phone uniqueness (partial unique indexes — only when phone is populated)
-- -----------------------------------------------------------------------
create unique index customers_phone_unique
  on customers (phone)
  where phone is not null and phone != '';

create unique index customer_stores_phone_unique
  on customer_stores (phone)
  where phone is not null and phone != '';

-- -----------------------------------------------------------------------
-- Make customer_id nullable so stores can be unlinked from a customer
-- and later linked to a different one
-- -----------------------------------------------------------------------
alter table customer_stores alter column customer_id drop not null;

-- Drop the existing FK and recreate it with ON DELETE SET NULL so that
-- deleting a customer doesn't cascade-delete its stores, but unlinks them
alter table customer_stores drop constraint customer_stores_customer_id_fkey;

alter table customer_stores
  add constraint customer_stores_customer_id_fkey
  foreign key (customer_id) references customers(id)
  on delete set null;

-- -----------------------------------------------------------------------
-- Helper RPC: list unlinked stores (customer_id is NULL)
-- -----------------------------------------------------------------------
create or replace function list_unlinked_stores()
returns table (
  id           uuid,
  code         text,
  name         text,
  kind         customer_kind,
  phone        text,
  city         text,
  state_code   text,
  status       text,
  created_at   timestamptz
)
language sql stable
as $$
  select id, code, name, kind, phone, city, state_code, status, created_at
  from customer_stores
  where customer_id is null
  order by created_at desc
$$;

grant execute on function list_unlinked_stores() to authenticated;
grant execute on function list_unlinked_stores() to service_role;

-- -----------------------------------------------------------------------
-- Helper RPC: link a store to a customer (validates both exist)
-- -----------------------------------------------------------------------
create or replace function link_store_to_customer(
  p_store      uuid,
  p_customer   uuid
)
returns text
language plpgsql strict
as $$
begin
  if not exists (select 1 from customers where id = p_customer) then
    return 'Customer not found';
  end if;
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;

  update customer_stores
  set customer_id = p_customer
  where id = p_store;

  return null;
end;
$$;

grant execute on function link_store_to_customer(uuid, uuid) to authenticated;
grant execute on function link_store_to_customer(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------
-- Helper RPC: unlink a store from its customer
-- -----------------------------------------------------------------------
create or replace function unlink_store_from_customer(
  p_store uuid
)
returns text
language plpgsql strict
as $$
begin
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;

  update customer_stores
  set customer_id = null,
      is_primary  = false
  where id = p_store;

  return null;
end;
$$;

grant execute on function unlink_store_from_customer(uuid) to authenticated;
grant execute on function unlink_store_from_customer(uuid) to service_role;

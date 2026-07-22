-- 0062_store_must_have_customer.sql
-- Stores must always belong to a customer. "Unlink" means move to another.

-- Safeguard: if any rows somehow have NULL customer_id, raise an error
do $$
begin
  if exists (select 1 from customer_stores where customer_id is null) then
    raise exception 'Cannot enforce NOT NULL — some stores have NULL customer_id. Fix them first.';
  end if;
end;
$$;

alter table customer_stores alter column customer_id set not null;

-- Remove the unlinked-store concept
drop function if exists list_unlinked_stores;

-- "Unlink" now means "move to another customer"
create or replace function unlink_store_from_customer(
  p_store        uuid,
  p_new_customer uuid
)
returns text
language plpgsql strict
as $$
begin
  if not exists (select 1 from customer_stores where id = p_store) then
    return 'Store not found';
  end if;
  if not exists (select 1 from customers where id = p_new_customer) then
    return 'New customer not found';
  end if;

  update customer_stores
  set customer_id = p_new_customer,
      is_primary  = false
  where id = p_store;

  return null;
end;
$$;

grant execute on function unlink_store_from_customer(uuid, uuid) to authenticated;
grant execute on function unlink_store_from_customer(uuid, uuid) to service_role;

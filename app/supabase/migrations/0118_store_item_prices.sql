-- =====================================================================
-- 0118_store_item_prices_fn
-- Resolved starting price per item for a store (hierarchy: store override
-- -> customer -> store kind -> default -> base). Qty-tiered.
-- =====================================================================
create or replace function public.store_item_prices(p_store uuid, p_items uuid[], p_qty numeric default 1)
returns table (item_id uuid, unit_price numeric)
language sql
stable
set search_path to 'public'
as $function$
  with resolved as (
    select public.resolve_price_list(p_store) as pl_id
  ),
  item_list as (
    select pli.item_id, pli.unit_price, pli.min_qty
    from price_list_items pli, resolved r
    where r.pl_id is not null
      and pli.price_list_id = r.pl_id
      and pli.min_qty <= coalesce(p_qty, 1)
      and (p_items is null or pli.item_id = any (p_items))
  ),
  best as (
    select item_id, unit_price, min_qty,
      row_number() over (partition by item_id order by min_qty desc) as rn
    from item_list
  )
  select i.id as item_id,
         i.name as name,
         coalesce(b.unit_price, i.default_price) as unit_price
  from items i
  left join best b on b.item_id = i.id and b.rn = 1
  where (p_items is null or i.id = any (p_items))
    and i.is_sellable and i.status = 'active';
$function$;

grant execute on function public.store_item_prices(uuid, uuid[], numeric) to authenticated;

-- =====================================================================
-- 0117_price_list_kind_tier
-- Pricing hierarchy: store override -> customer -> STORE KIND -> default.
-- price_lists.kind tags which store kind a list prices (one per kind);
-- resolve_price_list gains the kind tier between customer and default.
-- =====================================================================
alter table public.price_lists add column if not exists kind public.customer_kind;

create unique index if not exists price_lists_kind_uniq
  on public.price_lists(kind) where kind is not null;

update public.price_lists set kind = 'retail' where name ilike '%retail%' and kind is null;
update public.price_lists set kind = 'wholesale' where name ilike '%wholesale%' and kind is null;

create or replace function public.resolve_price_list(p_store uuid)
 returns uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(
    (select s.price_list_id from customer_stores s where s.id = p_store),
    (select c.price_list_id from customer_stores s join customers c on c.id = s.customer_id
      where s.id = p_store),
    (select pl.id from customer_stores s
      join price_lists pl on pl.kind = s.kind and pl.status = 'active'
      where s.id = p_store limit 1),
    (select id from price_lists where is_default and status = 'active' limit 1)
  );
$function$;

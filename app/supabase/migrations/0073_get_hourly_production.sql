create or replace function get_hourly_production(p_date date)
returns table (
  device_id    text,
  device_index int,
  item_sku     text,
  item_name    text,
  item_type    text,
  hour         int,
  total        bigint
)
language sql
stable
set search_path = public
as $$
  select
    pl.device_id,
    pl.device_index,
    i.sku::text as item_sku,
    i.name::text as item_name,
    i.type::text as item_type,
    extract(hour from pl.logged_at at time zone 'Asia/Kolkata')::int as hour,
    sum(pl.quantity)::bigint as total
  from production_logs pl
  join production_device_config pdc
    on pdc.device_id = pl.device_id
   and pdc.device_index = pl.device_index
  join items i on i.id = pdc.item_id
  where pl.logged_at::date = p_date
  group by pl.device_id, pl.device_index, i.sku, i.name, i.type, hour
  order by pl.device_id, pl.device_index, hour;
$$;

comment on function get_hourly_production is
  'Returns hourly production counts for configured devices on a given date.';

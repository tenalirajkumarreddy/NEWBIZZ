-- =====================================================================
-- 0053_order_version_lock.sql
--
-- Adds version optimistic lock to sales_orders and creates update RPCs
-- that check the version to prevent lost updates. (Spec §4.3, Finding #5.)
-- =====================================================================

-- 1. Add version column
alter table sales_orders
  add column if not exists version int not null default 1;

comment on column sales_orders.version is 'Optimistic lock — incremented on every write. Clients must send the version they read; the RPC rejects stale writes.';

-- 2. Update place_order — set version = 1 explicitly
create or replace function place_order(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store    uuid := (p_header->>'store_id')::uuid;
  v_cust     uuid;
  v_pl       uuid;
  v_date     date := coalesce((p_header->>'order_date')::date, current_date);
  v_fy       uuid;
  v_branch   uuid;
  v_order    uuid;
  v_no       text;
  v_line     jsonb;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_price    numeric(14,2);
  v_rate     numeric(5,2);
  v_ln       int := 0;
  v_total    numeric(14,2) := 0;
  v_cc       jsonb;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if v_store is null then raise exception 'place_order: store_id required'; end if;
  select customer_id into v_cust from customer_stores where id = v_store;
  if v_cust is null then raise exception 'place_order: unknown store %', v_store; end if;
  v_fy     := fy_for_date(v_date);
  v_pl     := resolve_price_list(v_store);
  v_branch := coalesce(nullif(p_header->>'branch_id','')::uuid,
                       (select id from branches where code='HO' limit 1));
  v_no     := next_number('order', v_date);

  insert into sales_orders (order_no, fy_id, store_id, customer_id, order_date,
                            price_list_id, branch_id, status, notes, created_by, version)
  values (v_no, v_fy, v_store, v_cust, v_date, v_pl, v_branch, 'confirmed',
          p_header->>'notes', v_actor, 1)
  returning id into v_order;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'place_order: qty must be > 0'; end if;
    v_price := coalesce(nullif(v_line->>'unit_price','')::numeric,
                        effective_price(v_item, v_pl, v_qty));
    select gst_rate into v_rate from items where id = v_item;
    v_ln := v_ln + 1;
    insert into sales_order_lines (order_id, item_id, qty, unit_price, gst_rate, line_no)
      values (v_order, v_item, v_qty, v_price, coalesce(v_rate,0), v_ln);
    v_total := v_total + round(v_qty * v_price, 2);
  end loop;

  v_cc := check_credit_limit(v_cust, v_total);
  if (v_cc->>'exceeded')::boolean then
    if has_permission('credit.override') then
      perform write_audit('approve','sales_orders', v_order::text,
                format('Credit limit override: outstanding %s + order %s = %s, limit %s',
                  v_cc->>'outstanding', v_total, round(v_total + (v_cc->>'outstanding')::numeric, 2),
                  v_cc->>'limit'),
                jsonb_build_object('order_no', v_no, 'total', v_total, 'credit_check', v_cc),
                v_actor);
    else
      raise exception 'Credit limit exceeded: outstanding % + order % = %, limit is %. Ask a manager to override (needs credit.override permission).',
        v_cc->>'outstanding', round(v_total,2), round(v_total + (v_cc->>'outstanding')::numeric,2),
        v_cc->>'limit';
    end if;
  end if;

  perform write_audit('insert','sales_orders', v_order::text,
            format('Order %s for store %s (%s lines, %s)', v_no, v_store, v_ln, v_total),
            jsonb_build_object('order_no', v_no, 'total', v_total, 'credit_check', v_cc), v_actor);
  return v_order;
end $$;

comment on function place_order is 'Create a confirmed sales order with version=1. Enforces credit limit — soft-block with manager override via credit.override permission.';

-- 3. Create update_order with optimistic-lock check
create or replace function update_order(
  p_order_id  uuid,
  p_version   int,
  p_header    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_old from sales_orders where id = p_order_id;
  if not found then raise exception 'update_order: order % not found', p_order_id; end if;
  if p_version <> v_old.version then
    raise exception 'Stale version: current version is %, but caller sent %. Reload and retry.', v_old.version, p_version;
  end if;
  if v_old.status = 'invoiced' then raise exception 'update_order: order % is already invoiced', v_old.order_no; end if;
  if v_old.status = 'cancelled' then raise exception 'update_order: order % is cancelled', v_old.order_no; end if;

  update sales_orders set
    notes      = coalesce(nullif(p_header->>'notes',''), notes),
    updated_at = now(),
    version    = version + 1
  where id = p_order_id and version = p_version;

  if not found then
    raise exception 'Concurrent modification: order % was modified by another user. Reload and retry.', v_old.order_no;
  end if;

  perform write_audit('update','sales_orders', p_order_id::text,
            format('Order %s updated (notes/header)', v_old.order_no),
            jsonb_build_object('order_no', v_old.order_no, 'old_version', p_version, 'new_version', p_version + 1),
            v_actor);
  return p_order_id;
end $$;

comment on function update_order is 'Update order header fields. Checks version for optimistic lock. Rejects if invoiced or cancelled.';

-- 4. Create update_order_line with optimistic-lock check
create or replace function update_order_line(
  p_order_id    uuid,
  p_version     int,
  p_line_id     uuid,
  p_qty         numeric(14,3) default null,
  p_unit_price  numeric(14,2) default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_old from sales_orders where id = p_order_id;
  if not found then raise exception 'update_order_line: order % not found', p_order_id; end if;
  if p_version <> v_old.version then
    raise exception 'Stale version: current version is %, but caller sent %. Reload and retry.', v_old.version, p_version;
  end if;
  if v_old.status = 'invoiced' then raise exception 'update_order_line: order % is invoiced', v_old.order_no; end if;
  if v_old.status = 'cancelled' then raise exception 'update_order_line: order % is cancelled', v_old.order_no; end if;

  update sales_order_lines set
    qty        = coalesce(p_qty, qty),
    unit_price = coalesce(p_unit_price, unit_price)
  where id = p_line_id and order_id = p_order_id;

  if not found then
    raise exception 'Line % not found on order %', p_line_id, v_old.order_no;
  end if;

  update sales_orders set updated_at = now(), version = version + 1
    where id = p_order_id and version = p_version;

  if not found then
    raise exception 'Concurrent modification: order % was modified while updating line. Reload and retry.', v_old.order_no;
  end if;

  perform write_audit('update','sales_order_lines', p_line_id::text,
            format('Line of order %s updated (qty/price)', v_old.order_no),
            jsonb_build_object('order_no', v_old.order_no, 'line_id', p_line_id,
                               'qty', p_qty, 'unit_price', p_unit_price,
                               'old_version', p_version, 'new_version', p_version + 1),
            v_actor);
  return p_line_id;
end $$;

comment on function update_order_line is 'Update a line on a sales order. Checks version for optimistic lock. Rejects if invoiced or cancelled.';

-- 5. Grants
revoke all on function update_order(uuid, int, jsonb) from public, anon;
grant execute on function update_order(uuid, int, jsonb) to authenticated;

revoke all on function update_order_line(uuid, int, uuid, numeric, numeric) from public, anon;
grant execute on function update_order_line(uuid, int, uuid, numeric, numeric) to authenticated;

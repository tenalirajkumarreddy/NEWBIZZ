-- =====================================================================
-- 0064_fulfill_order_as_sale.sql
--
-- Rewrite post_invoice_from_order so that fulfilling an order:
--   • accepts EDITED lines (qty / unit_price) — the form pre-fills from
--     the order lines but the user may adjust actual delivered quantities
--   • accepts p_is_official flag (tax invoice vs cash memo)
--   • marks each sales_order_line.qty_fulfilled = delivered qty
--   • sets the order status:  official → 'invoiced',  cash memo → 'fulfilled'
--
-- This unifies "fulfil order" with "record sale": the sale (invoice or
-- cash memo) IS the fulfilment, linked back to the order via
-- invoices.order_id.  The user deals with the sale thereafter, not the
-- order.
-- =====================================================================

-- Drop the legacy 2-arg signature so the new 4-arg version is unambiguous.
drop function if exists post_invoice_from_order(uuid, date);

create or replace function post_invoice_from_order(
  p_order uuid,
  p_lines jsonb default null,             -- null → use order lines as-is
  p_is_official boolean default true,
  p_date date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o        sales_orders%rowtype;
  v_lines    jsonb;
  v_line     jsonb;
  v_item     uuid;
  v_qty      numeric(14,3);
  v_inv      uuid;
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
begin
  select * into v_o from sales_orders where id = p_order;
  if not found then
    raise exception 'post_invoice_from_order: order % not found', p_order;
  end if;

  if v_o.status in ('invoiced', 'cancelled') then
    raise exception 'post_invoice_from_order: order % is %', v_o.order_no, v_o.status;
  end if;

  -- Lines: explicit payload (edited) or copy from the order's confirmed lines.
  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    v_lines := p_lines;
  else
    select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'unit_price', unit_price)
                     order by line_no)
      into v_lines
      from sales_order_lines
     where order_id = p_order;
  end if;

  -- Post the invoice (revenue + GST + AR + COGS + stock + customer_ledger).
  -- post_invoice sets invoices.order_id and updates the order status itself.
  v_inv := post_invoice(
    jsonb_build_object(
      'store_id',    v_o.store_id::text,
      'branch_id',   v_o.branch_id::text,
      'invoice_date', p_date,
      'order_id',    p_order::text,
      'is_official', p_is_official
    ),
    v_lines
  );

  -- Mark the order lines as fulfilled (qty_fulfilled = delivered qty).
  -- We match by item_id so this works even if line ids aren't passed.
  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_item := (v_line->>'item_id')::uuid;
    v_qty  := (v_line->>'qty')::numeric;
    update sales_order_lines
       set qty_fulfilled = v_qty
     where order_id = p_order
       and item_id   = v_item;
  end loop;

  -- post_invoice sets status = 'invoiced' for any order with order_id.
  -- For unofficial (cash memo) sales we prefer 'fulfilled' — the order is
  -- delivered, no GST invoice document was raised against it.
  if not p_is_official then
    update sales_orders
       set status = 'fulfilled', updated_at = now(), version = version + 1
     where id = p_order;
  end if;

  perform write_audit('post','invoices', v_inv::text,
    format('Order %s fulfilled via % %',
      v_o.order_no,
      case when p_is_official then 'invoice' else 'cash memo' end,
      v_inv),
    jsonb_build_object('order_id', p_order, 'invoice_id', v_inv, 'is_official', p_is_official),
    v_actor);

  return v_inv;
end $$;

comment on function post_invoice_from_order is
  'Fulfil an order by posting the sale (invoice or cash memo).  Lines and is_official are caller-controlled; qty_fulfilled on the order lines is updated.  Official → order ''invoiced''; cash memo → order ''fulfilled''.';

-- Re-grant (the signature changed from (uuid,date) → (uuid,jsonb,boolean,date)).
revoke all on function post_invoice_from_order(uuid, jsonb, boolean, date) from public, anon;
grant execute on function post_invoice_from_order(uuid, jsonb, boolean, date) to authenticated;

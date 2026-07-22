-- =====================================================================
-- 0036_cancel_order.sql  ·  Sell & Collect — cancel a sales order (§4.4)
--
-- The order_status enum has had 'cancelled' since 0008, but no gateway RPC
-- existed to reach it (Invariant 3: every state change goes through a
-- SECURITY DEFINER function, never a raw update). cancel_order closes that
-- gap for the demand document:
--   * only draft/confirmed orders may cancel — an invoiced order already
--     posted value (revenue + GST + AR + stock at WAC); undoing that is a
--     credit-note flow (§7 credit_notes), never an order-status edit;
--   * pure status flip — place_order never touched ledger or stock, so
--     cancelling posts nothing;
--   * audit-logged with the caller's reason.
-- =====================================================================

create or replace function cancel_order(p_order uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status order_status;
  v_no     text;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_order is null then raise exception 'cancel_order: order id required'; end if;

  select status, order_no into v_status, v_no
    from sales_orders where id = p_order for update;
  if v_status is null then
    raise exception 'cancel_order: unknown order %', p_order;
  end if;
  if v_status not in ('draft','confirmed') then
    raise exception 'cancel_order: order % is % — only draft/confirmed orders can be cancelled', v_no, v_status;
  end if;

  update sales_orders
     set status = 'cancelled',
         notes  = case
                    when nullif(trim(coalesce(p_reason,'')),'') is null then notes
                    when notes is null or notes = '' then 'Cancelled: '||trim(p_reason)
                    else notes || E'\n' || 'Cancelled: '||trim(p_reason)
                  end
   where id = p_order;

  perform write_audit('update','sales_orders', p_order::text,
            format('Order %s cancelled%s', v_no,
                   case when nullif(trim(coalesce(p_reason,'')),'') is null
                        then '' else ': '||trim(p_reason) end),
            jsonb_build_object('order_no', v_no, 'from', v_status, 'to', 'cancelled'),
            v_actor);
  return p_order;
end $$;

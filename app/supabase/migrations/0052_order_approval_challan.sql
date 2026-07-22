-- =====================================================================
-- 0052_order_approval_challan.sql
--
-- Adds approved + challan_printed states to order_status and creates
-- the approve_order RPC. (Spec §4.3, audit Finding #4.)
-- =====================================================================

-- 1. Add new enum values (must be outside a transaction block in PG < 14)
alter type order_status add value 'approved' before 'invoiced';
alter type order_status add value 'challan_printed' before 'invoiced';

-- 2. Add orders.approve permission
insert into permissions (code, description) values
  ('orders.approve', 'Approve confirmed orders (move to approved status)')
on conflict (code) do nothing;

-- 3. Create approve_order RPC
create or replace function approve_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order sales_orders%rowtype;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('orders.approve') then
    raise exception 'Permission denied: orders.approve required.';
  end if;

  select * into v_order from sales_orders where id = p_order_id;
  if not found then raise exception 'approve_order: order % not found', p_order_id; end if;
  if v_order.status <> 'confirmed' then
    raise exception 'approve_order: order % is in status %, must be confirmed', v_order.order_no, v_order.status;
  end if;

  update sales_orders set status = 'approved', updated_at = now()
    where id = p_order_id;

  perform write_audit('approve','sales_orders', p_order_id::text,
            format('Order %s approved', v_order.order_no),
            jsonb_build_object('order_no', v_order.order_no, 'order_date', v_order.order_date), v_actor);
  return p_order_id;
end $$;

comment on function approve_order is 'Move a confirmed order to approved status. Requires orders.approve permission. Raises if not found, not confirmed, or missing permission.';

revoke all on function approve_order(uuid) from public, anon;
grant execute on function approve_order(uuid) to authenticated;

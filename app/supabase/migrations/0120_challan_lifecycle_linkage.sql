-- 0120_challan_lifecycle_linkage.sql
-- Challan lifecycle linkage (spec 2026-09-14-challan-lifecycle-design):
--   1. Creator carve-out: whoever raises a challan can always read it (and its
--      lines) even before the office releases it. Mirrors the field-document
--      carve-out 0107 describes for own memos.
--   2. cancel_order cascade: cancelling an order auto-cancels its OPEN
--      (printed/in_transit) challans - those carry zero accounting (value
--      posts only at delivery, 0060). An order with DELIVERED challans can no
--      longer be cancelled (revenue already posted) - error guides the user.
--      Approved orders become cancellable (previously the RPC refused while the
--      web UI offered the button - mismatch fixed here).

-- =====================================================================
-- 1. Read policies: add creator carve-out
-- =====================================================================
drop policy if exists read_challans on public.delivery_challans;
create policy read_challans on public.delivery_challans
  for select to authenticated
  using (
    has_permission('release.manage')
    or (created_by is not null and created_by = public.current_app_user())
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challans.id))
  );

drop policy if exists read_challan_lines on public.delivery_challan_lines;
create policy read_challan_lines on public.delivery_challan_lines
  for select to authenticated
  using (
    has_permission('release.manage')
    or exists (
      select 1 from public.delivery_challans c
      where c.id = delivery_challan_lines.challan_id
        and c.created_by is not null
        and c.created_by = public.current_app_user()
    )
    or (has_permission('challan.view') and public.document_is_released('challans', delivery_challan_lines.challan_id))
  );

-- =====================================================================
-- 2. cancel_order: + approved, + delivered-challan guard, + open-challan cascade
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
  v_delivered int := 0;
  v_cascade   int := 0;
  v_c     record;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('order.cancel') then
    raise exception 'cancel_order: not authorized (order.cancel required)';
  end if;
  if p_order is null then raise exception 'cancel_order: order id required'; end if;

  -- v_actor guard: document_releases.released_by is NOT NULL (0107:57), so the
  -- cascade insert below assumes a session user. That holds by construction:
  -- has_permission() (0031:63) returns false whenever current_app_user() is
  -- null, and v_actor reads the same request.jwt.claim.sub GUC as
  -- current_app_user() (0004:16). Reaching this point therefore implies
  -- v_actor is non-null; no fallback user is invented.

  select status, order_no into v_status, v_no
    from sales_orders where id = p_order for update;
  if v_status is null then
    raise exception 'cancel_order: unknown order %', p_order;
  end if;
  if v_status not in ('draft','confirmed','approved','challan_printed') then
    raise exception 'cancel_order: order % is % - only draft/confirmed/approved/challan_printed orders can be cancelled', v_no, v_status;
  end if;

  select count(*) into v_delivered
    from delivery_challans
    where order_id = p_order and status = 'delivered';
  if v_delivered > 0 then
    raise exception 'cancel_order: order % has delivered challan(s) - revenue is already posted. Deliver the rest or ask the office to reconcile; cancellation is not possible.', v_no;
  end if;

  update sales_orders
     set status = 'cancelled',
          notes  = case
                     when nullif(trim(coalesce(p_reason,'')),'') is null then notes
                     when notes is null or notes = '' then 'Cancelled: '||trim(p_reason)
                     else notes || E'\n' || 'Cancelled: '||trim(p_reason)
                   end
   where id = p_order;

  for v_c in
    select id, challan_no from delivery_challans
     where order_id = p_order and status in ('printed','in_transit')
     for update
  loop
    update delivery_challans set status = 'cancelled' where id = v_c.id;
    insert into document_releases (entity_type, entity_id, released_at, released_by)
      select 'challans', v_c.id, now(), v_actor
      where not exists (
        select 1 from document_releases r
        where r.entity_type = 'challans' and r.entity_id = v_c.id
      );
    perform write_audit('update','delivery_challans', v_c.id::text,
              format('Challan %s auto-cancelled: order %s cancelled', v_c.challan_no, v_no),
              jsonb_build_object('challan_no', v_c.challan_no, 'from', 'printed/in_transit', 'to', 'cancelled', 'order_no', v_no),
              v_actor);
    v_cascade := v_cascade + 1;
  end loop;

  perform write_audit('update','sales_orders', p_order::text,
            format('Order %s cancelled%s%s', v_no,
                   case when nullif(trim(coalesce(p_reason,'')),'') is null
                        then '' else ': '||trim(p_reason) end,
                   case when v_cascade > 0
                        then format(' (%s open challan(s) auto-cancelled)', v_cascade)
                        else '' end),
            jsonb_build_object('order_no', v_no, 'from', v_status, 'to', 'cancelled', 'challans_cancelled', v_cascade),
            v_actor);
  return p_order;
end $$;

revoke all on function cancel_order(uuid, text) from public, anon;
grant execute on function cancel_order(uuid, text) to authenticated;

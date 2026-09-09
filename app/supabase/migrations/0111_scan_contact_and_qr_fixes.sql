-- =====================================================================
-- 0111_scan_contact_and_qr_fixes
--
-- 1. resolve_store_qr: also return store contact fields for the mobile
--    scan card (phone, contact_name, image_url). Body otherwise identical.
-- 2. Data hygiene: QR codes containing whitespace can never be scanned
--    (parseQrPayload rejects whitespace; scanners mangle spaces). Normalize
--    any historical store_qr_codes rows by folding whitespace runs to '-'.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.resolve_store_qr(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := current_app_user();
  v_store customer_stores;
  v_cust  customers;
  v_code  text := btrim(p_code);
  v_open_challans int := 0;
  v_outstanding numeric(14,2) := 0;
  v_status users.status%type;
begin
  if v_uid is null then
    raise exception 'resolve_store_qr: not authenticated';
  end if;

  select status into v_status from users where id = v_uid;
  if v_status is null or v_status in ('suspended','disabled') then
    raise exception 'resolve_store_qr: user not active';
  end if;

  v_code := coalesce(substring(v_code from '/s/([A-Za-z0-9\-_]+)$'), v_code);

  select s.* into v_store
    from store_qr_codes q
    join customer_stores s on s.id = q.store_id
   where q.code = v_code and q.active
   limit 1;

  if v_store.id is null then
    return jsonb_build_object('found', false, 'code', v_code);
  end if;

  select c.* into v_cust from customers c where c.id = v_store.customer_id;

  select count(*) into v_open_challans
    from delivery_challans dc
    join sales_orders so on so.id = dc.order_id
   where so.store_id = v_store.id
     and dc.status = 'in_transit';

  select coalesce(balance_after, 0) into v_outstanding
    from customer_ledger cl
   where cl.customer_id = v_store.customer_id
   order by cl.created_at desc, cl.id desc
   limit 1;

  return jsonb_build_object(
    'found', true,
    'code', v_code,
    'store_id', v_store.id,
    'customer_id', v_store.customer_id,
    'store_name', v_store.name,
    'customer_name', v_cust.name,
    'area', v_store.area,
    'phone', v_store.phone,
    'contact_name', v_store.contact_name,
    'image_url', v_store.image_url,
    'lat', v_store.lat,
    'lng', v_store.lng,
    'outstanding', v_outstanding,
    'open_challans', v_open_challans,
    'can_manage',   has_permission('customer.manage'),
    'can_sell',     (has_permission('cashmemo.create') or has_permission('order.create')),
    'can_collect',  (has_permission('receipt.record') or has_permission('invoice.payment')),
    'can_deliver',  has_permission('challan.record'),
    'can_visit',    has_permission('field.routes')
  );
end $function$;

-- QR values must be space-free to be scannable; fold whitespace to '-'.
update public.store_qr_codes
   set code = regexp_replace(code, '\s+', '-', 'g')
 where code ~ '\s';

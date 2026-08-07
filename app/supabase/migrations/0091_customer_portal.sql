-- =====================================================================
-- 0091_customer_portal.sql  --  Customer Portal (v1)
--
-- Gives a customer a first-class, separate identity principal: they log in
-- with phone-OTP (reusing auth), but they are NOT an internal user and carry
-- NO roles/perms. All portal data flows through SECURITY DEFINER RPCs keyed to
-- `portal_customer_id()` (re-derived from live tables per-request), so a portal
-- principal can only ever see/act as their own customer.
--
-- Model:
--   * customer_portal       -- opt-in per customer (admin enables + phone)
--   * payment_intents       -- customer-submitted "I paid" suggestion (staff reconcile)
--   * portal_* RPCs         -- every portal read/write; the security boundary
--   * custom_access_token_hook extended to stamp portal_customer_id for
--     phone-matching principals (claims = cache; RPCs still re-derive from DB)
--   * internal read RPCs locked so portal principals (no roles) get NULL
--
-- Grants: every new function is granted to `authenticated` only; anon/public
-- REVOKEd. No portal mutation touches the ledger directly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) customer_portal  -- opt-in per customer
-- ---------------------------------------------------------------------
create table if not exists public.customer_portal (
  customer_id     uuid primary key references customers(id) on delete cascade,
  status          text not null default 'inactive', -- inactive | active | suspended
  contact_phone   text,                             -- E.164 digits, no '+', matches auth.users.phone
  contact_email   text,                             -- fallback identity for Google (v2)
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  check (status in ('inactive','active','suspended'))
);

comment on table public.customer_portal is
  'Opt-in per-customer portal principal. status=active enables login via contact_phone.';

create trigger customer_portal_touch before update on public.customer_portal
  for each row execute function public.touch_updated_at();

create index customer_portal_status_idx on public.customer_portal (status) where status = 'active';

alter table public.customer_portal enable row level security;
-- RLS is read-only; writes only via definer RPCs. Internal staff may read portal
-- status; a portal principal must never see the portal registry.
create policy customer_portal_read on public.customer_portal
  for select to authenticated
  using (not public.is_portal_principal());

-- ---------------------------------------------------------------------
-- 2) portal helper RPCs (the security boundary)
-- ---------------------------------------------------------------------

-- Resolve the caller to a customer ONLY if they match an ACTIVE portal row by
-- phone. This is the single identity gate for every portal RPC.
create or replace function public.portal_customer_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select cp.customer_id
    from customer_portal cp
    join auth.users a on a.phone = cp.contact_phone
   where a.id = (nullif(current_setting('request.jwt.claim.sub', true),'')::uuid)
     and cp.status = 'active'
$$;
comment on function public.portal_customer_id is
  'Resolve the caller to a customer ONLY if they match an ACTIVE portal row by phone. NULL otherwise.';

-- True when the current caller is a portal principal (not an internal user).
-- SECURITY DEFINER so it can read auth.users from inside RLS policies (the
-- `authenticated` role cannot query the auth schema directly).
create or replace function public.is_portal_principal()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from customer_portal cp
      join auth.users a on a.phone = cp.contact_phone
     where a.id = (nullif(current_setting('request.jwt.claim.sub', true),'')::uuid)
       and cp.status = 'active'
  )
$$;
comment on function public.is_portal_principal is
  'True when the current JWT (sub) belongs to an active portal customer.';

-- Normalize a phone to E.164 digits WITHOUT '+' (matches auth.users.phone and
-- lib/auth/phone.ts toE164Digits).
create or replace function public.to_e164_storage(p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    nullif(regexp_replace(p_phone, '\D+', '', 'g'), ''),
    null
  )
$$;
comment on function public.to_e164_storage is
  'Strip everything non-digit from a phone; no country-code normalization (matches auth.users.phone).';

-- ---------------------------------------------------------------------
-- 3) admin_enable_customer_portal(customer_id, contact_phone?, active?)
--    The ONLY gateway to turn a customer's portal on/off / change the number.
-- ---------------------------------------------------------------------
create or replace function public.admin_enable_customer_portal(
  p_customer_id uuid,
  p_contact_phone text default null,
  p_active boolean default true
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_phone text;
begin
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'admin_enable_customer_portal: unknown customer %', p_customer_id;
  end if;
  if not public.has_permission('customer.manage') then
    raise exception 'admin_enable_customer_portal: not authorized (customer.manage required)';
  end if;

  v_phone := coalesce(nullif(p_contact_phone,''),
                      (select phone from public.customers where id = p_customer_id));
  if v_phone is null then
    raise exception 'admin_enable_customer_portal: a contact phone is required (set customer phone or pass one)';
  end if;
  v_phone := public.to_e164_storage(v_phone);

  insert into public.customer_portal (customer_id, status, contact_phone, created_by)
  values (p_customer_id, case when p_active then 'active' else 'inactive' end, v_phone, v_actor)
  on conflict (customer_id) do update
    set status       = case when p_active then 'active' else 'inactive' end,
        contact_phone = excluded.contact_phone,
        updated_at   = now();

  perform public.write_audit(
    case when p_active then 'enable' else 'disable' end,
    'customer_portal', p_customer_id::text,
    format('Portal %s for customer %s via %s',
           case when p_active then 'enabled' else 'disabled' end,
           p_customer_id, v_phone),
    jsonb_build_object('contact_phone', v_phone), v_actor);

  return v_phone;
end $$;

-- ---------------------------------------------------------------------
-- 4) payment_intents  (customer-submitted "I paid" suggestion; staff reconcile)
-- ---------------------------------------------------------------------
create table public.payment_intents (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references customers(id),
  amount             numeric(14,2) not null check (amount > 0),
  mode               text not null check (mode in ('cash','upi','cheque','bank')),
  reference          text,
  note               text,
  status             text not null default 'pending', -- pending | matched | void
  matched_receipt_id uuid references customer_receipts(id),
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create index payment_intents_customer_idx on public.payment_intents (customer_id, created_at desc);
create index payment_intents_status_idx on public.payment_intents (status) where status = 'pending';

alter table public.payment_intents enable row level security;
-- Read for staff with receipt/accounting perms (reconcile). Writes via portal RPC.
drop policy if exists payment_intents_read on public.payment_intents;
create policy payment_intents_read on public.payment_intents
  for select to authenticated
  using (public.has_permission('receipt.record') or public.has_permission('accounting.manage'));

-- ---------------------------------------------------------------------
-- 5) portal_* datasource readers / writers. All definer. Reads resolve the
--    caller via portal_customer_id() (client-sent ids ignored). Writes assert
--    the argued customer_id equals portal_customer_id().
-- ---------------------------------------------------------------------

-- (a) profile + outstanding snapshot
create or replace function public.portal_my_profile()
returns table (
  customer_id uuid, code text, name text, gstin text, phone text, email text,
  outstanding numeric(14,2), store_count bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_cust uuid := public.portal_customer_id();
begin
  if v_cust is null then raise exception 'portal: not authenticated'; end if;
  return query
    select c.id, c.code, c.name, c.gstin, c.phone, c.email,
           coalesce((select sum(i.grand_total - i.amount_paid)
                       from invoices i
                      where i.customer_id = c.id and i.status in ('posted','part_paid')), 0),
           s.store_count
      from customers c
      left join lateral (select count(*)::bigint store_count
                          from customer_stores st
                         where st.customer_id = c.id and st.status='active') s on true
     where c.id = v_cust;
end $$;

-- (b) invoices for my customer (all stores). Optional status filter.
create or replace function public.portal_my_invoices(p_status text default null)
returns table (
  id uuid, invoice_no text, invoice_date date, status text,
  store_code text, store_name text,
  taxable_amount numeric(14,2), tax_total numeric(14,2), grand_total numeric(14,2),
  amount_paid numeric(14,2), due numeric(14,2)
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select i.id, i.invoice_no, i.invoice_date, i.status::text,
         st.code, st.name,
         i.taxable_amount,
         i.cgst_amount + i.sgst_amount + i.igst_amount + i.cess_amount as tax_total,
         i.grand_total, i.amount_paid,
         case when i.status in ('posted','part_paid')
              then greatest(i.grand_total - i.amount_paid, 0)
              else 0 end as due
    from invoices i
    join customer_stores st on st.id = i.store_id
   where i.customer_id = public.portal_customer_id()
     and (p_status is null or i.status = p_status::invoice_status)
   order by i.invoice_date desc, i.invoice_no desc
$$;

-- (c) statement via the customer_ledger read-model (scoped to my customer).
create or replace function public.portal_my_statement(
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid, txn_type text, reference_id uuid, reference_type text,
  amount numeric(14,2), balance_after numeric(14,2),
  created_at timestamptz, invoice_no text, receipt_no text, store_name text
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select cl.id, cl.txn_type, cl.reference_id, cl.reference_type,
         cl.amount, cl.balance_after, cl.created_at,
         i.invoice_no::text,
         r.receipt_no::text,
         st.name as store_name
    from customer_ledger cl
    left join invoices i on cl.reference_type = 'invoices' and cl.reference_id = i.id
    left join customer_receipts r on cl.reference_type = 'customer_receipts' and cl.reference_id = r.id
    left join customer_stores st on st.id = coalesce(i.store_id, r.store_id)
   where cl.customer_id = public.portal_customer_id()
   order by cl.created_at desc, cl.id desc
   limit p_limit
   offset p_offset
$$;

-- (d) documents visible to my customer: anything attached to my customer row or
--     any of my stores. Metadata only (no signed URLs here; the UI signs them).
create or replace function public.portal_my_documents()
returns table (
  id uuid, title text, mime_type text, size_bytes bigint, entity_type text,
  entity_id uuid, visibility text, created_at timestamptz, uploaded_by uuid
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select d.id, d.title, d.mime_type, d.size_bytes, d.entity_type, d.entity_id::uuid,
         d.visibility, d.created_at, d.uploaded_by
    from documents d
   where d.entity_type = 'customer' and d.entity_id::uuid = public.portal_customer_id()
      or (d.entity_type = 'store'
          and d.entity_id::uuid in (select st.id from customer_stores st
                                     where st.customer_id = public.portal_customer_id()))
   order by d.created_at desc
$$;

-- (e) catalog for order building (id, sku, name, default price, qty on hand).
--     Uses the caller's effective price list via their primary store.
create or replace function public.portal_catalog()
returns table (
  id uuid, sku text, name text, gst_rate numeric(5,2),
  default_price numeric(14,2), qty_on_hand numeric(14,3)
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select i.id, i.sku, i.name, coalesce(i.gst_rate,0),
         public.effective_price(i.id, public.resolve_price_list_for_portal(), 1),
         public.stock_qty_for_portal(i.id)
    from items i
   where i.status = 'active'
   order by i.name
$$;

-- price-list + stock helpers scoped to the portal customer's primary store
create or replace function public.resolve_price_list_for_portal()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.resolve_price_list(
    (select id from customer_stores
      where customer_id = public.portal_customer_id() and status = 'active'
      order by is_primary desc, name limit 1))
$$;
comment on function public.resolve_price_list_for_portal is
  'Resolve the effective price list for the portal customer (primary store first).';

create or replace function public.stock_qty_for_portal(p_item uuid)
returns numeric(14,3)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(qty_on_hand), 0)
    from stock
   where item_id = p_item
$$;
comment on function public.stock_qty_for_portal is
  'Total on-hand across branches for an item (portal catalog display only).';

-- (f) submit a "payment intention" — a pending suggestion the staff reconciles.
create or replace function public.portal_submit_pay_intent(
  p_amount numeric,
  p_mode text,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cust uuid := public.portal_customer_id();
  v_id   uuid;
begin
  if v_cust is null then raise exception 'portal: not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'portal: amount must be > 0'; end if;
  if p_mode not in ('cash','upi','cheque','bank') then raise exception 'portal: invalid mode'; end if;

  insert into public.payment_intents (customer_id, amount, mode, reference, note, created_by)
  values (v_cust, p_amount, p_mode, nullif(p_reference,''), nullif(p_note,''),
          nullif(current_setting('request.jwt.claim.sub', true),'')::uuid)
  returning id into v_id;
  return v_id;
end $$;

-- my own payment intents (status history)
create or replace function public.portal_my_pay_intents()
returns table (
  id uuid, amount numeric(14,2), mode text, reference text,
  status text, created_at timestamptz
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select pi.id, pi.amount, pi.mode, pi.reference, pi.status, pi.created_at
    from payment_intents pi
   where pi.customer_id = public.portal_customer_id()
   order by pi.created_at desc
$$;

-- (g) create an order against one of MY stores. Pure demand capture (same
--     semantics as place_order: no ledger/stock impact). Asserts the store
--     belongs to the portal customer.
create or replace function public.portal_create_order(
  p_store_id uuid,
  p_lines jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cust uuid := public.portal_customer_id();
  v_pl   uuid;
begin
  if v_cust is null then raise exception 'portal: not authenticated'; end if;
  if p_store_id is null then raise exception 'portal: store required'; end if;
  if (select customer_id from customer_stores where id = p_store_id) is distinct from v_cust then
    raise exception 'portal: store does not belong to your account';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'portal: at least one line required';
  end if;

  return public.place_order(
    jsonb_build_object('store_id', p_store_id, 'notes', coalesce(p_notes,'')),
    p_lines
  );
end $$;

-- my orders (for tracking from the portal)
create or replace function public.portal_my_orders()
returns table (
  id uuid, order_no text, order_date date, status text,
  store_code text, store_name text, notes text, created_at timestamptz
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select o.id, o.order_no, o.order_date, o.status::text,
         st.code, st.name, o.notes, o.created_at
    from sales_orders o
    join customer_stores st on st.id = o.store_id
   where o.customer_id = public.portal_customer_id()
   order by o.order_date desc, o.created_at desc
$$;

-- my active stores (for the order form)
create or replace function public.portal_my_stores()
returns table (
  id uuid, code text, name text, kind public.customer_kind, city text, is_primary boolean
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select st.id, st.code, st.name, st.kind, st.city, st.is_primary
    from customer_stores st
   where st.customer_id = public.portal_customer_id()
     and st.status = 'active'
   order by st.is_primary desc, st.name
$$;

-- ---------------------------------------------------------------------
-- 6) Custom Access Token Hook: stamp portal_customer_id for phone-matching
--    principals. The claim is a cache; every portal RPC re-derives from DB.
--    The hook never overrides an internal principal (roles take precedence).
-- ---------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user   uuid;
  v_status text;
  v_branch uuid;
  v_roles  text[];
  v_perms  text[];
  v_admin  boolean;
  v_tv     int;
  v_portal uuid;
  v_app    jsonb;
begin
  v_user := (event->>'user_id')::uuid;

  select status, branch_id, coalesce(token_version,0)
    into v_status, v_branch, v_tv
    from users where id = v_user;

  -- Unknown profile: still try portal resolution; else bare token.
  if v_status is null then
    select customer_id into v_portal
      from customer_portal cp
      join auth.users a on a.phone = cp.contact_phone
     where a.id = v_user and cp.status = 'active';
    v_app := coalesce(event->'claims'->'app_metadata','{}'::jsonb)
             || jsonb_build_object('user_status',
                                   case when v_portal is not null then 'active' else 'unknown' end,
                                   'token_version',0,
                                   'is_admin',false,
                                   'portal_customer_id', to_jsonb(v_portal));
    return jsonb_set(event, '{claims,app_metadata}', v_app, true);
  end if;

  v_roles := roles_for_user(v_user);
  v_admin := 'admin' = any(v_roles);
  v_perms := perms_for_user(v_user);

  -- Portal resolution: only when the account is NOT an internal principal
  -- (no roles). One phone, one role — never both.
  if v_roles = '{}' then
    select customer_id into v_portal
      from customer_portal cp
      join auth.users a on a.phone = cp.contact_phone
     where a.id = v_user and cp.status = 'active';
    if v_portal is not null then v_status := 'active'; end if;
  end if;

  v_app := coalesce(event->'claims'->'app_metadata','{}'::jsonb) || jsonb_build_object(
    'roles',              to_jsonb(v_roles),
    'perms',              to_jsonb(v_perms),
    'branch_id',          to_jsonb(v_branch),
    'user_status',        v_status,
    'token_version',      v_tv,
    'is_admin',           v_admin,
    'portal_customer_id', to_jsonb(v_portal)
  );

  return jsonb_set(event, '{claims,app_metadata}', v_app, true);
exception
  when others then
    return event;
end $function$;

-- The auth admin needs read on the portal table for the hook lookup.
grant select on public.customer_portal to supabase_auth_admin;

-- ---------------------------------------------------------------------
-- 7) Lock the internal read RPCs so portal principals (zero roles, empty perms)
--    can NEVER pull another customer's data through the internal APIs.
-- ---------------------------------------------------------------------
create or replace function public.get_customer_ledger(
  p_customer_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id             uuid,
  txn_type       text,
  reference_id   uuid,
  reference_type text,
  amount         numeric(14,2),
  balance_after  numeric(14,2),
  created_at     timestamptz,
  invoice_no     text,
  receipt_no     text
)
language plpgsql
security definer
set search_path to 'public'
stable
as $$
begin
  if public.is_portal_principal() then return; end if;
  return query
    select cl.id, cl.txn_type, cl.reference_id, cl.reference_type,
           cl.amount, cl.balance_after, cl.created_at,
           i.invoice_no::text,
           r.receipt_no::text
      from customer_ledger cl
      left join invoices i on cl.reference_type = 'invoices' and cl.reference_id = i.id
      left join customer_receipts r on cl.reference_type = 'customer_receipts' and cl.reference_id = r.id
     where cl.customer_id = p_customer_id
     order by cl.created_at desc, cl.id desc
     limit p_limit offset p_offset;
end $$;

create or replace function public.customer_outstanding_via_ledger(
  p_customer_id uuid
)
returns numeric(14,2)
language plpgsql
security definer
set search_path to 'public'
stable
as $$
declare v_out numeric(14,2);
begin
  if public.is_portal_principal() then return 0; end if;
  select coalesce(balance_after, 0) into v_out
    from customer_ledger
   where customer_id = p_customer_id
   order by created_at desc, id desc
   limit 1;
  return coalesce(v_out, 0);
end $$;

create or replace function public.previous_customer_balance(p_customer_id uuid)
returns numeric(14,2)
language plpgsql
security definer
set search_path to 'public'
stable
as $$
declare v_out numeric(14,2);
begin
  if public.is_portal_principal() then return 0; end if;
  select coalesce(balance_after, 0) into v_out
    from customer_ledger
   where customer_id = p_customer_id
   order by created_at desc, id desc
   limit 1;
  return coalesce(v_out, 0);
end $$;

-- search_customers: identical to the 0087 definition, with one added guard — a
-- portal principal (zero roles) gets an empty result set instead of the full
-- customer list. Keeps the store-name/code/phone search + primary-store kind.
create or replace function public.search_customers(
  p_query text default '',
  p_kind public.customer_kind default null,
  p_status text default null,
  p_limit integer default 500
)
returns table (
  id uuid, code text, name text, gstin text, phone text, image_url text,
  credit_limit numeric, credit_days integer, status text, store_count bigint,
  outstanding numeric, primary_store_kind public.customer_kind
)
language sql
stable
set search_path = public
as $$
    select
      c.id, c.code, c.name, c.gstin, c.phone,
      c.image_url, c.credit_limit, c.credit_days, c.status,
      store_count, outstanding, primary_store_kind
    from (
      with ranked_stores as (
        select customer_id, kind,
               row_number() over (partition by customer_id order by is_primary desc, name) rn
          from customer_stores
         where status = 'active'
      )
      select
        c.id, c.code, c.name, c.gstin, c.phone,
        c.image_url, c.credit_limit, c.credit_days, c.status,
        (select count(*) from customer_stores cs where cs.customer_id = c.id)::bigint as store_count,
        coalesce(customer_outstanding(c.id), 0) as outstanding,
        rs.kind as primary_store_kind
      from customers c
      left join ranked_stores rs on rs.customer_id = c.id and rs.rn = 1
      where (
        p_query = ''
        or c.code ilike '%' || p_query || '%'
        or c.name ilike '%' || p_query || '%'
        or c.phone ilike '%' || p_query || '%'
        or exists (
          select 1 from customer_stores cs2
          where cs2.customer_id = c.id
          and (
            cs2.code ilike '%' || p_query || '%'
            or cs2.name ilike '%' || p_query || '%'
            or cs2.phone ilike '%' || p_query || '%'
          )
        )
      )
      and (p_kind is null or rs.kind = p_kind)
      and (p_status is null or c.status = p_status)
      order by c.name
      limit p_limit
    ) x
    where not public.is_portal_principal()
$$;

-- `search_customers` was previously `security definer`? No — it runs as invoker
-- (non-definer in 0087), so the added is_portal_principal() evaluates the
-- caller correctly. It remains stable and is granted to authenticated below.

-- ---------------------------------------------------------------------
-- 8) Portal-principal isolation: close the raw table API to portal principals.
--    A portal customer is still `authenticated`, and ~85 tables expose
--    read_all_auth: select ... using (true). Without this, a logged-in customer
--    could read EVERYONE'S invoices/stock/ledger via the REST table API.
--
--    Fix is additive & low risk: for every RLS table that has a
--    `to authenticated` SELECT policy, we ALSO add a RESTRICTIVE policy that is
--    FALSE when is_portal_principal() is true. Restrictive ANDs with the
--    existing permissive ones, so internal users are unaffected and portal
--    principals are denied every row of that table on the raw API.
--    (service_role bypasses RLS and is unaffected.)
-- ---------------------------------------------------------------------
DO $$
DECLARE v_schema text; v_tab text; r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.schemaname, p.tablename, t.relrowsecurity, p.policyname
      FROM pg_policies p
      JOIN pg_class t ON t.relname = p.tablename
             AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = p.schemaname)
     WHERE p.schemaname = 'public'
       AND p.policyname IS NOT NULL
       AND p.policyname NOT LIKE 'portal_deny_all%'
  LOOP
    IF r.relrowsecurity THEN
      EXECUTE 'DROP POLICY IF EXISTS portal_deny_all ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename);
      EXECUTE 'CREATE POLICY portal_deny_all ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename)
              || ' AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.is_portal_principal())';
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 9) Grants — authenticated only, anon/public revoked everywhere.
-- ---------------------------------------------------------------------
alter function public.portal_customer_id()                  set search_path = public;
alter function public.is_portal_principal()                 set search_path = public;
alter function public.to_e164_storage(text)                 set search_path = public;
alter function public.admin_enable_customer_portal(uuid,text,boolean) set search_path = public;
alter function public.portal_my_profile()                   set search_path = public;
alter function public.portal_my_invoices(text)              set search_path = public;
alter function public.portal_my_statement(int,int)          set search_path = public;
alter function public.portal_my_documents()                 set search_path = public;
alter function public.portal_catalog()                      set search_path = public;
alter function public.resolve_price_list_for_portal()       set search_path = public;
alter function public.stock_qty_for_portal(uuid)            set search_path = public;
alter function public.portal_submit_pay_intent(numeric,text,text,text) set search_path = public;
alter function public.portal_my_pay_intents()               set search_path = public;
alter function public.portal_create_order(uuid,jsonb,text)  set search_path = public;
alter function public.portal_my_orders()                    set search_path = public;
alter function public.portal_my_stores()                    set search_path = public;
alter function public.get_customer_ledger(uuid,int,int)     set search_path = public;
alter function public.customer_outstanding_via_ledger(uuid) set search_path = public;
alter function public.previous_customer_balance(uuid)       set search_path = public;
alter function public.search_customers(text,customer_kind,text,int) set search_path = public;

revoke all on function public.portal_customer_id()                     from anon, public;
revoke all on function public.is_portal_principal()                    from anon, public;
revoke all on function public.to_e164_storage(text)                    from anon, public;
revoke all on function public.admin_enable_customer_portal(uuid,text,boolean) from anon, public;
revoke all on function public.portal_my_profile()                      from anon, public;
revoke all on function public.portal_my_invoices(text)                 from anon, public;
revoke all on function public.portal_my_statement(int,int)             from anon, public;
revoke all on function public.portal_my_documents()                    from anon, public;
revoke all on function public.portal_catalog()                         from anon, public;
revoke all on function public.resolve_price_list_for_portal()          from anon, public;
revoke all on function public.stock_qty_for_portal(uuid)               from anon, public;
revoke all on function public.portal_submit_pay_intent(numeric,text,text,text) from anon, public;
revoke all on function public.portal_my_pay_intents()                  from anon, public;
revoke all on function public.portal_create_order(uuid,jsonb,text)     from anon, public;
revoke all on function public.portal_my_orders()                       from anon, public;
revoke all on function public.portal_my_stores()                       from anon, public;
revoke all on function public.get_customer_ledger(uuid,int,int)        from anon, public;
revoke all on function public.customer_outstanding_via_ledger(uuid)    from anon, public;
revoke all on function public.previous_customer_balance(uuid)          from anon, public;
revoke all on function public.search_customers(text,customer_kind,text,int) from anon, public;

grant  execute on function public.portal_customer_id()                 to authenticated;
grant  execute on function public.is_portal_principal()                to authenticated;
grant  execute on function public.to_e164_storage(text)                to authenticated;
grant  execute on function public.admin_enable_customer_portal(uuid,text,boolean) to authenticated;
grant  execute on function public.portal_my_profile()                  to authenticated;
grant  execute on function public.portal_my_invoices(text)             to authenticated;
grant  execute on function public.portal_my_statement(int,int)         to authenticated;
grant  execute on function public.portal_my_documents()                to authenticated;
grant  execute on function public.portal_catalog()                     to authenticated;
grant  execute on function public.resolve_price_list_for_portal()      to authenticated;
grant  execute on function public.stock_qty_for_portal(uuid)           to authenticated;
grant  execute on function public.portal_submit_pay_intent(numeric,text,text,text) to authenticated;
grant  execute on function public.portal_my_pay_intents()              to authenticated;
grant  execute on function public.portal_create_order(uuid,jsonb,text) to authenticated;
grant  execute on function public.portal_my_orders()                   to authenticated;
grant  execute on function public.portal_my_stores()                   to authenticated;
grant  execute on function public.get_customer_ledger(uuid,int,int)    to authenticated;
grant  execute on function public.customer_outstanding_via_ledger(uuid) to authenticated;
grant  execute on function public.previous_customer_balance(uuid)      to authenticated;
grant  execute on function public.search_customers(text,customer_kind,text,int) to authenticated;

-- place_order is already granted to authenticated (used by portal_create_order).

-- =====================================================================
-- 0138_numbering_and_field_rpcs.sql
--
-- Recovers objects that exist only in production. Every definition below was
-- dumped from NEWBIZZ with pg_get_functiondef() on 2026-10-21 and is
-- reproduced verbatim; nothing here is rewritten or "improved", because the
-- goal is that a rebuild from this repository produces the database that is
-- actually serving traffic.
--
-- Why these and not others: `issued_numbers` is the only live table that no
-- `create table` in migrations/ or seed/ creates, and it holds 74 real
-- document numbers. It is written by `next_number()` / `next_entity_code()`,
-- which call `_random_digits()` — three functions with no defining file
-- anywhere in the repository. All three are recorded in history as
-- `0050_id_scheme_fy_random`, which was never committed. The four field RPCs
-- (`link_store_qr`, `my_activity`, `my_transfers_and_custody`, `record_visit`)
-- come from the uncommitted mobile `p2_*` / `p3_*` migrations.
--
-- Before this file, a fresh build produced a schema where the mobile app's
-- field endpoints did not exist, where `next_number()` used a different
-- allocation strategy, and where `issued_numbers` was absent entirely — so any
-- document created after a rebuild would have used the repo's numbering rather
-- than the live one.
--
-- Applying this to production is a no-op: every statement either matches the
-- current definition or is already true.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The allocation table
--    Live state: RLS on, no policies, and no grants to anon/authenticated —
--    numbering is reachable only through the SECURITY DEFINER allocators.
-- ---------------------------------------------------------------------
create table if not exists public.issued_numbers (
  doc_number text primary key,
  doc_type   text not null,
  created_at timestamptz not null default now()
);

alter table public.issued_numbers enable row level security;

revoke all on public.issued_numbers from public, anon, authenticated;
grant all on public.issued_numbers to service_role;

comment on table public.issued_numbers is
  'Every document number ever issued, unique across all series. The unique index on doc_number is what makes allocation collision-safe: an allocator retries on unique_violation instead of trusting a sequence.';

-- ---------------------------------------------------------------------
-- 2. Token helpers (from the uncommitted 0050_id_scheme_fy_random)
-- ---------------------------------------------------------------------
create or replace function public._random_digits(p_len integer)
returns text
language sql
set search_path to 'public'
as $$
  select string_agg(floor(random() * 10)::int::text, '')
  from generate_series(1, p_len);
$$;

create or replace function public._random_token(p_len integer)
returns text
language sql
set search_path to 'public'
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
           1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len);
$$;

revoke all on function public._random_digits(integer) from public, anon, authenticated;
grant execute on function public._random_digits(integer) to service_role;

revoke all on function public._random_token(integer) from public, anon, authenticated;
grant execute on function public._random_token(integer) to service_role;

-- ---------------------------------------------------------------------
-- 3. Allocators
--    `0063_auto_codes.sql` shipped an earlier scheme (entity_serials for
--    entity codes, number_series for document numbers). Production runs the
--    later one below for both: statutory series stay gap-free sequential,
--    everything else takes a random token and retries on collision, with the
--    uniqueness guarantee coming from issued_numbers' primary key.
-- ---------------------------------------------------------------------
create or replace function public.next_entity_code(p_entity_type text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prefix text;
  v_len    int;
  v_num    text;
  v_try    int;
begin
  v_prefix := case p_entity_type
    when 'customer' then 'CUS'
    when 'store'    then 'STR'
    when 'supplier' then 'SUP'
    when 'item'     then 'ITM'
    when 'staff'    then 'AP'
    else upper(left(p_entity_type, 3))
  end;
  v_len := case p_entity_type when 'staff' then 4 else 5 end;

  for v_try in 1..100 loop
    v_num := v_prefix || _random_digits(v_len);
    begin
      insert into issued_numbers (doc_number, doc_type)
        values (v_num, 'entity:' || p_entity_type);
      return v_num;
    exception when unique_violation then
      -- collided; try another
    end;
  end loop;
  raise exception 'next_entity_code: could not allocate a unique % code after 100 tries', p_entity_type;
end;
$$;

create or replace function public.next_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fy      uuid;
  v_fy_code text;
  v_base    text;
  v_val     bigint;
  v_seq     boolean;
  v_num     text;
  v_try     int;
begin
  v_fy := fy_for_date(p_date);
  select regexp_replace(code, '[^0-9]', '', 'g') into v_fy_code
    from financial_years where id = v_fy;

  v_base := case p_doc_type
    when 'order'              then 'OD'
    when 'invoice'            then 'SL'
    when 'challan'            then 'DC'
    when 'receipt'            then 'PT'
    when 'po'                 then 'PR'
    when 'expense'            then 'EX'
    when 'payment'            then 'PY'
    when 'bill'               then 'BILL'
    when 'grn'                then 'GRN'
    when 'transfer'           then 'TRF'
    when 'dep_run'            then 'DEP'
    when 'loan'               then 'LOAN'
    when 'fixed_asset'        then 'FA'
    when 'credit_note'        then 'CN'
    when 'debit_note'         then 'DN'
    when 'journal'            then 'JV'
    when 'invoice_unofficial' then 'CM'
    else coalesce(
      (select prefix from number_series where doc_type = p_doc_type and fy_id = v_fy),
      upper(left(p_doc_type, 3)))
  end;

  -- Statutory series stay gap-free sequential (GST + Invariant 8).
  v_seq := p_doc_type in ('invoice', 'credit_note', 'debit_note', 'journal');

  if v_seq then
    insert into number_series (doc_type, fy_id)
      values (p_doc_type, v_fy)
      on conflict (doc_type, fy_id) do nothing;

    select next_val into v_val
      from number_series
     where doc_type = p_doc_type and fy_id = v_fy
     for update;

    update number_series set next_val = next_val + 1
     where doc_type = p_doc_type and fy_id = v_fy;

    v_num := v_base || v_fy_code || lpad(v_val::text, 4, '0');
    insert into issued_numbers (doc_number, doc_type) values (v_num, p_doc_type);
    return v_num;
  end if;

  -- Everything else: random 4-DIGIT token, retry on the rare collision.
  for v_try in 1..100 loop
    v_num := v_base || v_fy_code || _random_digits(4);
    begin
      insert into issued_numbers (doc_number, doc_type) values (v_num, p_doc_type);
      return v_num;
    exception when unique_violation then
      -- collided; try another token
    end;
  end loop;
  raise exception 'next_number: could not allocate a unique % number after 100 tries', p_doc_type;
end;
$$;

-- `next_number` is server-side only; `next_entity_code` is also reachable from
-- a signed-in client because the web app creates customers and items directly.
revoke all on function public.next_number(text, date) from public, anon, authenticated;
grant execute on function public.next_number(text, date) to service_role;

revoke all on function public.next_entity_code(text) from public, anon;
grant execute on function public.next_entity_code(text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Field RPCs (uncommitted mobile p2_* / p3_*)
-- ---------------------------------------------------------------------
create or replace function public.link_store_qr(
  p_store_id uuid,
  p_code text,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := current_app_user();
  v_id uuid;
begin
  if v_uid is null then raise exception 'link_store_qr: not authenticated'; end if;
  if not has_permission('customer.manage') then
    raise exception 'link_store_qr: customer.manage required';
  end if;
  if not exists (select 1 from customer_stores where id = p_store_id) then
    raise exception 'link_store_qr: store % not found', p_store_id;
  end if;

  insert into store_qr_codes (store_id, code, label, created_by)
  values (p_store_id, btrim(p_code), p_label, v_uid)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.my_activity(
  p_from date default (current_date - 30),
  p_to   date default current_date
)
returns table(at timestamptz, action text, entity text, entity_id text, summary text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.at, a.action::text, a.entity, a.entity_id, a.summary
    from audit_log a
   where a.actor_id = current_app_user()
     and a.at >= p_from::timestamptz
     and a.at <  (p_to + 1)::timestamptz
   order by a.at desc
   limit 500;
$$;

create or replace function public.my_transfers_and_custody(
  p_from date default (current_date - 30),
  p_to   date default current_date
)
returns table(
  transfer_id   uuid,
  transfer_no   text,
  type          text,
  status        text,
  from_user_id  uuid,
  to_user_id    uuid,
  amount        numeric,
  note          text,
  created_at    timestamptz,
  responded_at  timestamptz,
  cash_in_hand  numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := current_app_user();
  v_cash numeric(14,2) := 0;
begin
  if v_uid is null then
    return;
  end if;

  select coalesce(sum(jl.debit - jl.credit), 0)
    into v_cash
    from journal_lines jl
    join chart_of_accounts coa on coa.id = jl.account_id
   where coa.code = '2140'
     and jl.party_type = 'user'
     and jl.party_id = v_uid;

  return query
    select t.id, t.transfer_no, t.type, t.status,
           t.from_user_id, t.to_user_id, t.amount, t.note,
           t.created_at, t.responded_at,
           v_cash
      from transfers t
     where (t.from_user_id = v_uid or t.to_user_id = v_uid)
       and t.created_at >= p_from::timestamptz
       and t.created_at <  (p_to + 1)::timestamptz
     order by t.created_at desc
     limit 300;
end $$;

create or replace function public.record_visit(
  p_store_id     uuid,
  p_lat          numeric default null,
  p_lng          numeric default null,
  p_visit_type   text default 'mark_visited',
  p_duration_min integer default 5
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := current_app_user();
  v_session uuid;
  v_route uuid;
  v_vt visit_type;
  v_id uuid;
begin
  if v_uid is null then raise exception 'record_visit: not authenticated'; end if;
  if not has_permission('field.routes') then
    raise exception 'record_visit: field.routes required';
  end if;
  if not exists (select 1 from customer_stores where id = p_store_id) then
    raise exception 'record_visit: store not found';
  end if;

  v_vt := coalesce(nullif(p_visit_type,'')::visit_type, 'mark_visited');

  -- reuse the agent's open session, else start one on a default route
  select id into v_session
    from route_sessions
   where agent_id = v_uid and status = 'active'
   order by started_at desc limit 1;

  if v_session is null then
    select id into v_route from routes where is_default limit 1;
    if v_route is null then
      insert into routes (name, is_default, status, created_by)
      values ('Field visits', true, 'active', v_uid)
      returning id into v_route;
    end if;
    insert into route_sessions (route_id, agent_id, status, started_at, stores_planned,
                                stores_completed, total_distance_km, total_duration_min, created_by)
    values (v_route, v_uid, 'active', now(), 0, 0, 0, 0, v_uid)
    returning id into v_session;
  end if;

  insert into visits (route_session_id, customer_store_id, agent_id, visited_at,
                      visit_type, lat, lng, duration_min)
  values (v_session, p_store_id, v_uid, now(), v_vt, p_lat, p_lng, coalesce(p_duration_min,5))
  returning id into v_id;

  -- first GPS fix seeds the store's coordinates (used for directions later)
  if p_lat is not null and p_lng is not null then
    update customer_stores
       set lat = coalesce(lat, p_lat),
           lng = coalesce(lng, p_lng)
     where id = p_store_id;
  end if;

  perform write_audit('insert','visits', v_id::text,
    format('Visit recorded (%s)', v_vt),
    jsonb_build_object('store_id', p_store_id, 'gps', (p_lat is not null)));

  return v_id;
end $$;

revoke all on function public.link_store_qr(uuid, text, text) from public, anon;
grant execute on function public.link_store_qr(uuid, text, text) to authenticated, service_role;

revoke all on function public.my_activity(date, date) from public, anon;
grant execute on function public.my_activity(date, date) to authenticated, service_role;

revoke all on function public.my_transfers_and_custody(date, date) from public, anon;
grant execute on function public.my_transfers_and_custody(date, date) to authenticated, service_role;

revoke all on function public.record_visit(uuid, numeric, numeric, text, integer) from public, anon;
grant execute on function public.record_visit(uuid, numeric, numeric, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. The superseded two-argument price lookup
--
-- `0118` added `store_item_prices(uuid, uuid[], numeric)` and the app calls
-- that. Production still carries the older two-argument overload, which
-- returns a DIFFERENT shape (no `name`), and an exact-arity match wins
-- resolution — so an old client asking for two columns keeps working there.
-- It is reproduced here only so a rebuild is not missing it; dropping it is a
-- separate decision that has to wait until no deployed client calls it.
-- ---------------------------------------------------------------------
create or replace function public.store_item_prices(p_store uuid, p_items uuid[])
returns table(item_id uuid, unit_price numeric)
language sql
stable
set search_path to 'public'
as $$
  select i.id,
         coalesce(
           (select pli.unit_price
              from price_list_items pli
             where pli.price_list_id = resolve_price_list(p_store)
               and pli.item_id = i.id
             order by pli.min_qty desc limit 1),
           i.default_price)
    from items i
   where i.id = any(p_items);
$$;

create or replace function public.store_item_prices(
  p_store uuid,
  p_items uuid[],
  p_qty   numeric default 1
)
returns table(item_id uuid, name text, unit_price numeric)
language sql
stable
set search_path to 'public'
as $$
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
$$;

-- Prices are public catalogue data reachable before sign-in (the portal price
-- lookup), so these keep production's anon grant.
grant execute on function public.store_item_prices(uuid, uuid[]) to anon, authenticated, service_role;
grant execute on function public.store_item_prices(uuid, uuid[], numeric) to anon, authenticated, service_role;

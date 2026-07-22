-- 0050_party_profiles.sql
-- Customer/store profiles: images, per-store outstanding, and a unified
-- chronological ledger ("passbook") that interleaves invoices, receipts, credit
-- notes, orders and visits for a customer (optionally scoped to one store).
-- Money truth stays in journal_lines; these are read helpers over the AUTH docs.

-- 1) Image URL columns (points at the party-images storage bucket, or any URL).
alter table customers        add column if not exists image_url text;
alter table customer_stores  add column if not exists image_url text;

-- 2) Public storage bucket for customer/store photos. Public read (so <img> works
--    without signed URLs); authenticated users manage objects.
insert into storage.buckets (id, name, public)
values ('party-images', 'party-images', true)
on conflict (id) do nothing;

do $pol$ begin
  create policy "party-images read"   on storage.objects for select using (bucket_id = 'party-images');
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy "party-images insert" on storage.objects for insert to authenticated with check (bucket_id = 'party-images');
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy "party-images update" on storage.objects for update to authenticated using (bucket_id = 'party-images');
exception when duplicate_object then null; end $pol$;
do $pol$ begin
  create policy "party-images delete" on storage.objects for delete to authenticated using (bucket_id = 'party-images');
exception when duplicate_object then null; end $pol$;

-- 3) Per-store outstanding — same shape as customer_outstanding but scoped to
--    invoices raised against one store.
create or replace function store_outstanding(p_store uuid)
returns numeric
language sql stable set search_path to 'public'
as $fn$
  select coalesce(sum(invoice_outstanding(i.id)), 0)
    from invoices i
   where i.store_id = p_store and i.status in ('posted','part_paid');
$fn$;

-- 4) Unified chronological activity feed ("passbook"). One row per business
--    event; `debit` raises the receivable (invoices), `credit` reduces it
--    (receipts, credit notes); orders and visits are zero-value activity rows
--    for context. Named customer_activity (NOT customer_ledger — that is an
--    existing maintained sale/payment read-model TABLE). Running balance is
--    computed by the caller in date order.
create or replace function customer_activity(
  p_customer uuid,
  p_store uuid default null,
  p_from date default null,
  p_to date default null)
returns table (
  event_date date,
  event_ts   timestamptz,
  kind       text,          -- invoice | receipt | credit_note | order | visit
  ref_id     uuid,
  ref_no     text,
  store_id   uuid,
  store_name text,
  description text,
  debit      numeric,
  credit     numeric,
  status     text
)
language sql stable set search_path to 'public'
as $fn$
  with rows as (
    -- Invoices (debit = grand total)
    select i.invoice_date as event_date, i.created_at as event_ts, 'invoice'::text as kind,
           i.id as ref_id, i.invoice_no as ref_no, i.store_id,
           s.name as store_name,
           'Sale invoice'::text as description,
           i.grand_total as debit, 0::numeric as credit, i.status::text as status
      from invoices i
      left join customer_stores s on s.id = i.store_id
     where i.customer_id = p_customer and i.status <> 'void'
       and (p_store is null or i.store_id = p_store)

    union all
    -- Customer receipts (credit = amount collected)
    select r.receipt_date, r.created_at, 'receipt',
           r.id, r.receipt_no, r.store_id,
           s.name,
           ('Payment received ('||r.mode||')')::text,
           0::numeric, r.amount, r.status::text
      from customer_receipts r
      left join customer_stores s on s.id = r.store_id
     where r.customer_id = p_customer and r.status = 'posted'
       and (p_store is null or r.store_id = p_store)

    union all
    -- Credit notes (credit = amount; reduces receivable)
    select coalesce(cn.created_at::date, current_date), cn.created_at, 'credit_note',
           cn.id, cn.credit_note_no, cn.customer_store_id,
           s.name,
           ('Credit note ('||cn.reason||')')::text,
           0::numeric, cn.amount, cn.status::text
      from credit_notes cn
      left join customer_stores s on s.id = cn.customer_store_id
     where cn.customer_id = p_customer and cn.status = 'posted'
       and (p_store is null or cn.customer_store_id = p_store)

    union all
    -- Sales orders (activity; no ledger effect)
    select o.order_date, o.created_at, 'order',
           o.id, o.order_no, o.store_id,
           s.name,
           ('Order placed')::text,
           0::numeric, 0::numeric, o.status::text
      from sales_orders o
      left join customer_stores s on s.id = o.store_id
     where s.customer_id = p_customer and o.status <> 'cancelled'
       and (p_store is null or o.store_id = p_store)

    union all
    -- Field visits (activity; scoped by store only)
    select v.visited_at::date, v.visited_at, 'visit',
           v.id, null::text, v.customer_store_id,
           s.name,
           ('Visit'||coalesce(' — '||v.visit_type::text,''))::text,
           0::numeric, 0::numeric, null::text
      from visits v
      join customer_stores s on s.id = v.customer_store_id
     where s.customer_id = p_customer
       and (p_store is null or v.customer_store_id = p_store)
  )
  select event_date, event_ts, kind, ref_id, ref_no, store_id, store_name,
         description, debit, credit, status
    from rows
   where (p_from is null or event_date >= p_from)
     and (p_to   is null or event_date <= p_to)
   order by event_date asc, event_ts asc;
$fn$;

revoke all on function store_outstanding(uuid) from anon;
revoke all on function customer_activity(uuid, uuid, date, date) from anon;
grant execute on function store_outstanding(uuid) to authenticated;
grant execute on function customer_activity(uuid, uuid, date, date) to authenticated;

-- =====================================================================
-- 0039_order_fulfilment_states.sql
--
-- BACKFILLED 2026-10-20. This migration was applied to the NEWBIZZ project
-- (supabase_migrations: 0039_order_fulfilment_states, 2026-07-20) but was
-- never committed, so no fresh database could reproduce it. Every object below
-- was read back from the production catalog (columns, defaults, FKs and enum
-- labels); the SQL is reconstructed, not the original text.
--
-- What it introduces: an order can be delivered in pieces. Each line tracks how
-- much has actually gone out (`qty_fulfilled`) and the order moves to
-- partially_fulfilled / fulfilled. A short delivery can spawn a follow-up
-- order, which is linked back through followup_order_id / parent_order_id.
-- =====================================================================

alter type order_status add value if not exists 'fulfilled';
alter type order_status add value if not exists 'partially_fulfilled';

alter table sales_order_lines
  add column if not exists qty_fulfilled numeric(14,3) not null default 0;

alter table sales_orders
  add column if not exists followup_order_id uuid references sales_orders(id),
  add column if not exists parent_order_id   uuid references sales_orders(id);

create index if not exists sales_orders_followup_order_id_idx
  on sales_orders (followup_order_id);
create index if not exists sales_orders_parent_order_id_idx
  on sales_orders (parent_order_id);

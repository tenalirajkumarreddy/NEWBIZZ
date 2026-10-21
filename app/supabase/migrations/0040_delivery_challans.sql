-- =====================================================================
-- 0040_delivery_challans.sql
--
-- BACKFILLED 2026-10-20. Applied to the NEWBIZZ project on 2026-07-20
-- (supabase_migrations: 0040_delivery_challans) but never committed; tables,
-- columns, FKs, checks and indexes below were read back from the production
-- catalog. The original policy text is not recoverable: production's current
-- challan policies were written later by 0107_fine_grained_release, which
-- starts by dropping `read_all_auth` from this table — so that is the policy
-- this migration creates.
--
-- A challan is the paper the driver carries: it moves goods, not value. The
-- accounting event is still the invoice or the delivery posting, so cancelling
-- a challan never reverses a journal.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'challan_status') then
    create type challan_status as enum ('printed','in_transit','delivered','cancelled');
  end if;
end $$;

create table if not exists delivery_challans (
  id              uuid primary key default gen_random_uuid(),
  challan_no      text not null,
  fy_id           uuid not null references financial_years(id),
  order_id        uuid not null references sales_orders(id),
  branch_id       uuid not null references branches(id),
  agent_id        uuid references users(id),
  status          challan_status not null default 'printed',
  eway_bill_no    text,
  notes           text,
  printed_at      timestamptz not null default now(),
  dispatched_at   timestamptz,
  delivered_at    timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  constraint delivery_challans_fy_id_challan_no_key unique (fy_id, challan_no)
);

create table if not exists delivery_challan_lines (
  id            uuid primary key default gen_random_uuid(),
  challan_id    uuid not null references delivery_challans(id) on delete cascade,
  order_line_id uuid not null references sales_order_lines(id),
  item_id       uuid not null references items(id),
  qty           numeric(14,3) not null check (qty > 0),
  line_no       integer not null default 1
);

create index if not exists delivery_challans_order_idx                on delivery_challans (order_id);
create index if not exists delivery_challans_branch_id_idx            on delivery_challans (branch_id);
create index if not exists delivery_challans_agent_id_idx             on delivery_challans (agent_id);
create index if not exists delivery_challans_status_idx               on delivery_challans (status);
create index if not exists delivery_challans_created_by_idx           on delivery_challans (created_by);
create index if not exists delivery_challan_lines_challan_idx         on delivery_challan_lines (challan_id);
create index if not exists delivery_challan_lines_item_id_idx         on delivery_challan_lines (item_id);
create index if not exists delivery_challan_lines_order_line_id_idx   on delivery_challan_lines (order_line_id);

alter table delivery_challans      enable row level security;
alter table delivery_challan_lines enable row level security;

-- Superseded by 0107 (read_challans) and 0120 (creator carve-out).
drop policy if exists read_all_auth on delivery_challans;
create policy read_all_auth on delivery_challans
  for select to authenticated using (true);

drop policy if exists read_all_auth on delivery_challan_lines;
create policy read_all_auth on delivery_challan_lines
  for select to authenticated using (true);

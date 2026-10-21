-- =====================================================================
-- 0110b_store_qr_codes.sql
--
-- BACKFILLED 2026-10-20. 0111 rewrites the codes in this table, but the
-- migration that created it was applied to production (p3_scan_contact_and_qr)
-- and never committed. Column set, unique code, indexes and policies read back
-- from the production catalog.
--
-- One active sticker per store, printed on site: the code is what the field app
-- scans to resolve a customer store to a contact.
-- =====================================================================

create table if not exists public.store_qr_codes (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.customer_stores(id) on delete cascade,
  code        text not null,
  label       text,
  active      boolean not null default true,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  constraint store_qr_codes_code_key unique (code)
);

create index if not exists store_qr_codes_store_idx on public.store_qr_codes (store_id);
create index if not exists store_qr_codes_code_idx  on public.store_qr_codes (code) where active;

alter table public.store_qr_codes enable row level security;

drop policy if exists "sqc read authenticated" on public.store_qr_codes;
create policy "sqc read authenticated" on public.store_qr_codes
  for select to authenticated using (true);

drop policy if exists "sqc write customer managers" on public.store_qr_codes;
create policy "sqc write customer managers" on public.store_qr_codes
  for all to authenticated
  using (public.has_permission('customer.manage'))
  with check (public.has_permission('customer.manage'));

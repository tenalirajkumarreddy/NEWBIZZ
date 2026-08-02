-- =====================================================================
-- 0082_enable_rls_ledger_serials.sql   Close the RLS gap (advisory ERROR)
--
-- The security linter flagged two pre-existing tables with RLS disabled:
--
--   customer_ledger  - per-customer receivable read-model. All reads go
--                      through SECURITY DEFINER RPCs (get_customer_ledger,
--                      customer_outstanding_via_ledger, previous_customer_balance);
--                      all writes through definer RPCs (post_invoice,
--                      rebuild_customer_ledger, ...). No direct client access.
--   entity_serials   - master-code prefix/counter rows, read directly by
--                      authenticated users (settings -> listEntitySerials).
--                      Allocation itself happens in next_entity_code, which
--                      is SECURITY DEFINER and writes issued_numbers.
--
-- Fix (matches the repo convention on customers/customer_stores): enable
-- RLS and grant authenticated users a read_all_auth SELECT policy. No
-- INSERT/UPDATE/DELETE policies - every write stays behind a definer RPC
-- (least privilege). service_role is unaffected (bypasses RLS).
-- =====================================================================

alter table customer_ledger enable row level security;
alter table entity_serials  enable row level security;

create policy read_all_auth on customer_ledger for select to authenticated using (true);
create policy read_all_auth on entity_serials  for select to authenticated using (true);

comment on policy read_all_auth on customer_ledger is 'Authenticated users may read the AR read-model; writes are definer-RPC only.';
comment on policy read_all_auth on entity_serials  is 'Authenticated users may read code counters; allocation is definer-RPC only.';

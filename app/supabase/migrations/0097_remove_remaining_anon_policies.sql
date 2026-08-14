-- =====================================================================
-- 0097_remove_remaining_anon_policies.sql
--
-- Sequel to 0096: the Intangles poller now runs as the RLS-bypassing
-- service_role key (lib/supabase/service.ts), so the TO anon RLS policies
-- added in 0076 are no longer needed -- and they are a live exposure:
-- they let ANY unauthenticated caller read/write GPS snapshots, trips,
-- fuel refills and vehicle/warehouse master data over the REST API.
--
-- This migration:
--   * drops the 0076 anon policies on the fleet telemetry tables
--     (the authenticated UI policies remain untouched), and
--   * revokes anon + PUBLIC EXECUTE from the admin data RPCs that had
--     either been anon-exposed by design or drifted public/anonymous
--     (`create or replace function` re-defaults EXECUTE to PUBLIC in
--     these postgres versions), leaving them on authenticated+service_role.
--
-- KEPT anonymous (genuinely keyless infra):
--   * insert_production_log, insert_production_logs_batch (ESP32 devices)
--   * next_device_index                                (ESP32 provisioning)
--   * invitation_for_phone                             (anonymous login screen)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop obsolete TO anon RLS policies (0076)
-- ---------------------------------------------------------------------
drop policy if exists read_all_anon            on vehicles;
drop policy if exists read_all_anon            on vehicle_gps_logs;
drop policy if exists insert_from_poller       on vehicle_gps_logs;
drop policy if exists read_all_anon            on branches;
drop policy if exists read_all_anon            on trips;
drop policy if exists manage_from_poller       on trips;
drop policy if exists manage_from_poller_update on trips;
drop policy if exists read_all_anon            on fuel_refill_events;
drop policy if exists insert_from_poller       on fuel_refill_events;

-- ---------------------------------------------------------------------
-- 2. Revoke anon/PUBLIC from admin data RPCs; regrant to app roles
-- ---------------------------------------------------------------------
revoke execute on function public.customer_activity(uuid, uuid, date, date)             from public, anon;
revoke execute on function public.get_hourly_production(date)                            from public, anon;
revoke execute on function public.link_store_to_customer(uuid, uuid)                     from public, anon;
revoke execute on function public.search_customers(text, customer_kind, text, int)       from public, anon;
revoke execute on function public.store_outstanding(uuid)                                from public, anon;
revoke execute on function public.unlink_store_from_customer(uuid)                       from public, anon;
revoke execute on function public.unlink_store_from_customer(uuid, uuid)                 from public, anon;

grant execute on function public.customer_activity(uuid, uuid, date, date)               to authenticated, service_role;
grant execute on function public.get_hourly_production(date)                             to authenticated, service_role;
grant execute on function public.link_store_to_customer(uuid, uuid)                      to authenticated, service_role;
grant execute on function public.search_customers(text, customer_kind, text, int)        to authenticated, service_role;
grant execute on function public.store_outstanding(uuid)                                 to authenticated, service_role;
grant execute on function public.unlink_store_from_customer(uuid)                        to authenticated, service_role;
grant execute on function public.unlink_store_from_customer(uuid, uuid)                  to authenticated, service_role;
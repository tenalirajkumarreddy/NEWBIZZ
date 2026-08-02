-- =====================================================================
-- 0079_fix_license_expiry_scan.sql
-- Fix a latent PL/pgSQL ambiguity in license_expiry_scan(): its OUT column
-- `expiry_date` collides with licenses.expiry_date, so the internal
-- `update licenses ... where expiry_date < current_date` raised 42702
-- ("column reference is ambiguous") the first time notification_daily_scan()
-- called it. Qualify the column references.
-- =====================================================================

create or replace function license_expiry_scan()
returns table (id uuid, type license_type, license_no text, expiry_date date,
               days_to_expiry int, is_expired boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- flip anything past expiry to 'expired' (unless a renewal is already in progress)
  update licenses
     set status = 'expired', updated_at = now()
   where licenses.expiry_date < current_date and licenses.status = 'active';

  return query select * from licenses_due(current_date);
end $$;
comment on function license_expiry_scan is 'Daily: mark lapsed licenses expired, return the renewal-alert set. Idempotent.';

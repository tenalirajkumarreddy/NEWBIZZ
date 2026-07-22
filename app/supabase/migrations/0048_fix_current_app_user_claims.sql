-- 0048_fix_current_app_user_claims.sql
-- Fix: current_app_user() only read the legacy singular GUC
-- request.jwt.claim.sub, which current PostgREST/GoTrue no longer populates —
-- it sets the JSON blob request.jwt.claims instead. Result: current_app_user()
-- returned NULL for every real request, so has_permission() denied everything
-- ("not authorized" across the app despite a correctly-seeded admin user).
-- Mirror auth.uid(): coalesce the singular GUC with claims->>'sub'.
create or replace function public.current_app_user()
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$function$;

-- =====================================================================
-- app/supabase/checks/function_manifest.sql
--
-- One stable line per public function, so two databases of the same
-- schema can be compared by plain `diff`. Stopgap for the drift that
-- §B5 of the go-live audit described: production accumulated objects
-- that the repository could not reproduce, and nothing detected it.
--
--   psql "$PROD" -tA -f function_manifest.sql > prod.txt
--   psql "$STAGING" -tA -f function_manifest.sql > staging.txt
--   diff prod.txt staging.txt
--
-- Or use function_drift.sh, which does the three steps and exits 1 on
-- any difference.
--
-- What is compared, and why:
--   * the signature, so a renamed argument or a changed type shows up;
--   * proseccdef / provolatile / proconfig, because a function that is
--     SECURITY DEFINER with a pinned search_path is a different security
--     object from an invoker function with none, even if the body is
--     identical;
--   * the body, normalised first. Formatting alone must never be
--     reported, because then the check is noise and gets ignored:
--       -- comments and /* block comments */ are removed
--       bare `null;` statements are removed (they are how an empty
--         exception handler is spelled in one place and a comment in
--         another)
--       all whitespace is removed
--
-- Extension-owned functions are excluded: pgcrypto lives in `public` on
-- some servers and in `extensions` on others, which is a packaging
-- difference, not drift. pg_depend is the authoritative test for
-- "belongs to an extension", so no function name is hard-coded here.
--
-- Read-only: every statement is a SELECT.
-- =====================================================================

select p.proname
       || '('
       || pg_get_function_identity_arguments(p.oid)
       || ')|definer='
       || case when p.prosecdef then 'yes' else 'no' end
       || '|volatile='
       || p.provolatile::text
       || '|config='
       || coalesce(array_to_string(p.proconfig, ','), '')
       || '|body='
       || md5(regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'),
                '/\*.*?\*/', '', 'gs'),
              '\mnull;', '', 'g'),
            '\s+', '', 'g'))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not exists (
     select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid
        and d.deptype = 'e')
 order by 1;

-- 0049_rpc_actor_via_current_app_user.sql
-- The 56 SECURITY DEFINER RPCs read their actor via the legacy singular GUC
-- nullif(current_setting('request.jwt.claim.sub', true),'')::uuid — which is
-- NULL on real PostgREST requests (they set request.jwt.claims JSON instead).
-- That broke audit_log actor, created_by/posted_by, and holdings attribution.
-- current_app_user() was fixed in 0048 to read both forms; rewrite each RPC to
-- call it instead of the raw GUC. Metaprogrammed so all stay in exact sync.
-- pg_get_functiondef preserves SECURITY DEFINER + search_path + grants.
do $mig$
declare
  r        record;
  v_def    text;
  v_newdef text;
  v_old    constant text := 'nullif(current_setting(''request.jwt.claim.sub'', true),'''')::uuid';
  v_new    constant text := 'current_app_user()';
  v_count  int := 0;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname <> 'current_app_user'
       and position(v_old in p.prosrc) > 0
  loop
    v_def := pg_get_functiondef(r.oid);
    v_newdef := replace(v_def, v_old, v_new);
    if v_newdef <> v_def then
      execute v_newdef;
      v_count := v_count + 1;
    end if;
  end loop;
  raise notice 'rewrote % functions', v_count;
end $mig$;

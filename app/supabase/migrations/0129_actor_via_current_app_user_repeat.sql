-- 0129_actor_via_current_app_user_repeat.sql
-- 0049 rewrote every definer RPC that read its actor from the legacy singular
-- GUC nullif(current_setting('request.jwt.claim.sub', true),'')::uuid.
-- PostgREST stopped populating that GUC: it sets request.jwt.claims (JSON), so
-- the legacy read is NULL on every real request. 17 migrations written after
-- 0049 reintroduced the pattern (0102 post_invoice/record_receipt, 0060
-- delivery, 0091 portal, 0103 purchases, 0120 challans, ...), which silently
-- nulls audit_log.actor_id, created_by/posted_by, collected_by and portal
-- attribution in production.
--
-- Repeat the rewrite for anything still carrying the legacy read. current
-- pg_get_functiondef preserves SECURITY DEFINER, search_path, defaults and the
-- existing grants, so this is a safe in-place redefinition.
do $mig$
declare
  r        record;
  v_def    text;
  v_newdef text;
  v_re     constant text :=
    'nullif\(\s*current_setting\(''request\.jwt\.claim\.sub'',\s*true\),\s*''''\)::uuid';
  v_count  int := 0;
begin
  for r in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname <> 'current_app_user'
       and p.prosrc ~ v_re
  loop
    v_def := pg_get_functiondef(r.oid);
    v_newdef := regexp_replace(v_def, v_re, 'public.current_app_user()', 'g');
    if v_newdef <> v_def then
      execute v_newdef;
      v_count := v_count + 1;
    end if;
  end loop;
  raise notice '0129: rewrote % function(s) to current_app_user()', v_count;
end $mig$;

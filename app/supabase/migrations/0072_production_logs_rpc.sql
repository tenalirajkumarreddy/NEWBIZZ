-- =====================================================================
-- 0072_production_logs_rpc.sql  ·  Security-definer RPC for device logs
--
-- ESP32 devices call this RPC instead of direct table insert.
-- Security definer bypasses RLS so the anon role can log production.
-- =====================================================================

create or replace function insert_production_log(
  p_device_id    text,
  p_device_index int,
  p_quantity     int default 1,
  p_logged_at    timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into production_logs (device_id, device_index, quantity, logged_at)
  values (p_device_id, p_device_index, p_quantity, p_logged_at)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function insert_production_log to anon;

comment on function insert_production_log is
  'ESP32 devices call this via POST /rest/v1/rpc/insert_production_log to log production counts. Security definer bypasses RLS.';

-- Also create a batch version for multiple logs at once
create or replace function insert_production_logs_batch(
  p_logs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids jsonb := '[]'::jsonb;
  v_log jsonb;
  v_id uuid;
begin
  for v_log in select * from jsonb_array_elements(p_logs)
  loop
    insert into production_logs (
      device_id, device_index, quantity, logged_at
    ) values (
      v_log->>'device_id',
      (v_log->>'device_index')::int,
      coalesce((v_log->>'quantity')::int, 1),
      coalesce((v_log->>'logged_at')::timestamptz, now())
    )
    returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  return v_ids;
end;
$$;

grant execute on function insert_production_logs_batch to anon;

comment on function insert_production_logs_batch is
  'Batch version: POST JSON array of log objects to insert many at once.';

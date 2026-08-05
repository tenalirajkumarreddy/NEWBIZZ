-- =====================================================================
-- 0090_job_cards_reversal.sql  --  Production Job Cards + Run Reversal
--
-- 1) production_job_cards: operational planning board (day-grouped). The
--    accounting source of truth remains production_runs + journal; job cards
--    are the mutable front-end that schedule work and, when completed, post a
--    real production run (which sets run_id and status='completed').
-- 2) reverse_production_run(p_run_id, p_reason): full compensating reversal
--    of a posted run. For every posted journal entry carrying
--    source='production' / source_id=run it calls reverse_journal (which
--    mirrors lines, swaps debit<->credit AND negates stock_qty), then marks
--    the run 'reversed'. Stock restores, WIP 1225 nets to zero.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Job card status enum + table
-- ---------------------------------------------------------------------
create type job_card_status as enum ('planned','in_progress','completed','cancelled');

create table production_job_cards (
  id               uuid primary key default gen_random_uuid(),
  job_no           text not null unique,
  fy_id            uuid not null references financial_years(id),
  branch_id        uuid not null,
  card_date        date not null,
  stage            int  not null check (stage in (1,2)),
  output_item_id   uuid not null references items(id),
  target_qty       numeric(14,3) not null check (target_qty > 0),
  device_id        uuid references production_device_config(id),
  assigned_to      uuid references users(id),
  planned_start_at timestamptz,
  planned_end_at   timestamptz,
  instructions     text,
  status           job_card_status not null default 'planned',
  run_id           uuid references production_runs(id),
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table production_job_cards enable row level security;
create policy read_all_auth on production_job_cards for select to authenticated using (true);

create index production_job_cards_date_idx on production_job_cards (card_date, status);
create index production_job_cards_run_idx  on production_job_cards (run_id) where run_id is not null;

-- ---------------------------------------------------------------------
-- upsert_job_card(p_card jsonb) -> uuid
--   Inserts a new card or updates an existing one (identified by p_card.id).
--   Writes go only through this SECURITY DEFINER RPC (RLS is read-only).
-- ---------------------------------------------------------------------
create or replace function upsert_job_card(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid := (p_card->>'id')::uuid;
  v_date        date := (p_card->>'card_date')::date;
  v_stage       int  := (p_card->>'stage')::int;
  v_item        uuid := (p_card->>'output_item_id')::uuid;
  v_qty         numeric(14,3) := (p_card->>'target_qty')::numeric;
  v_fy          uuid;
  v_no          text;
  v_actor       uuid := current_app_user();
  v_item_type   item_type;
begin
  if not has_permission('production.run') then
    raise exception 'upsert_job_card: permission denied';
  end if;
  if v_date is null then raise exception 'upsert_job_card: card_date required'; end if;
  if v_stage not in (1,2) then raise exception 'upsert_job_card: stage must be 1 or 2'; end if;
  if v_item is null then raise exception 'upsert_job_card: output_item_id required'; end if;
  if v_qty is null or v_qty <= 0 then raise exception 'upsert_job_card: target_qty must be > 0'; end if;

  select type into v_item_type from items where id = v_item;
  if v_item_type is null then raise exception 'upsert_job_card: unknown item'; end if;
  if v_item_type = 'service' then raise exception 'upsert_job_card: cannot plan production of a service'; end if;

  v_fy := fy_for_date(v_date);

  if v_id is null then
    v_no := next_number('job', v_date);
    insert into production_job_cards (job_no, fy_id, branch_id, card_date, stage,
                                      output_item_id, target_qty, device_id, assigned_to,
                                      planned_start_at, planned_end_at, instructions, created_by)
    values (v_no, v_fy, coalesce(nullif(p_card->>'branch_id','')::uuid,
                                 (select id from branches where code='HO' limit 1)),
            v_date, v_stage, v_item, v_qty,
            nullif(p_card->>'device_id','')::uuid,
            nullif(p_card->>'assigned_to','')::uuid,
            nullif(p_card->>'planned_start_at','')::timestamptz,
            nullif(p_card->>'planned_end_at','')::timestamptz,
            p_card->>'instructions', v_actor)
    returning id into v_id;
    perform write_audit('insert','production_job_cards', v_id::text,
              format('Job %s: %s units of %s (stage %s) on %s', v_no, v_qty, v_item, v_stage, v_date),
              jsonb_build_object('job_no', v_no, 'card_date', v_date, 'stage', v_stage), v_actor);
  else
    update production_job_cards
       set card_date        = v_date,
           stage            = v_stage,
           output_item_id   = v_item,
           target_qty       = v_qty,
           device_id        = nullif(p_card->>'device_id','')::uuid,
           assigned_to      = nullif(p_card->>'assigned_to','')::uuid,
           planned_start_at = nullif(p_card->>'planned_start_at','')::timestamptz,
           planned_end_at   = nullif(p_card->>'planned_end_at','')::timestamptz,
           instructions     = p_card->>'instructions',
           updated_at       = now()
     where id = v_id;
    if not found then raise exception 'upsert_job_card: card % not found', v_id; end if;
    perform write_audit('update','production_job_cards', v_id::text,
              format('Updated job %s', v_id), jsonb_build_object('card_date', v_date), v_actor);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- set_job_card_status(p_id uuid, p_status text, p_run_id uuid default null)
--   Transition a card. completed requires a run_id (the run must post first).
-- ---------------------------------------------------------------------
create or replace function set_job_card_status(p_id uuid, p_status text, p_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status job_card_status;
  v_has_run uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('production.run') then
    raise exception 'set_job_card_status: permission denied';
  end if;
  begin
    v_status := p_status::job_card_status;
  exception when invalid_text_representation then
    raise exception 'set_job_card_status: invalid status %', p_status;
  end;

  select run_id into v_has_run from production_job_cards where id = p_id;
  if v_has_run is null then
    raise exception 'set_job_card_status: card % not found', p_id;
  end if;

  if v_status = 'completed' then
    if p_run_id is null then
      raise exception 'set_job_card_status: a run must be posted before completing a job';
    end if;
    if v_has_run is not null then
      raise exception 'set_job_card_status: card already completed by run %', v_has_run;
    end if;
    update production_job_cards
       set status = 'completed', run_id = p_run_id, updated_at = now()
     where id = p_id;
  else
    update production_job_cards
       set status = v_status, updated_at = now()
     where id = p_id;
  end if;

  perform write_audit('update','production_job_cards', p_id::text,
            format('Job card status -> %s', v_status),
            jsonb_build_object('run_id', p_run_id), v_actor);
end $$;

-- ---------------------------------------------------------------------
-- reverse_production_run(p_run_id uuid, p_reason text) -> uuid
--   Compensating reversal of a posted production run. Reverses every posted
--   journal entry with source='production', source_id=run via reverse_journal
--   (mirror swap + stock_qty negation), then marks the run reversed.
-- ---------------------------------------------------------------------
create or replace function reverse_production_run(p_run_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   production_runs%rowtype;
  v_entry uuid;
  v_new   uuid;
  v_fy    uuid;
  v_actor uuid := current_app_user();
begin
  select * into v_run from production_runs where id = p_run_id;
  if not found then raise exception 'reverse_production_run: run % not found', p_run_id; end if;
  if v_run.status = 'reversed' then raise exception 'reverse_production_run: run % already reversed', v_run.run_no; end if;
  if v_run.status <> 'posted' then raise exception 'reverse_production_run: run % is not posted', v_run.run_no; end if;
  if not has_permission('production.run') then
    raise exception 'reverse_production_run: permission denied';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reverse_production_run: reversal reason required';
  end if;

  v_fy := fy_for_date(current_date);
  if v_run.fy_id <> v_fy then
    raise exception 'reverse_production_run: cannot reverse run % from a prior financial year', v_run.run_no;
  end if;

  for v_entry in
    select id from journal_entries
     where source = 'production' and source_id = p_run_id::text
       and status = 'posted'
  loop
    v_new := reverse_journal(v_entry, p_reason);
  end loop;

  update production_runs set status = 'reversed' where id = p_run_id;
  perform write_audit('reverse','production_runs', p_run_id::text,
            format('Reversed run %s: %s', v_run.run_no, p_reason),
            jsonb_build_object('run_no', v_run.run_no, 'reason', p_reason), v_actor);
  return v_new;
end $$;

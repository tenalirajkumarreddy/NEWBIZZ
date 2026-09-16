-- =====================================================================
-- 0121_payroll_hardening_and_pay.sql
--
-- Web attendance & payroll hardening (spec 2026-09-15-web-attendance-payroll):
--   1. save_attendance_day — one RPC for the whole day's roster:
--      permission ladder (hr.manage ⇒ any date; else attendance.mark +
--      hr.view + today only), payroll-lock guard, calendar flip,
--      per-entity replace, hours-band credit, audit, jsonb summary.
--   2. compute_payroll / post_payroll_run / pay_payroll_line — re-emitted
--      from the live bodies (0121-live-refs capture) with only an
--      hr.manage gate inserted after `begin`.
--   3. pay_worker — direct capital payment/advance for users AND workers
--      (txn + journal in one call); post_journal revoked from
--      authenticated (ledger writes only via the gated RPCs above).
--
-- REPLACE-PER-LISTED-ENTITY semantics of save_attendance_day:
--   every row of p_rows deletes that entity's day-attendance + its
--   attendance_pay txns, then (if a status is present) re-inserts the
--   attendance row; the band credit is written only for status in
--   ('present','half_day'). A row with null/'' status clears the entity's
--   day. Rows not listed are NEVER touched — a full-day wipe requires the
--   client to list every previously-marked entity (the web panel already
--   sends the whole roster).
--
-- LANES: two independent pay lanes coexist —
--   • daily lane:   save_attendance_day → worker_transactions (positive
--     attendance_pay credits; users and workers both, no journal).
--   • monthly lane: compute_payroll/post_payroll_run/pay_payroll_line →
--     payroll_runs/payroll_lines + journal via post_journal (users only;
--     party_type stays 'user'). pay_worker bridges to the ledger for
--     capital cash-outs on either entity kind.
-- =====================================================================

-- =====================================================================
-- 1. save_attendance_day
-- =====================================================================
create or replace function save_attendance_day(p_date date, p_shift text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := current_app_user();
  v_row       jsonb;
  v_entity    text;
  v_id        uuid;
  v_status    text;
  v_hours     numeric := 0;
  v_ot        numeric := 0;
  v_note      text;
  v_amount    numeric(12,2);
  v_att       uuid;
  v_lines     jsonb := '[]'::jsonb;
  v_credited  numeric(14,2) := 0;
begin
  if v_actor is null then raise exception 'save_attendance_day: not authenticated'; end if;

  -- permission ladder: hr.manage may mark any date; everyone else needs
  -- attendance.mark + hr.view and only for today (mirrors 0119 RLS).
  if not has_permission('hr.manage') then
    if not (has_permission('attendance.mark') and has_permission('hr.view')) then
      raise exception 'save_attendance_day: not authorized (attendance.mark + hr.view required)';
    end if;
    if p_date is distinct from current_date then
      raise exception 'save_attendance_day: only today can be marked';
    end if;
  end if;

  if p_date is null then raise exception 'save_attendance_day: date required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'save_attendance_day: rows must be a jsonb array';
  end if;

  -- payroll-lock guard: a posted|paid run for the month touching any
  -- submitted user entity means the books are closed for that period.
  if exists (
    select 1
      from payroll_runs r
      join payroll_lines l on l.run_id = r.id
     where r.status in ('posted','paid')
       and r.period_month = date_trunc('month', p_date)::date
       and l.user_id in (
         select (x->>'id')::uuid
           from jsonb_array_elements(p_rows) x
          where nullif(x->>'entity','') = 'user'
            and nullif(x->>'id','') is not null
       )
  ) then
    raise exception 'payroll for this period is already posted - ask the office to reconcile';
  end if;

  -- marking a day present flips it to a working day; do NOT clobber
  -- holiday_name on conflict (only is_working is set).
  insert into calendar_days (date, is_working)
    values (p_date, true)
    on conflict (date) do update set is_working = true;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_entity := nullif(v_row->>'entity','');
    v_id     := nullif(v_row->>'id','')::uuid;
    v_status := nullif(v_row->>'status','');
    v_hours  := coalesce(nullif(v_row->>'hours','')::numeric, 0);
    v_ot     := coalesce(nullif(v_row->>'ot_hours','')::numeric, 0);
    v_note   := nullif(v_row->>'note','');

    if v_entity not in ('user','worker') or v_id is null then
      raise exception 'save_attendance_day: each row needs entity (user|worker) and id';
    end if;

    -- per-entity replace: clear this entity's day (attendance_pay txns
    -- first — worker_transactions has no work_date, it is
    -- transaction_date), then re-insert below when a status is given.
    delete from worker_transactions
     where transaction_date = p_date
       and type = 'attendance_pay'
       and ((v_entity = 'user'   and user_id   = v_id)
         or (v_entity = 'worker' and worker_id = v_id));

    delete from attendance
     where work_date = p_date
       and ((v_entity = 'user'   and user_id   = v_id)
         or (v_entity = 'worker' and worker_id = v_id));

    v_amount := 0;

    if v_status is not null then
      if v_entity = 'user' then
        insert into attendance (user_id, work_date, shift, hours, ot_hours, status, note, created_by)
          values (v_id, p_date, p_shift, v_hours, v_ot, v_status::attendance_status, v_note, v_actor)
          returning id into v_att;
      else
        insert into attendance (worker_id, work_date, shift, hours, ot_hours, status, note, created_by)
          values (v_id, p_date, p_shift, v_hours, v_ot, v_status::attendance_status, v_note, v_actor)
          returning id into v_att;
      end if;

      -- band credit only for worked statuses (mirrors the web save path:
      -- positive attendance_pay, reference_id = attendance id)
      if v_status in ('present','half_day') then
        select amount into v_amount
          from pay_mappings
         where v_hours >= hours_min and v_hours < hours_max
         order by hours_min
         limit 1;
        v_amount := coalesce(v_amount, 0);

        if v_amount > 0 then
          insert into worker_transactions (user_id, worker_id, type, amount,
                                           transaction_date, reference_id, note, created_by)
          values (case when v_entity = 'user'   then v_id end,
                  case when v_entity = 'worker' then v_id end,
                  'attendance_pay', v_amount, p_date, v_att,
                  format('Attendance %s - %sh%s', p_date, v_hours,
                         case when v_ot > 0 then format(' (+%sh OT)', v_ot) else '' end),
                  v_actor);

          v_credited := v_credited + v_amount;
        end if;
      end if;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'entity', v_entity, 'id', v_id, 'status', v_status,
      'hours', v_hours, 'ot_hours', v_ot, 'amount', v_amount);
  end loop;

  perform write_audit('post','attendance', p_date::text,
            format('Attendance saved for %s (%s rows, %s credited)',
                   p_date, jsonb_array_length(p_rows), v_credited),
            jsonb_build_object('date', p_date, 'rows', jsonb_array_length(p_rows),
                               'credited_total', v_credited, 'lines', v_lines),
            v_actor);

  return jsonb_build_object('date', p_date,
                            'rows', jsonb_array_length(p_rows),
                            'credited_total', v_credited,
                            'lines', v_lines);
end $$;

revoke all on function save_attendance_day(date, text, jsonb) from public, anon;
grant execute on function save_attendance_day(date, text, jsonb) to authenticated;

-- =====================================================================
-- 2. Payroll-run lane gates (bodies from the live pg_get_functiondef
--    capture in 0121-live-refs.md, verbatim except the hr.manage gate
--    inserted after `begin`)
-- =====================================================================

-- 2a. compute_payroll — hr.manage gate
CREATE OR REPLACE FUNCTION public.compute_payroll(p_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from    date := date_trunc('month', p_month)::date;
  v_to      date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days    int  := (v_to - v_from) + 1;
  v_run     uuid;
  v_u       record;
  v_present numeric(5,1);
  v_ot      numeric(6,2);
  v_offdays int;
  v_workdays numeric(6,1);
  v_gross   numeric(14,2);
  v_leaves  numeric(5,1);
  v_excess  numeric(5,1);
  v_total   numeric(14,2) := 0;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not has_permission('hr.manage') then
    raise exception 'compute_payroll: not authorized (hr.manage required)';
  end if;
  delete from payroll_runs where period_month = v_from and status = 'draft';
  insert into payroll_runs (period_month, status, created_by)
    values (v_from, 'draft', v_actor) returning id into v_run;

  for v_u in
    select u.id as user_id,
           coalesce(pc.monthly_salary,0)  as salary,
           coalesce(pc.daily_rate,0)      as daily_rate,
           coalesce(pc.ot_hourly_rate,0)  as ot_rate,
           coalesce(pc.paid_leaves,2)     as paid_leaves,
           coalesce(pc.pay_type,'monthly') as pay_type
      from users u
      left join user_pay_config pc on pc.user_id = u.id
     where u.status = 'active'
  loop
    select
      coalesce(sum(case a.status when 'present' then 1
                                   when 'half_day' then 0.5 else 0 end),0),
      coalesce(sum(a.ot_hours),0),
      coalesce(sum(case when a.status in ('week_off','holiday') then 1 else 0 end),0)
      into v_present, v_ot, v_offdays
      from attendance a
     where a.user_id = v_u.user_id and a.work_date between v_from and v_to;

    v_workdays := greatest(v_days - v_offdays, 1);

    if v_u.pay_type = 'daily' then
      v_gross := round(v_present * v_u.daily_rate, 2)
               + round(v_ot * v_u.ot_rate, 2);
    else
      if v_u.salary <= 0 and v_ot <= 0 then continue; end if;
      v_leaves := greatest(v_workdays - v_present, 0);
      if v_leaves <= v_u.paid_leaves then
        v_gross := v_u.salary;
      else
        v_excess := v_leaves - v_u.paid_leaves;
        v_gross := v_u.salary - round((v_u.salary / v_days) * v_excess, 2);
      end if;
      v_gross := v_gross + round(v_ot * v_u.ot_rate, 2);
    end if;

    if v_gross <= 0 then continue; end if;

    insert into payroll_lines (run_id, user_id, days_present, ot_hours, gross, net)
    values (v_run, v_u.user_id, v_present, v_ot, v_gross, v_gross);
    v_total := v_total + v_gross;
  end loop;

  update payroll_runs
     set status = 'computed', total_gross = v_total, computed_at = now()
   where id = v_run;

  perform write_audit('update','payroll_runs', v_run::text,
            format('Payroll computed for %s: %s gross', to_char(v_from,'YYYY-MM'), v_total),
            jsonb_build_object('total_gross', v_total), v_actor);
  return v_run;
end
$function$;

revoke all on function compute_payroll(date) from public, anon;
grant execute on function compute_payroll(date) to authenticated;

-- 2b. post_payroll_run — hr.manage gate
CREATE OR REPLACE FUNCTION public.post_payroll_run(p_run uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run   payroll_runs;
  v_lines jsonb := '[]'::jsonb;
  v_line  record;
  v_je    uuid;
  v_date  date;
  v_actor uuid := current_app_user();
begin
  if not has_permission('hr.manage') then
    raise exception 'post_payroll_run: not authorized (hr.manage required)';
  end if;
  select * into v_run from payroll_runs where id = p_run;
  if not found then raise exception 'post_payroll_run: unknown run %', p_run; end if;
  if v_run.status in ('posted','paid') or v_run.journal_entry_id is not null then
    raise exception 'post_payroll_run: run % already posted', p_run;
  end if;
  if v_run.total_gross <= 0 then
    raise exception 'post_payroll_run: nothing to post for run %', p_run;
  end if;
  v_date := (date_trunc('month', v_run.period_month) + interval '1 month - 1 day')::date;

  v_lines := v_lines || jsonb_build_object('account_code','5500','debit', v_run.total_gross, 'credit', 0);
  for v_line in select user_id, gross from payroll_lines where run_id = p_run loop
    v_lines := v_lines || jsonb_build_object('account_code','2130','debit',0,
                 'credit', v_line.gross,
                 'party_type','user','party_id', v_line.user_id::text);
  end loop;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','payroll_run', 'source_id', p_run::text,
                       'narration', format('Payroll %s', to_char(v_run.period_month,'YYYY-MM'))),
    v_lines);

  update payroll_runs set status = 'posted', journal_entry_id = v_je where id = p_run;

  perform write_audit('post','payroll_runs', p_run::text,
            format('Payroll posted: %s gross', v_run.total_gross),
            jsonb_build_object('journal_entry_id', v_je, 'total_gross', v_run.total_gross), v_actor);
  return v_je;
end
$function$;

revoke all on function post_payroll_run(uuid) from public, anon;
grant execute on function post_payroll_run(uuid) to authenticated;

-- 2c. pay_payroll_line — hr.manage gate (party_type stays 'user'-only)
CREATE OR REPLACE FUNCTION public.pay_payroll_line(p_line uuid, p_pay_from text DEFAULT 'bank'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line  payroll_lines;
  v_run   payroll_runs;
  v_credit text;
  v_je    uuid;
  v_actor uuid := current_app_user();
begin
  if not has_permission('hr.manage') then
    raise exception 'pay_payroll_line: not authorized (hr.manage required)';
  end if;
  select * into v_line from payroll_lines where id = p_line;
  if not found then raise exception 'pay_payroll_line: unknown line %', p_line; end if;
  select * into v_run from payroll_runs where id = v_line.run_id;
  if v_run.status not in ('posted','paid') then
    raise exception 'pay_payroll_line: run not posted yet';
  end if;
  if v_line.paid_amount >= v_line.gross then
    raise exception 'pay_payroll_line: line % already paid', p_line;
  end if;
  v_credit := case p_pay_from when 'bank' then '1120' when 'cash' then '1110' else null end;
  if v_credit is null then raise exception 'pay_payroll_line: pay_from must be cash or bank'; end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', current_date, 'doc_type','voucher',
                       'source','payroll_payment', 'source_id', p_line::text,
                       'narration', format('Salary paid to user %s', v_line.user_id)),
    jsonb_build_array(
      jsonb_build_object('account_code','2130','debit', v_line.gross, 'credit', 0,
                         'party_type','user','party_id', v_line.user_id::text),
      jsonb_build_object('account_code', v_credit,'debit', 0, 'credit', v_line.gross)));

  update payroll_lines set paid_amount = gross, paid_journal_id = v_je where id = p_line;
  -- flip run to 'paid' once every line is settled
  update payroll_runs r set status = 'paid'
   where r.id = v_line.run_id
     and not exists (select 1 from payroll_lines l
                      where l.run_id = r.id and l.paid_amount < l.gross);

  perform write_audit('post','payroll_lines', p_line::text,
            format('Salary paid: %s', v_line.gross),
            jsonb_build_object('journal_entry_id', v_je, 'amount', v_line.gross), v_actor);
  return v_je;
end
$function$;

revoke all on function pay_payroll_line(uuid, text) from public, anon;
grant execute on function pay_payroll_line(uuid, text) to authenticated;

-- =====================================================================
-- 3. pay_worker (capital cash-out, users and workers) + post_journal lockdown
-- =====================================================================
create or replace function pay_worker(p_entity_type text, p_entity_id uuid, p_kind text,
  p_amount numeric, p_method text default 'cash', p_note text default null,
  p_date date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := current_app_user();
  v_name  text; v_txn uuid; v_je uuid;
  v_credit text := case p_method when 'cash' then '1110' when 'bank' then '1120' end;
begin
  if v_actor is null then raise exception 'pay_worker: not authenticated'; end if;
  if not has_permission('hr.manage') then raise exception 'pay_worker: not authorized (hr.manage required)'; end if;
  if p_entity_type not in ('user','worker') then raise exception 'pay_worker: entity must be user or worker'; end if;
  if p_kind not in ('payment','advance') then raise exception 'pay_worker: kind must be payment or advance'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'pay_worker: amount must be positive'; end if;
  if v_credit is null then raise exception 'pay_worker: method must be cash or bank'; end if;

  select full_name into v_name from users  where id = p_entity_id and p_entity_type = 'user';
  if v_name is null then
    select full_name into v_name from workers where id = p_entity_id and p_entity_type = 'worker';
  end if;
  if v_name is null then raise exception 'pay_worker: unknown % %', p_entity_type, p_entity_id; end if;

  insert into worker_transactions (user_id, worker_id, type, amount, transaction_date, note)
  values (case when p_entity_type='user'   then p_entity_id end,
          case when p_entity_type='worker' then p_entity_id end,
          p_kind, -p_amount, p_date,
          coalesce(nullif(trim(coalesce(p_note,'')),''),
                   'Capital ' || p_kind || ' - ' || v_name))
  returning id into v_txn;

  v_je := post_journal(
    jsonb_build_object('entry_date', p_date, 'doc_type','voucher','source','worker_pay',
                       'source_id', v_txn::text,
                       'narration', format('Worker %s: %s %s %s', p_kind, v_name,
                                            to_char(p_amount,'FM999999990.00'),
                                            case when p_entity_type='user' then '' else '(worker)' end)),
    jsonb_build_array(
      jsonb_build_object('account_code','5500','debit', p_amount, 'credit', 0,
                         'party_type', case when p_entity_type='user' then 'user' else null end,
                         'party_id',   case when p_entity_type='user' then p_entity_id::text else null end),
      jsonb_build_object('account_code', v_credit, 'debit', 0, 'credit', p_amount)));

  perform write_audit('post','worker_transactions', v_txn::text,
    format('Worker %s: %s %s (%s)', p_kind, v_name, p_amount, p_method),
    jsonb_build_object('amount', p_amount, 'method', p_method, 'journal_entry_id', v_je,
                       'entity', p_entity_type), v_actor);
  return v_txn;
end $$;

revoke all on function pay_worker(text, uuid, text, numeric, text, text, date) from public, anon;
grant  execute on function pay_worker(text, uuid, text, numeric, text, text, date) to authenticated;

revoke execute on function post_journal(jsonb, jsonb) from authenticated, anon;

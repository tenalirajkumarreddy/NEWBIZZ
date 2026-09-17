-- =====================================================================
-- 0122_business_day_ist.sql
--
-- Root cause fix: the database runs on UTC while the business operates on IST.
-- Between 00:00 and 05:30 IST every day, current_date (UTC) is YESTERDAY,
-- so save_attendance_day rejected today's date and the *_today RLS policies
-- denied direct writes. business_today() is the single IST calendar source:
-- all branches operate in Asia/Kolkata (documented assumption).
-- =====================================================================

create or replace function public.business_today() returns date
language sql stable security definer set search_path = public
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

revoke all on function public.business_today() from public, anon;
grant execute on function public.business_today() to authenticated;

-- save_attendance_day, byte-identical to 0121 except the IST guard:
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
  v_salary    numeric(14,2) := 0;
  v_ot_rate   numeric(12,2) := 0;
  v_paid_leaves int := 2;
  v_existing_leaves int := 0;
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
    if p_date is distinct from public.business_today() then
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
        -- user config via LEFT-JOIN semantics: a missing config row (or NULL
        -- columns) means salary 0 ⇒ credit 0 — the attendance row still
        -- writes. Reset first so a previous loop iteration can't leak into
        -- a config-less user; coalesce after covers NULL assignment.
        v_salary      := 0;
        v_ot_rate     := 0;
        v_paid_leaves := 2;
        select coalesce(pc.monthly_salary, 0), coalesce(pc.ot_hourly_rate, 0),
               coalesce(pc.paid_leaves, 2)
          into v_salary, v_ot_rate, v_paid_leaves
          from user_pay_config pc
         where pc.user_id = v_id;
        v_salary      := coalesce(v_salary, 0);
        v_ot_rate     := coalesce(v_ot_rate, 0);
        v_paid_leaves := coalesce(v_paid_leaves, 2);

        -- paid-leave allowance: count this month's EXISTING leave rows for
        -- the user, evaluated BEFORE inserting this one (the per-entity
        -- delete above already removed this entity's prior row for p_date).
        if v_status = 'leave' then
          select count(*) into v_existing_leaves
            from attendance
           where user_id = v_id
             and status = 'leave'
             and work_date >= date_trunc('month', p_date)::date
             and work_date <  (date_trunc('month', p_date) + interval '1 month')::date;
        else
          v_existing_leaves := 0;
        end if;
      end if;

      if v_entity = 'user' then
        insert into attendance (user_id, work_date, shift, hours, ot_hours, status, note, created_by)
          values (v_id, p_date, p_shift, v_hours, v_ot, v_status::attendance_status, v_note, v_actor)
          returning id into v_att;
      else
        insert into attendance (worker_id, work_date, shift, hours, ot_hours, status, note, created_by)
          values (v_id, p_date, p_shift, v_hours, v_ot, v_status::attendance_status, v_note, v_actor)
          returning id into v_att;
      end if;

      if v_entity = 'worker' then
        -- worker lane (unchanged): band credit only for worked statuses
        if v_status in ('present','half_day') then
          select amount into v_amount
            from pay_mappings
           where v_hours >= hours_min and v_hours < hours_max
           order by hours_min
           limit 1;
          v_amount := coalesce(v_amount, 0);
        end if;
      else
        -- user lane (pivot: everyone accrues wages daily on the ledger):
        --   amount = round(monthly_salary/30, 2)
        --          × (present 1.0 | half_day 0.5 | else 0.0)
        --          + round(ot_hourly_rate × ot_hours, 2)
        -- the OT term is unconditional per the formula — a non-worked
        -- status with ot_hours > 0 still accrues OT (e.g. holiday OT).
        v_amount := round(v_salary / 30.0, 2)
                  * (case v_status
                       when 'present'  then 1.0
                       when 'half_day' then 0.5
                       else 0.0 end)
                  + round(v_ot_rate * v_ot, 2);

        -- paid-leave rule: a 'leave' day inside the allowance ((existing
        -- month leaves + 1) <= paid_leaves) pays the FULL daily rate as
        -- present; beyond it only OT accrues. 'holiday'/'week_off' never
        -- count against the allowance.
        if v_status = 'leave' and (v_existing_leaves + 1) <= v_paid_leaves then
          v_amount := round(v_salary / 30.0, 2) * 1.0 + round(v_ot_rate * v_ot, 2);
        end if;
      end if;

      -- ledger credit (mirrors the web save path: positive attendance_pay,
      -- reference_id = attendance id) — written only when amount > 0
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

-- Operator same-day RLS, IST-correct:
drop policy if exists "attendance_mark_today" on public.attendance;
create policy "attendance_mark_today"
  on public.attendance
  for all
  to authenticated
  using (has_permission('attendance.mark') and has_permission('hr.view') and work_date = public.business_today())
  with check (has_permission('attendance.mark') and has_permission('hr.view') and work_date = public.business_today());

drop policy if exists "calendar_mark_today" on public.calendar_days;
create policy "calendar_mark_today"
  on public.calendar_days
  for insert
  to authenticated
  with check (has_permission('attendance.mark') and date = public.business_today());

-- pay_worker default entry date follows the IST business day:

-- =====================================================================
-- 0127_attendance_hours_model.sql
--
-- Attendance pay simplified to the hours model (spec 2026-09-29):
--
--   TWO pay lanes, no more half_day/leave/week_off/holiday bookkeeping:
--   every roster row is just 'present' or 'absent'.
--
--   • DAILY WAGES (workers, and users with user_pay_config.pay_type='daily'):
--       present  → pay_mappings hours-band lookup on the day's hours
--                  (users on the daily lane instead get their configured
--                  daily_rate) — 0 hours ⇒ 0 credit.
--       absent   → 0.
--
--   • MONTHLY (users with pay_type='monthly', the default):
--       day rate = round(monthly_salary / days-in-that-month, 2)
--         present → day rate + OT
--         absent  → day rate while the paid-leave allowance lasts:
--                   counted per calendar month as (existing 'absent' rows
--                   < paid_leaves). Beyond the allowance → 0 + OT.
--       Monthly pay accrues the same way every day, exactly like the daily
--       lane — no half-day ×0.5, no separate 'leave' status. An absence
--       IS the leave; the allowance makes the first X of them paid.
--
--   OT (users only, both pay types): round(ot_hourly_rate × ot_hours, 2),
--   added unconditionally (matches 0121's formula — a non-worked day with
--   ot_hours still accrues OT).
--
--   Legacy enum values ('half_day','leave','holiday','week_off') remain
--   valid in the enum and in historical rows — only NEW writes are
--   restricted to present|absent. Summaries bucket legacy rows as absent.
--
--   Everything else — permission ladder (hr.manage ⇒ any date; else
--   attendance.mark + hr.view + today-IST only), payroll-lock guard,
--   calendar flip, REPLACE-PER-LISTED-ENTITY semantics, audit, return
--   shape — is carried over byte-for-byte from 0121/0122.
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
  v_salary    numeric(14,2) := 0;
  v_daily     numeric(12,2) := 0;
  v_ot_rate   numeric(12,2) := 0;
  v_pay_type  text := 'monthly';
  v_paid_leaves int := 0;
  v_used_absences int := 0;
  v_days_in_month int;
  v_att       uuid;
  v_lines     jsonb := '[]'::jsonb;
  v_credited  numeric(14,2) := 0;
begin
  if v_actor is null then raise exception 'save_attendance_day: not authenticated'; end if;

  -- permission ladder: hr.manage may mark any date; everyone else needs
  -- attendance.mark + hr.view and only for today (mirrors 0119 RLS,
  -- business day in IST per 0122).
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

  -- days in the attendance month — the monthly day-rate denominator.
  v_days_in_month := extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::int;

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

    -- the hours model: two statuses, nothing else. Legacy enum values stay
    -- readable in history but are no longer writable.
    if v_status is not null and v_status not in ('present','absent') then
      raise exception 'save_attendance_day: status must be ''present'' or ''absent'' (got %)', v_status;
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
      -- paid-leave allowance count for monthly users: this month's EXISTING
      -- absent rows, evaluated BEFORE inserting this one (the per-entity
      -- delete above already removed this entity's prior row for p_date).
      -- Legacy 'leave' rows count too — an absence is an absence.
      if v_entity = 'user' then
        select count(*) into v_used_absences
          from attendance
         where user_id = v_id
           and status in ('absent','leave')
           and work_date >= date_trunc('month', p_date)::date
           and work_date <  (date_trunc('month', p_date) + interval '1 month')::date;
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
        -- DAILY WAGE lane: hours → pay_mappings band, worked days only.
        if v_status = 'present' then
          select amount into v_amount
            from pay_mappings
           where v_hours >= hours_min and v_hours < hours_max
           order by hours_min
           limit 1;
          v_amount := coalesce(v_amount, 0);
        end if;
      else
        -- USER lane: pay_type decides the rate source.
        select coalesce(pc.monthly_salary, 0), coalesce(pc.daily_rate, 0),
               coalesce(pc.ot_hourly_rate, 0),
               coalesce(nullif(pc.pay_type, ''), 'monthly'),
               coalesce(pc.paid_leaves, 0)
          into v_salary, v_daily, v_ot_rate, v_pay_type, v_paid_leaves
          from user_pay_config pc
         where pc.user_id = v_id;
        v_salary     := coalesce(v_salary, 0);
        v_daily      := coalesce(v_daily, 0);
        v_ot_rate    := coalesce(v_ot_rate, 0);
        v_pay_type   := coalesce(v_pay_type, 'monthly');
        v_paid_leaves := coalesce(v_paid_leaves, 0);

        if v_pay_type = 'daily' then
          -- daily-wage user: flat configured rate on worked days.
          if v_status = 'present' then
            v_amount := round(v_daily, 2) + round(v_ot_rate * v_ot, 2);
          end if;
        else
          -- MONTHLY: salary / days-in-month, every day the same.
          --   present → day rate; absent → day rate while the paid-leave
          --   allowance lasts, 0 beyond it. OT adds on either way.
          if v_status = 'present' or v_used_absences < v_paid_leaves then
            v_amount := round(v_salary / v_days_in_month, 2)
                      + round(v_ot_rate * v_ot, 2);
          else
            v_amount := round(v_ot_rate * v_ot, 2);
          end if;
        end if;
      end if;

      -- ledger credit (same as 0121: positive attendance_pay,
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

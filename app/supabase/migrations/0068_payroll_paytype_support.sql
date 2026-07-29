-- =====================================================================
-- 0068_payroll_paytype_support.sql  ·  Pay types + rewrite compute_payroll
--
-- Extends user_pay_config with pay_type (monthly|daily), daily_rate, and
-- paid_leaves for monthly employees. Rewrites compute_payroll to branch
-- on pay_type:
--
--   daily:    present_days × daily_rate + OT hours × ot_hourly_rate
--   monthly:  salary if leaves ≤ paid_leaves, else
--             salary − (salary / total_days) × excess_leaves + OT
--
-- Leaves = working_days − present_days (half_day = 0.5).
-- Working_days = total_days − holiday/week_off.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend user_pay_config
-- ---------------------------------------------------------------------
alter table user_pay_config
  add column if not exists pay_type     text           not null default 'monthly',
  add column if not exists daily_rate   numeric(14,2)  not null default 0,
  add column if not exists paid_leaves  numeric(4,1)   not null default 2;

comment on column user_pay_config.pay_type    is 'monthly | daily';
comment on column user_pay_config.daily_rate  is 'Per-day wage for daily-wage employees';
comment on column user_pay_config.paid_leaves is 'Paid leave entitlement per month (monthly only)';

-- ---------------------------------------------------------------------
-- 2. Rewrite compute_payroll with pay-type branching
-- ---------------------------------------------------------------------
create or replace function compute_payroll(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
      -- Daily wage: each day present = daily_rate
      v_gross := round(v_present * v_u.daily_rate, 2)
               + round(v_ot * v_u.ot_rate, 2);
    else
      -- Monthly salary prorated with paid-leave buffer
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
end $$;
comment on function compute_payroll is 'Compute a DRAFT payroll run. Daily: present×rate + OT. Monthly: salary minus deduction for excess leave. §7.7.';

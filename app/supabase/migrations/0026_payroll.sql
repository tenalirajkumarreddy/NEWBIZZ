-- =====================================================================
-- 0026_payroll.sql  ·  Phase 4 — Attendance & Payroll  (§7.7)
--
-- Daily attendance → monthly payroll. Payroll is computed from attendance +
-- user_pay_config (§3.2), then posted and paid. No TDS (C4 excluded) — post at
-- gross. Accounting:
--   Post run:  Dr 5500 Salaries - Admin   gross_total
--                 Cr 2130 Wages Payable    gross_total       party = user
--   Pay:       Dr 2130 Wages Payable       amount
--                 Cr 1110 Cash | 1120 Bank amount            (source ledger)
-- OT is only paid above the user's standard shift hours.
-- =====================================================================

-- Grant HR management to the manager role (permission codes already exist in the
-- catalog; only admin held them implicitly). accountant keeps hr.view for payroll
-- oversight. Idempotent.
insert into role_permissions (role_id, permission, scope)
select r.id, p.code, 'all'
  from roles r cross join (values ('hr.manage'),('hr.view')) as p(code)
 where r.code = 'manager'
on conflict (role_id, permission) do nothing;
insert into role_permissions (role_id, permission, scope)
select r.id, 'hr.view', 'all' from roles r where r.code = 'accountant'
on conflict (role_id, permission) do nothing;

create type attendance_status as enum ('present','absent','half_day','leave','holiday','week_off');
create type payroll_status    as enum ('draft','computed','posted','paid');

-- ---------------------------------------------------------------------
-- attendance — one row per user per day (part of the EOD form).
-- ---------------------------------------------------------------------
create table attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id),
  work_date  date not null,
  shift      text,
  check_in   timestamptz,
  check_out  timestamptz,
  hours      numeric(5,2) not null default 0,
  ot_hours   numeric(5,2) not null default 0,
  status     attendance_status not null default 'present',
  note       text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (user_id, work_date)
);
create index attendance_user_idx on attendance (user_id, work_date);

-- ---------------------------------------------------------------------
-- payroll_runs / payroll_lines — a monthly batch.
-- ---------------------------------------------------------------------
create table payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null unique,                 -- first of month
  status        payroll_status not null default 'draft',
  total_gross   numeric(14,2) not null default 0,
  computed_at   timestamptz,
  journal_entry_id uuid references journal_entries(id),
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create table payroll_lines (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references payroll_runs(id) on delete cascade,
  user_id     uuid not null references users(id),
  days_present numeric(5,1) not null default 0,
  ot_hours    numeric(6,2) not null default 0,
  gross       numeric(14,2) not null default 0,
  net         numeric(14,2) not null default 0,       -- = gross (no deductions in v1)
  paid_amount numeric(14,2) not null default 0,       -- read-model of payments made
  paid_journal_id uuid references journal_entries(id),
  created_at  timestamptz not null default now(),
  unique (run_id, user_id)
);
create index payroll_lines_run_idx on payroll_lines (run_id);

create trigger attendance_touch   before update on attendance   for each row execute function touch_updated_at();
create trigger payroll_runs_touch before update on payroll_runs for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- compute_payroll(period_month) -> run id
-- Rebuilds a DRAFT run from attendance + user_pay_config. Salary is prorated by
-- present-equivalent days over the month's working days; OT paid at ot_hourly_
-- rate for hours booked as ot_hours. Does not post.
--   present-equiv: present=1, half_day=0.5, others=0.
--   working days:  calendar days in the month minus week_off/holiday rows for
--                  that user (fallback: calendar days if none marked).
-- ---------------------------------------------------------------------
create or replace function compute_payroll(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from   date := date_trunc('month', p_month)::date;
  v_to     date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days   int  := (v_to - v_from) + 1;
  v_run    uuid;
  v_u      record;
  v_present numeric(5,1);
  v_ot     numeric(6,2);
  v_offdays int;
  v_workdays numeric(6,1);
  v_gross  numeric(14,2);
  v_total  numeric(14,2) := 0;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  delete from payroll_runs where period_month = v_from and status = 'draft';
  insert into payroll_runs (period_month, status, created_by)
    values (v_from, 'draft', v_actor) returning id into v_run;

  for v_u in
    select u.id as user_id, coalesce(pc.monthly_salary,0) as salary,
           coalesce(pc.ot_hourly_rate,0) as ot_rate
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

    if v_u.salary = 0 and v_ot = 0 then continue; end if;

    v_workdays := greatest(v_days - v_offdays, 1);
    v_gross := round(v_u.salary * (v_present / v_workdays), 2)
             + round(v_ot * v_u.ot_rate, 2);
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
comment on function compute_payroll is 'Compute a DRAFT payroll run from attendance + pay config; salary prorated, OT above shift. §7.7.';

-- ---------------------------------------------------------------------
-- post_payroll_run(run_id) -> journal entry id
-- Dr 5500 Salaries - Admin (total) / Cr 2130 Wages Payable per user.
-- ---------------------------------------------------------------------
create or replace function post_payroll_run(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   payroll_runs;
  v_lines jsonb := '[]'::jsonb;
  v_line  record;
  v_je    uuid;
  v_date  date;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
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
end $$;
comment on function post_payroll_run is 'Post payroll: Dr 5500 / Cr 2130 Wages Payable per user. Paid via pay_payroll_line. §7.7.';

-- ---------------------------------------------------------------------
-- pay_payroll_line(line_id, pay_from) -> journal entry id
-- Settle one user's posted salary: Dr 2130 Wages Payable / Cr cash|bank.
-- ---------------------------------------------------------------------
create or replace function pay_payroll_line(p_line uuid, p_pay_from text default 'bank')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line  payroll_lines;
  v_run   payroll_runs;
  v_credit text;
  v_je    uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
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
end $$;
comment on function pay_payroll_line is 'Settle one salary line: Dr 2130 / Cr cash|bank. §7.7.';

-- ---------------------------------------------------------------------
-- RLS. Attendance visible to the owner or hr.view; payroll to hr.view. Own
-- attendance capture allowed; payroll posting via definer RPCs only.
-- ---------------------------------------------------------------------
alter table attendance    enable row level security;
alter table payroll_runs  enable row level security;
alter table payroll_lines enable row level security;

create policy read_attendance on attendance for select to authenticated
  using (user_id = current_app_user() or has_permission('hr.view'));
create policy read_payroll_runs on payroll_runs for select to authenticated
  using (has_permission('hr.view'));
create policy read_payroll_lines on payroll_lines for select to authenticated
  using (has_permission('hr.view') or user_id = current_app_user());

-- attendance entry: HR managers (any user), or self check-in
create policy manage_attendance on attendance for all to authenticated
  using (has_permission('hr.manage') or user_id = current_app_user())
  with check (has_permission('hr.manage') or user_id = current_app_user());
-- payroll_runs / payroll_lines: definer-only writes.

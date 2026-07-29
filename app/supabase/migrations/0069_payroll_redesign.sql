-- =====================================================================
-- 0069_payroll_redesign.sql  ·  Warehouse attendance & real-time pay
--
-- Extends the payroll module with:
--   employee_profiles   — per-worker personal details (photo, aadhar, etc.)
--   shift_templates     — predefined warehouse shift schedules
--   pay_mappings        — hours-range → amount rules for daily-wage calc
--   worker_transactions — unified running ledger (attendance credits,
--                         payments, advances, adjustments)
--   calendar_days       — working / non-working day tracking
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. employee_profiles
-- ---------------------------------------------------------------------
create table if not exists employee_profiles (
  id           uuid         primary key default gen_random_uuid(),
  user_id      uuid         not null references users(id) on delete cascade,
  photo_url    text,
  aadhar_number text,
  phone        text,
  address      text,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create unique index if not exists idx_employee_profiles_user on employee_profiles(user_id);

comment on table  employee_profiles            is 'Per-worker personal details (photo, aadhar, phone, address). §7.7.';
comment on column employee_profiles.photo_url  is 'Profile photo URL';
comment on column employee_profiles.aadhar_number is 'Aadhaar number';
comment on column employee_profiles.phone      is 'Contact phone number';
comment on column employee_profiles.address    is 'Residential address';

-- ---------------------------------------------------------------------
-- 2. shift_templates
-- ---------------------------------------------------------------------
create table if not exists shift_templates (
  id           uuid         primary key default gen_random_uuid(),
  name         text         not null,
  start_time   time         not null,
  end_time     time         not null,
  total_hours  numeric(4,1) not null,
  created_at   timestamptz  not null default now()
);

comment on table  shift_templates               is 'Predefined warehouse shift schedules. §7.7.';
comment on column shift_templates.name           is 'Display name, e.g. "Warehouse Day"';
comment on column shift_templates.start_time     is 'Shift start time, e.g. 09:00';
comment on column shift_templates.end_time       is 'Shift end time, e.g. 18:00';
comment on column shift_templates.total_hours    is 'Total shift hours, e.g. 9.0';

-- ---------------------------------------------------------------------
-- 3. pay_mappings
-- ---------------------------------------------------------------------
create table if not exists pay_mappings (
  id          uuid          primary key default gen_random_uuid(),
  hours_min   numeric(4,1)  not null,
  hours_max   numeric(4,1)  not null,
  amount      numeric(10,2) not null,
  created_at  timestamptz   not null default now()
);

comment on table  pay_mappings            is 'Hours-range → amount rules for daily-wage pay computation. §7.7.';
comment on column pay_mappings.hours_min  is 'Inclusive lower bound (hours)';
comment on column pay_mappings.hours_max  is 'Exclusive upper bound (hours)';
comment on column pay_mappings.amount     is 'Pay amount for this bracket';

-- ---------------------------------------------------------------------
-- 4. worker_transactions
-- ---------------------------------------------------------------------
create table if not exists worker_transactions (
  id                uuid         primary key default gen_random_uuid(),
  user_id           uuid         not null references users(id) on delete cascade,
  transaction_date  date         not null,
  type              text         not null default 'attendance_pay',
  amount            numeric(12,2) not null,
  reference_id      uuid,
  note              text,
  created_by        uuid         references users(id) on delete set null,
  created_at        timestamptz  not null default now()
);

create index if not exists idx_worker_transactions_user     on worker_transactions(user_id);
create index if not exists idx_worker_transactions_date     on worker_transactions(transaction_date);
create index if not exists idx_worker_transactions_type     on worker_transactions(type);
create index if not exists idx_worker_transactions_ref      on worker_transactions(reference_id);

comment on table  worker_transactions              is 'Unified running ledger for worker pay. §7.7.';
comment on column worker_transactions.user_id      is 'Worker (FK → users)';
comment on column worker_transactions.transaction_date is 'Date of transaction';
comment on column worker_transactions.type         is 'attendance_pay | payment | advance | adjustment';
comment on column worker_transactions.amount       is 'Positive = WH owes worker; Negative = worker owes WH';
comment on column worker_transactions.reference_id is 'Optional FK reference (attendance.id, payments.id)';
comment on column worker_transactions.created_by   is 'Who recorded this transaction';

-- ---------------------------------------------------------------------
-- 5. calendar_days
-- ---------------------------------------------------------------------
create table if not exists calendar_days (
  id            uuid         primary key default gen_random_uuid(),
  date          date         not null unique,
  is_working    boolean      not null default true,
  holiday_name  text,
  notes         text,
  created_at    timestamptz  not null default now()
);

comment on table  calendar_days             is 'Working / non-working day tracking. §7.7.';
comment on column calendar_days.date        is 'Calendar date (unique)';
comment on column calendar_days.is_working  is 'true = working day, false = holiday/week-off';
comment on column calendar_days.holiday_name is 'Optional holiday label, e.g. "Diwali", "Sunday"';

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table employee_profiles   enable row level security;
alter table shift_templates     enable row level security;
alter table pay_mappings        enable row level security;
alter table worker_transactions enable row level security;
alter table calendar_days       enable row level security;

-- Each table gets two policies: hr.view (read) and hr.manage (write)

do $$ begin
  -- employee_profiles
  if not exists (select 1 from pg_policies where tablename='employee_profiles' and policyname='hr.view can read employee_profiles') then
    create policy "hr.view can read employee_profiles" on employee_profiles for select using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id in ('hr.view','hr.manage'))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='employee_profiles' and policyname='hr.manage can write employee_profiles') then
    create policy "hr.manage can write employee_profiles" on employee_profiles for all using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id = 'hr.manage')
    );
  end if;

  -- shift_templates
  if not exists (select 1 from pg_policies where tablename='shift_templates' and policyname='hr.view can read shift_templates') then
    create policy "hr.view can read shift_templates" on shift_templates for select using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id in ('hr.view','hr.manage'))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='shift_templates' and policyname='hr.manage can write shift_templates') then
    create policy "hr.manage can write shift_templates" on shift_templates for all using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id = 'hr.manage')
    );
  end if;

  -- pay_mappings
  if not exists (select 1 from pg_policies where tablename='pay_mappings' and policyname='hr.view can read pay_mappings') then
    create policy "hr.view can read pay_mappings" on pay_mappings for select using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id in ('hr.view','hr.manage'))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='pay_mappings' and policyname='hr.manage can write pay_mappings') then
    create policy "hr.manage can write pay_mappings" on pay_mappings for all using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id = 'hr.manage')
    );
  end if;

  -- worker_transactions
  if not exists (select 1 from pg_policies where tablename='worker_transactions' and policyname='hr.view can read worker_transactions') then
    create policy "hr.view can read worker_transactions" on worker_transactions for select using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id in ('hr.view','hr.manage'))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='worker_transactions' and policyname='hr.manage can write worker_transactions') then
    create policy "hr.manage can write worker_transactions" on worker_transactions for all using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id = 'hr.manage')
    );
  end if;

  -- calendar_days
  if not exists (select 1 from pg_policies where tablename='calendar_days' and policyname='hr.view can read calendar_days') then
    create policy "hr.view can read calendar_days" on calendar_days for select using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id in ('hr.view','hr.manage'))
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='calendar_days' and policyname='hr.manage can write calendar_days') then
    create policy "hr.manage can write calendar_days" on calendar_days for all using (
      exists (select 1 from user_roles where user_id = auth.uid() and role_id = 'hr.manage')
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Seed defaults
-- ---------------------------------------------------------------------
insert into shift_templates (name, start_time, end_time, total_hours) values
  ('Warehouse Day',   '09:00', '18:00', 9.0)
 on conflict do nothing;

insert into pay_mappings (hours_min, hours_max, amount) values
  (0,   4,   300),
  (4,   8,   600),
  (8,  10,   750),
  (10, 12,   900),
  (12, 99,  1100)
 on conflict do nothing;

-- ---------------------------------------------------------------------
-- 8. Audit trigger for worker_transactions
-- ---------------------------------------------------------------------
create or replace function audit_worker_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if tg_op = 'INSERT' then
    perform write_audit('insert', 'worker_transactions', new.id::text,
      format('Worker tx: %s +%s (%s)', new.user_id, new.amount, new.type),
      to_jsonb(new), v_actor);
  elsif tg_op = 'DELETE' then
    perform write_audit('delete', 'worker_transactions', old.id::text,
      format('Worker tx deleted: %s %s (%s)', old.user_id, old.amount, old.type),
      to_jsonb(old), v_actor);
  end if;
  return null;
end $$;

drop trigger if exists trg_worker_transactions_audit on worker_transactions;
create trigger trg_worker_transactions_audit
  after insert or delete on worker_transactions
  for each row execute function audit_worker_transactions();

comment on function audit_worker_transactions is 'Audit trail for worker_transactions. §7.7.';

-- ---------------------------------------------------------------------
-- 9. Utility: get_worker_balance
-- ---------------------------------------------------------------------
create or replace function get_worker_balance(p_user_id uuid)
returns numeric(12,2)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) from worker_transactions where user_id = p_user_id;
$$;

comment on function get_worker_balance is 'Return running balance for a worker. Positive = WH owes them. §7.7.';

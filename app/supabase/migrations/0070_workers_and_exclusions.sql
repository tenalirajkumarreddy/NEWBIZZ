-- =====================================================================
-- 0070_workers_and_exclusions.sql  ·  Non-app-user workers + exclusions
--
-- 1. Create workers table (independent of auth users)
-- 2. Add worker_id FK to attendance, worker_transactions, user_pay_config
-- 3. Make user_id nullable in those tables (one of user_id or worker_id)
-- 4. Add exclude_from_payroll flag to user_pay_config
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. workers table
-- ---------------------------------------------------------------------
create table if not exists workers (
  id            uuid         primary key default gen_random_uuid(),
  full_name     text         not null,
  photo_url     text,
  aadhar_number text,
  phone         text,
  address       text,
  status        text         not null default 'active',
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

comment on table  workers             is 'Non-app-user workers for attendance & payroll. §7.7.';
comment on column workers.full_name   is 'Worker display name';
comment on column workers.status      is 'active | inactive';

-- ---------------------------------------------------------------------
-- 2. Extend attendance
-- ---------------------------------------------------------------------
alter table attendance
  add column if not exists worker_id uuid references workers(id) on delete cascade,
  alter column user_id drop not null;

-- Ensure exactly one of user_id / worker_id is set
alter table attendance drop constraint if exists chk_attendance_entity;
alter table attendance add constraint chk_attendance_entity
  check ((user_id is not null and worker_id is null) or (user_id is null and worker_id is not null));

create index if not exists idx_attendance_worker on attendance(worker_id);

-- ---------------------------------------------------------------------
-- 3. Extend worker_transactions
-- ---------------------------------------------------------------------
alter table worker_transactions
  add column if not exists worker_id uuid references workers(id) on delete cascade,
  alter column user_id drop not null;

alter table worker_transactions drop constraint if exists chk_wtx_entity;
alter table worker_transactions add constraint chk_wtx_entity
  check ((user_id is not null and worker_id is null) or (user_id is null and worker_id is not null));

create index if not exists idx_worker_transactions_worker on worker_transactions(worker_id);

-- ---------------------------------------------------------------------
-- 4. Extend user_pay_config
--    Current PK is user_id. We change it to a new id column to allow
--    entries for both app users (user_id) and workers (worker_id).
-- ---------------------------------------------------------------------
alter table user_pay_config
  add column if not exists id uuid,
  add column if not exists worker_id       uuid    references workers(id) on delete cascade,
  add column if not exists exclude_from_payroll boolean not null default false;

-- Populate id for existing rows
update user_pay_config set id = gen_random_uuid() where id is null;

-- Now make id required and switch PK
alter table user_pay_config alter column id set not null;
alter table user_pay_config drop constraint if exists user_pay_config_pkey;
alter table user_pay_config add primary key (id);
alter table user_pay_config alter column user_id drop not null;

-- Unique per entity type (user_id or worker_id)
drop index if exists idx_user_pay_config_user;
create unique index idx_user_pay_config_user on user_pay_config(user_id) where user_id is not null;
drop index if exists idx_user_pay_config_worker;
create unique index idx_user_pay_config_worker on user_pay_config(worker_id) where worker_id is not null;

comment on column user_pay_config.exclude_from_payroll is 'If true, this user is excluded from attendance & payroll lists';

-- ---------------------------------------------------------------------
-- 5. Update RLS for workers
-- ---------------------------------------------------------------------
alter table workers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='workers' and policyname='read_workers') then
    create policy "read_workers" on workers for select using (has_permission('hr.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='workers' and policyname='manage_workers') then
    create policy "manage_workers" on workers for all using (has_permission('hr.manage'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Helper: unified payroll people list
-- ---------------------------------------------------------------------
create or replace function list_payroll_people()
returns table(
  entity_type     text,
  entity_id       uuid,
  full_name       text,
  photo_url       text,
  aadhar_number   text,
  phone           text,
  address         text
)
language sql
security definer
set search_path = public
as $$
  -- Active app users not excluded from payroll
  select 'user'::text, u.id, u.full_name, ep.photo_url, ep.aadhar_number, ep.phone, ep.address
    from users u
    left join employee_profiles ep on ep.user_id = u.id
    left join user_pay_config pc on pc.user_id = u.id
   where u.status = 'active'
     and (pc.exclude_from_payroll is null or pc.exclude_from_payroll = false)
  union all
  -- Active manual workers
  select 'worker'::text, w.id, w.full_name, w.photo_url, w.aadhar_number, w.phone, w.address
    from workers w
   where w.status = 'active'
  order by full_name;
$$;

comment on function list_payroll_people is 'Unified list of all people tracked for attendance & payroll. §7.7.';

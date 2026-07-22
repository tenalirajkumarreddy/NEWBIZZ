-- 0045_expenses_petty_cash.sql  (§5.6 Expenses & Petty Cash — adds C6)
--
-- Capture operating expenses paid from a user's cash custody, the petty-cash
-- box, or the bank, with an approve/reject gate. Money only moves on approval,
-- through post_journal (Inv 3/4). Adds a dedicated Petty Cash ledger (1115),
-- distinct from user custody (2140) and main cash (1110).
--
-- Accounting on approve_expense:
--   Dr [expense ledger for the category]     amount
--      Cr 1110 | 1115 | 2140                 amount   (per source)
--   For source=user_holding the credit carries party_type='user' party_id=user
--   and _bump_user_cash(user, -amount) keeps the holdings read-model in step.


-- 1) Petty Cash ledger — a general asset ledger, topped up by contra from bank.
insert into chart_of_accounts (code, name, type, normal_side, is_postable, is_system, status)
values ('1115', 'Petty Cash', 'asset', 'debit', true, true, 'active')
on conflict (code) do nothing;

-- 2) Enums (freshly created — safe to use later in this same transaction).
do $$ begin
  create type expense_category as enum
    ('fuel','repair','salary','rent','power','transport','office','bank_charges','misc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_source as enum ('user_holding','petty_cash','bank');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- 3) Expenses table. journal_id is set once approved; vehicle_id is a nullable
--    forward hook for Phase 4 fuel attribution (no FK yet — vehicles is §7.2).
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  expense_no    text not null,
  fy_id         uuid not null references financial_years(id),
  expense_date  date not null,
  user_id       uuid references users(id),           -- whose custody, when source=user_holding
  category      expense_category not null,
  account_code  text not null references chart_of_accounts(code),  -- expense ledger to debit
  source        expense_source not null,
  amount        numeric(14,2) not null check (amount > 0),
  note          text,
  bill_url      text,
  vehicle_id    uuid,                                 -- Phase 4 hook
  status        expense_status not null default 'pending',
  journal_id    uuid references journal_entries(id),  -- set on approval
  created_by    uuid,
  created_at    timestamptz not null default now(),
  approved_by   uuid,
  approved_at   timestamptz,
  rejected_by   uuid,
  rejected_at   timestamptz,
  reject_reason text,
  unique (fy_id, expense_no),
  -- a user must be named when the money comes out of personal custody
  constraint expenses_user_when_holding
    check (source <> 'user_holding' or user_id is not null)
);

create index if not exists expenses_status_idx on expenses (status, expense_date desc);
create index if not exists expenses_fy_idx on expenses (fy_id);

-- 4) Number series for the EXP document type, one row per FY.
insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select 'expense', fy.id, 'EXP', 4, 1 from financial_years fy
on conflict do nothing;


-- 5) RPCs (separate txn so the enums/table above are committed and usable).

-- Map a source enum → the ledger account code to credit.
create or replace function _expense_source_account(p_source expense_source)
returns text language sql immutable as $$
  select case p_source
    when 'petty_cash' then '1115'
    when 'bank'       then '1120'
    when 'user_holding' then '2140'
  end;
$$;

-- record_expense: create a pending expense (no ledger movement yet).
create or replace function record_expense(p_header jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_date   date := coalesce((p_header->>'expense_date')::date, current_date);
  v_fy     uuid := fy_for_date(v_date);      -- enforces OPEN fy
  v_source expense_source := (p_header->>'source')::expense_source;
  v_user   uuid := nullif(p_header->>'user_id','')::uuid;
  v_no     text;
  v_id     uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'record_expense: not authorized';
  end if;

  -- a self-serve expense from the caller's own custody defaults user_id to them
  if v_source = 'user_holding' and v_user is null then
    v_user := v_actor;
  end if;

  v_no := next_number('expense', v_date);

  insert into expenses
    (expense_no, fy_id, expense_date, user_id, category, account_code,
     source, amount, note, bill_url, vehicle_id, status, created_by)
  values
    (v_no, v_fy, v_date, v_user,
     (p_header->>'category')::expense_category,
     p_header->>'account_code',
     v_source,
     (p_header->>'amount')::numeric,
     nullif(p_header->>'note',''),
     nullif(p_header->>'bill_url',''),
     nullif(p_header->>'vehicle_id','')::uuid,
     'pending', v_actor)
  returning id into v_id;

  perform write_audit('insert', 'expenses', v_id::text,
            format('Expense %s logged: %s %s', v_no, p_header->>'category', (p_header->>'amount')),
            jsonb_build_object('expense_no', v_no, 'amount', (p_header->>'amount')::numeric), v_actor);
  return v_id;
end $fn$;

-- approve_expense: post the journal (Dr category / Cr source) and mark approved.
create or replace function approve_expense(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor    uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_exp      expenses%rowtype;
  v_cr_code  text;
  v_lines    jsonb;
  v_entry    uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'approve_expense: not authorized';
  end if;

  select * into v_exp from expenses where id = p_id for update;
  if not found then
    raise exception 'approve_expense: expense % not found', p_id;
  end if;
  if v_exp.status <> 'pending' then
    raise exception 'approve_expense: expense is % (only pending can be approved)', v_exp.status;
  end if;

  v_cr_code := _expense_source_account(v_exp.source);

  -- Debit the expense ledger; credit the money source. For user custody the
  -- credit carries the party so 2140 stays reconcilable per user.
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_exp.account_code, 'debit', v_exp.amount, 'credit', 0,
                       'memo', coalesce(v_exp.note, v_exp.category::text)),
    case when v_exp.source = 'user_holding' then
      jsonb_build_object('account_code', v_cr_code, 'debit', 0, 'credit', v_exp.amount,
                         'party_type', 'user', 'party_id', v_exp.user_id,
                         'memo', 'Expense from custody')
    else
      jsonb_build_object('account_code', v_cr_code, 'debit', 0, 'credit', v_exp.amount)
    end
  );

  v_entry := post_journal(
    jsonb_build_object('entry_date', v_exp.expense_date, 'source', 'expense',
                       'source_id', v_exp.id,
                       'narration', format('Expense %s — %s', v_exp.expense_no, v_exp.category)),
    v_lines);

  -- keep the user-cash holdings read-model in step with the 2140 credit
  if v_exp.source = 'user_holding' then
    perform _bump_user_cash(v_exp.user_id, -v_exp.amount);
  end if;

  update expenses
     set status = 'approved', journal_id = v_entry,
         approved_by = v_actor, approved_at = now()
   where id = p_id;

  perform write_audit('approve', 'expenses', p_id::text,
            format('Expense %s approved: %s', v_exp.expense_no, v_exp.amount),
            jsonb_build_object('journal_id', v_entry, 'amount', v_exp.amount), v_actor);
  return v_entry;
end $fn$;

-- reject_expense: terminal, no ledger movement.
create or replace function reject_expense(p_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_exp   expenses%rowtype;
begin
  if not has_permission('accounting.manage') then
    raise exception 'reject_expense: not authorized';
  end if;
  select * into v_exp from expenses where id = p_id for update;
  if not found then
    raise exception 'reject_expense: expense % not found', p_id;
  end if;
  if v_exp.status <> 'pending' then
    raise exception 'reject_expense: expense is % (only pending can be rejected)', v_exp.status;
  end if;

  update expenses
     set status = 'rejected', rejected_by = v_actor, rejected_at = now(),
         reject_reason = nullif(p_reason,'')
   where id = p_id;

  perform write_audit('reject', 'expenses', p_id::text,
            format('Expense %s rejected', v_exp.expense_no),
            jsonb_build_object('reason', p_reason), v_actor);
  return p_id;
end $fn$;

-- topup_petty_cash: contra from bank into the petty-cash box (Dr 1115 / Cr 1120).
create or replace function topup_petty_cash(p_amount numeric, p_date date default current_date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_entry uuid;
begin
  if not has_permission('accounting.manage') then
    raise exception 'topup_petty_cash: not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'topup_petty_cash: amount must be positive';
  end if;

  v_entry := post_journal(
    jsonb_build_object('entry_date', coalesce(p_date, current_date), 'source', 'contra',
                       'narration', coalesce(nullif(p_note,''), 'Petty cash top-up')),
    jsonb_build_array(
      jsonb_build_object('account_code', '1115', 'debit', p_amount, 'credit', 0, 'memo', 'Petty cash top-up'),
      jsonb_build_object('account_code', '1120', 'debit', 0, 'credit', p_amount, 'memo', 'Petty cash top-up')
    ));
  return v_entry;
end $fn$;

-- 6) RLS + grants. Reads are open to authenticated (consistent with the rest of
--    the ledger surfaces); every write goes through the gated RPCs above.
alter table expenses enable row level security;
drop policy if exists read_all_auth on expenses;
create policy read_all_auth on expenses for select to authenticated using (true);

revoke all on function record_expense(jsonb) from anon, public;
revoke all on function approve_expense(uuid) from anon, public;
revoke all on function reject_expense(uuid, text) from anon, public;
revoke all on function topup_petty_cash(numeric, date, text) from anon, public;
revoke all on function _expense_source_account(expense_source) from anon, public;
grant execute on function record_expense(jsonb) to authenticated;
grant execute on function approve_expense(uuid) to authenticated;
grant execute on function reject_expense(uuid, text) to authenticated;
grant execute on function topup_petty_cash(numeric, date, text) to authenticated;


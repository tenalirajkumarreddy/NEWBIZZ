-- =====================================================================
-- 0025_bank_reconciliation.sql  ·  Phase 4 — Bank recon & cheque registry  (§7.6)
--
-- Reconcile the book bank balance (GL 1120, the only truth — Invariant 1)
-- against imported bank statements, and track the cheque lifecycle. Every
-- money move still goes through post_journal / reverse_journal (Invariants 3,6):
--   • bank charges     Dr 5610 Bank Charges      / Cr 1120 Bank
--   • bank interest     Dr 1120 Bank              / Cr 4200 Other Income
--   • bounced cheque    reverse_journal(original receipt/payment entry)
-- Statement lines are an EXTERNAL read-model matched against journal_lines on
-- the bank account; matching writes no ledger — it only annotates which book
-- entry a statement line corresponds to. BRS difference resolves to ₹0 once
-- every line is matched and bank-only items (charges/interest) are posted.
-- =====================================================================

create type bank_txn_direction   as enum ('credit','debit');   -- credit = money in
create type bank_adj_type        as enum ('bank_charge','interest_income','other');
create type cheque_direction     as enum ('inbound','outbound'); -- received | issued
create type cheque_status        as enum ('registered','deposited','cleared','bounced','cancelled');

-- ---------------------------------------------------------------------
-- bank_accounts — a physical bank account mapped to a GL control account
-- (defaults to 1120 Bank Accounts). opening_* mirror the statement side.
-- ---------------------------------------------------------------------
create table bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  bank_name        text,
  account_no       text,
  ifsc             text,
  gl_account_code  text not null default '1120' references chart_of_accounts(code),
  opening_balance  numeric(14,2) not null default 0,   -- statement opening
  opening_date     date,
  status           text not null default 'active',
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
comment on column bank_accounts.gl_account_code is 'GL account this bank maps to (truth side of the recon); usually 1120.';

-- ---------------------------------------------------------------------
-- bank_csv_column_mapping — a saved import template per bank account.
-- ---------------------------------------------------------------------
create table bank_csv_column_mapping (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id) on delete cascade,
  mapping_json    jsonb not null default '{}'::jsonb,   -- {date, description, ref, debit, credit, balance}
  date_format     text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (bank_account_id)
);

-- ---------------------------------------------------------------------
-- bank_statement_imports — one uploaded file/batch. file_hash dedups a whole
-- re-uploaded file; individual rows dedup separately (below).
-- ---------------------------------------------------------------------
create table bank_statement_imports (
  id                uuid primary key default gen_random_uuid(),
  bank_account_id   uuid not null references bank_accounts(id) on delete cascade,
  file_name         text,
  file_hash         text,
  period_start      date,
  period_end        date,
  closing_balance   numeric(14,2),
  row_count         int not null default 0,
  inserted_count    int not null default 0,
  duplicate_count   int not null default 0,
  imported_by       uuid references users(id),
  imported_at       timestamptz not null default now(),
  unique (bank_account_id, file_hash)
);

-- ---------------------------------------------------------------------
-- bank_transactions — parsed statement lines. amount is SIGNED (+in/-out);
-- dedup_key makes a duplicate CSV import a no-op (unique per account).
-- ---------------------------------------------------------------------
create table bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  bank_account_id   uuid not null references bank_accounts(id) on delete cascade,
  import_id         uuid references bank_statement_imports(id) on delete set null,
  txn_date          date not null,
  value_date        date,
  description       text,
  ref_no            text,
  amount            numeric(14,2) not null,             -- + credit (in), - debit (out)
  direction         bank_txn_direction not null,
  running_balance   numeric(14,2),
  dedup_key         text not null,
  matched           boolean not null default false,
  matched_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (bank_account_id, dedup_key)
);
create index bank_txn_acct_date_idx on bank_transactions (bank_account_id, txn_date);
create index bank_txn_unmatched_idx on bank_transactions (bank_account_id) where not matched;

-- ---------------------------------------------------------------------
-- bank_txn_matches — link a statement line to a book journal entry (or a
-- receipt / payment). Many book entries may back one statement line and vice
-- versa; this is the reconciliation annotation (no ledger effect).
-- ---------------------------------------------------------------------
create table bank_txn_matches (
  id                  uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references bank_transactions(id) on delete cascade,
  journal_entry_id    uuid references journal_entries(id),
  receipt_id          uuid references customer_receipts(id),
  payment_id          uuid references supplier_payments(id),
  amount              numeric(14,2) not null default 0,
  matched_by          uuid references users(id),
  matched_at          timestamptz not null default now(),
  check (journal_entry_id is not null or receipt_id is not null or payment_id is not null)
);
create index bank_txn_matches_txn_idx on bank_txn_matches (bank_transaction_id);

-- ---------------------------------------------------------------------
-- reconciliation_adjustments — bank-only items surfaced during recon and
-- posted to the ledger (charges, interest). journal_entry_id is the truth link.
-- ---------------------------------------------------------------------
create table reconciliation_adjustments (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id),
  adj_type        bank_adj_type not null,
  amount          numeric(14,2) not null check (amount > 0),
  adj_date        date not null default current_date,
  narration       text,
  journal_entry_id uuid references journal_entries(id),
  bank_transaction_id uuid references bank_transactions(id),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- cheque_registry — cheque lifecycle. For inbound (customer) cheques the
-- original receipt journal is linked; a bounce reverses it. Outbound cheques
-- link the supplier-payment journal similarly.
-- ---------------------------------------------------------------------
create table cheque_registry (
  id               uuid primary key default gen_random_uuid(),
  bank_account_id  uuid references bank_accounts(id),
  direction        cheque_direction not null,
  cheque_no        text not null,
  party_type       text,                                -- 'customer' | 'supplier'
  party_id         uuid,
  amount           numeric(14,2) not null check (amount > 0),
  cheque_date      date,
  status           cheque_status not null default 'registered',
  receipt_id       uuid references customer_receipts(id),
  payment_id       uuid references supplier_payments(id),
  journal_entry_id uuid references journal_entries(id),  -- original clearing entry
  bounce_journal_id uuid references journal_entries(id), -- reversal on bounce
  deposited_at     timestamptz,
  cleared_at       timestamptz,
  bounced_at       timestamptz,
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
create index cheque_registry_status_idx on cheque_registry (status);
create index cheque_registry_party_idx  on cheque_registry (party_type, party_id);

create trigger bank_accounts_touch  before update on bank_accounts for each row execute function touch_updated_at();
create trigger bank_mapping_touch    before update on bank_csv_column_mapping for each row execute function touch_updated_at();
create trigger cheque_registry_touch before update on cheque_registry for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- import_bank_statement(bank_account, rows, opts) -> jsonb
-- Idempotent statement import. Each row: { txn_date, amount (signed) | debit,
-- credit; description?, ref_no?, value_date?, running_balance? }. Duplicate
-- rows (same account+date+amount+ref/description) are skipped, so re-importing
-- the same file is a no-op. opts: { file_name?, file_hash?, period_start?,
-- period_end?, closing_balance? }. Returns { import_id, inserted, duplicates }.
-- ---------------------------------------------------------------------
create or replace function import_bank_statement(
  p_bank_account uuid, p_rows jsonb, p_opts jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import  uuid;
  v_row     jsonb;
  v_amt     numeric(14,2);
  v_dir     bank_txn_direction;
  v_date    date;
  v_key     text;
  v_ins     int := 0;
  v_dup     int := 0;
  v_total   int := 0;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if not exists (select 1 from bank_accounts where id = p_bank_account) then
    raise exception 'import_bank_statement: unknown bank account %', p_bank_account;
  end if;

  insert into bank_statement_imports (bank_account_id, file_name, file_hash,
      period_start, period_end, closing_balance, row_count, imported_by)
  values (p_bank_account, p_opts->>'file_name', p_opts->>'file_hash',
      nullif(p_opts->>'period_start','')::date, nullif(p_opts->>'period_end','')::date,
      nullif(p_opts->>'closing_balance','')::numeric,
      coalesce(jsonb_array_length(p_rows),0), v_actor)
  returning id into v_import;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_total := v_total + 1;
    -- amount: explicit signed 'amount', else credit - debit
    v_amt := coalesce((v_row->>'amount')::numeric,
                      coalesce((v_row->>'credit')::numeric,0)
                    - coalesce((v_row->>'debit')::numeric,0));
    v_date := (v_row->>'txn_date')::date;
    v_dir  := case when v_amt >= 0 then 'credit' else 'debit' end;
    v_key  := md5(v_date::text || '|' || v_amt::text || '|' ||
                  coalesce(nullif(v_row->>'ref_no',''), v_row->>'description', ''));

    insert into bank_transactions (bank_account_id, import_id, txn_date, value_date,
        description, ref_no, amount, direction, running_balance, dedup_key)
    values (p_bank_account, v_import, v_date, nullif(v_row->>'value_date','')::date,
        v_row->>'description', v_row->>'ref_no', v_amt, v_dir,
        nullif(v_row->>'running_balance','')::numeric, v_key)
    on conflict (bank_account_id, dedup_key) do nothing;

    if found then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
  end loop;

  update bank_statement_imports
     set inserted_count = v_ins, duplicate_count = v_dup where id = v_import;

  perform write_audit('insert','bank_statement_imports', v_import::text,
            format('Statement import: %s inserted, %s duplicate', v_ins, v_dup),
            jsonb_build_object('inserted', v_ins, 'duplicates', v_dup), v_actor);
  return jsonb_build_object('import_id', v_import, 'inserted', v_ins,
                            'duplicates', v_dup, 'total', v_total);
end $$;
comment on function import_bank_statement is 'Idempotent bank statement import; dedups rows so re-import is a no-op. §7.6.';

-- ---------------------------------------------------------------------
-- match_bank_txn(txn, target) -> match id
-- Annotate a statement line as reconciled against a book entry.
--   target: { journal_entry_id? | receipt_id? | payment_id?, amount? }
-- ---------------------------------------------------------------------
create or replace function match_bank_txn(p_txn uuid, p_target jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn   bank_transactions;
  v_match uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_txn from bank_transactions where id = p_txn;
  if not found then raise exception 'match_bank_txn: unknown txn %', p_txn; end if;

  insert into bank_txn_matches (bank_transaction_id, journal_entry_id, receipt_id,
                                payment_id, amount, matched_by)
  values (p_txn,
          nullif(p_target->>'journal_entry_id','')::uuid,
          nullif(p_target->>'receipt_id','')::uuid,
          nullif(p_target->>'payment_id','')::uuid,
          coalesce((p_target->>'amount')::numeric, abs(v_txn.amount)), v_actor)
  returning id into v_match;

  update bank_transactions set matched = true, matched_at = now() where id = p_txn;

  perform write_audit('update','bank_transactions', p_txn::text,
            'Statement line matched', p_target, v_actor);
  return v_match;
end $$;
comment on function match_bank_txn is 'Reconcile a statement line against a book entry (annotation only, no ledger). §7.6.';

-- ---------------------------------------------------------------------
-- post_reconciliation_adjustment(bank_account, amount, kind, opts) -> je id
-- Post a bank-only item to the ledger and record the adjustment.
--   bank_charge     -> Dr 5610 Bank Charges / Cr <bank GL>
--   interest_income -> Dr <bank GL>          / Cr 4200 Other Income
--   opts: { adj_date?, narration?, bank_transaction_id? }
-- ---------------------------------------------------------------------
create or replace function post_reconciliation_adjustment(
  p_bank_account uuid, p_amount numeric, p_kind bank_adj_type, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank   bank_accounts;
  v_gl     text;
  v_date   date := coalesce((p_opts->>'adj_date')::date, current_date);
  v_lines  jsonb;
  v_je     uuid;
  v_adj    uuid;
  v_txn    uuid := nullif(p_opts->>'bank_transaction_id','')::uuid;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'post_reconciliation_adjustment: amount must be > 0'; end if;
  select * into v_bank from bank_accounts where id = p_bank_account;
  if not found then raise exception 'post_reconciliation_adjustment: unknown bank account %', p_bank_account; end if;
  v_gl := v_bank.gl_account_code;

  if p_kind = 'bank_charge' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5610','debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code', v_gl, 'debit', 0, 'credit', p_amount));
  elsif p_kind = 'interest_income' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_gl, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code','4200','debit', 0, 'credit', p_amount));
  else
    raise exception 'post_reconciliation_adjustment: kind % needs explicit accounts (use post_journal)', p_kind;
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','voucher',
                       'source','bank_adjustment',
                       'narration', coalesce(p_opts->>'narration',
                         format('Bank %s on %s', p_kind, v_bank.name))),
    v_lines);

  insert into reconciliation_adjustments (bank_account_id, adj_type, amount, adj_date,
      narration, journal_entry_id, bank_transaction_id, created_by)
  values (p_bank_account, p_kind, p_amount, v_date, p_opts->>'narration', v_je, v_txn, v_actor)
  returning id into v_adj;

  update journal_entries set source_id = v_adj where id = v_je;
  -- auto-match the originating statement line if supplied
  if v_txn is not null then
    perform match_bank_txn(v_txn, jsonb_build_object('journal_entry_id', v_je::text, 'amount', p_amount));
  end if;

  perform write_audit('post','reconciliation_adjustments', v_adj::text,
            format('Bank %s: %s', p_kind, p_amount),
            jsonb_build_object('journal_entry_id', v_je, 'amount', p_amount), v_actor);
  return v_je;
end $$;
comment on function post_reconciliation_adjustment is 'Post a bank charge / interest surfaced in recon (Dr 5610 or Cr 4200). §7.6.';

-- ---------------------------------------------------------------------
-- bank_reconciliation(bank_account, as_on) -> table
-- BRS: book balance (GL truth) vs statement balance; unmatched counts on each
-- side; difference. After every line is matched and bank-only items posted,
-- difference resolves to ₹0.
-- ---------------------------------------------------------------------
create or replace function bank_reconciliation(p_bank_account uuid, p_as_on date default current_date)
returns table (
  book_balance        numeric,
  statement_balance   numeric,
  matched_count       int,
  unmatched_stmt_count int,
  unmatched_stmt_value numeric,
  difference          numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gl_id uuid;
  v_open  numeric(14,2);
begin
  select a.id, b.opening_balance into v_gl_id, v_open
    from bank_accounts b join chart_of_accounts a on a.code = b.gl_account_code
   where b.id = p_bank_account;
  if v_gl_id is null then raise exception 'bank_reconciliation: unknown bank account %', p_bank_account; end if;

  return query
  with book as (
    select coalesce(sum(l.debit - l.credit),0) as bal
      from journal_lines l
      join journal_entries e on e.id = l.entry_id
     where l.account_id = v_gl_id and e.entry_date <= p_as_on
  ),
  stmt as (
    select coalesce(sum(amount),0) as movement,
           count(*) filter (where matched) as m,
           count(*) filter (where not matched) as um,
           coalesce(sum(amount) filter (where not matched),0) as umv
      from bank_transactions
     where bank_account_id = p_bank_account and txn_date <= p_as_on
  )
  select book.bal,
         v_open + stmt.movement,
         stmt.m::int,
         stmt.um::int,
         stmt.umv,
         book.bal - (v_open + stmt.movement)
    from book, stmt;
end $$;
comment on function bank_reconciliation is 'BRS: GL book balance vs statement balance + unmatched items; diff → 0 when reconciled. §7.6.';

-- ---------------------------------------------------------------------
-- Cheque lifecycle. register → deposit → clear, or bounce (reverses the
-- original receipt/payment journal via reverse_journal, Invariant 6).
-- ---------------------------------------------------------------------
create or replace function register_cheque(p_header jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  insert into cheque_registry (bank_account_id, direction, cheque_no, party_type,
      party_id, amount, cheque_date, status, receipt_id, payment_id, journal_entry_id,
      notes, created_by)
  values (nullif(p_header->>'bank_account_id','')::uuid,
          (p_header->>'direction')::cheque_direction,
          p_header->>'cheque_no', p_header->>'party_type',
          nullif(p_header->>'party_id','')::uuid,
          (p_header->>'amount')::numeric,
          nullif(p_header->>'cheque_date','')::date,
          coalesce((p_header->>'status')::cheque_status,'registered'),
          nullif(p_header->>'receipt_id','')::uuid,
          nullif(p_header->>'payment_id','')::uuid,
          nullif(p_header->>'journal_entry_id','')::uuid,
          p_header->>'notes', v_actor)
  returning id into v_id;
  perform write_audit('insert','cheque_registry', v_id::text,
            format('Cheque %s registered', p_header->>'cheque_no'), p_header, v_actor);
  return v_id;
end $$;
comment on function register_cheque is 'Register a cheque (inbound/outbound) in the lifecycle tracker. §7.6.';

create or replace function set_cheque_status(p_cheque uuid, p_status cheque_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_status = 'bounced' then
    raise exception 'set_cheque_status: use bounce_cheque() to bounce (it reverses the ledger)';
  end if;
  update cheque_registry
     set status = p_status,
         deposited_at = case when p_status='deposited' then now() else deposited_at end,
         cleared_at   = case when p_status='cleared'   then now() else cleared_at end,
         updated_at = now()
   where id = p_cheque;
  if not found then raise exception 'set_cheque_status: unknown cheque %', p_cheque; end if;
  perform write_audit('update','cheque_registry', p_cheque::text,
            format('Cheque status → %s', p_status), null, v_actor);
end $$;
comment on function set_cheque_status is 'Advance a cheque status (deposited/cleared/cancelled); bounce uses bounce_cheque. §7.6.';

-- bounce_cheque(cheque, reason) -> reversal journal id
-- Reverses the original receipt/payment journal so bank & the party ledger are
-- restored, and marks the cheque bounced.
create or replace function bounce_cheque(p_cheque uuid, p_reason text default 'Cheque bounced')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c   cheque_registry;
  v_rev uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_c from cheque_registry where id = p_cheque;
  if not found then raise exception 'bounce_cheque: unknown cheque %', p_cheque; end if;
  if v_c.status = 'bounced' then raise exception 'bounce_cheque: cheque % already bounced', p_cheque; end if;
  if v_c.journal_entry_id is null then
    raise exception 'bounce_cheque: cheque % has no linked journal to reverse', p_cheque;
  end if;

  v_rev := reverse_journal(v_c.journal_entry_id, p_reason);

  update cheque_registry
     set status = 'bounced', bounce_journal_id = v_rev, bounced_at = now(), updated_at = now()
   where id = p_cheque;

  perform write_audit('void','cheque_registry', p_cheque::text,
            format('Cheque %s bounced', v_c.cheque_no),
            jsonb_build_object('reversal_entry_id', v_rev), v_actor);
  return v_rev;
end $$;
comment on function bounce_cheque is 'Bounce a cheque: reverse the original journal (Invariant 6) and mark bounced. §7.6.';

-- ---------------------------------------------------------------------
-- RLS. Bank data is finance-sensitive: read by journal.view or accounting.manage;
-- masters/mappings/matches editable with accounting.manage. All ledger posting
-- (imports write no ledger; adjustments/cheques post via definer RPCs).
-- ---------------------------------------------------------------------
alter table bank_accounts              enable row level security;
alter table bank_csv_column_mapping    enable row level security;
alter table bank_statement_imports     enable row level security;
alter table bank_transactions          enable row level security;
alter table bank_txn_matches           enable row level security;
alter table reconciliation_adjustments enable row level security;
alter table cheque_registry            enable row level security;

create policy read_bank on bank_accounts              for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));
create policy read_bank on bank_csv_column_mapping    for select to authenticated using (has_permission('accounting.manage'));
create policy read_bank on bank_statement_imports     for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));
create policy read_bank on bank_transactions          for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));
create policy read_bank on bank_txn_matches           for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));
create policy read_bank on reconciliation_adjustments for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));
create policy read_bank on cheque_registry            for select to authenticated using (has_permission('journal.view') or has_permission('accounting.manage'));

-- masters + reconciliation annotations: accountant/manager
create policy manage_bank on bank_accounts           for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_bank on bank_csv_column_mapping for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
create policy manage_bank on bank_txn_matches        for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
-- bank_statement_imports / bank_transactions written by import_bank_statement (definer);
-- reconciliation_adjustments / cheque_registry written by their definer RPCs.
-- No direct-write policy on those four (Invariant 3 for the money-posting ones).

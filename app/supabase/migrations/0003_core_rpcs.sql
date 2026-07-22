-- =====================================================================
-- 0003_core_rpcs.sql  ·  the transaction layer
-- next_number()  · gap-free doc numbers under a row lock (Invariant 8)
-- write_audit()   · append-only audit helper (Invariant 7)
-- post_journal()  · the ONLY way money/stock value enters the ledger
--                   (Invariants 1,3,4,5,6,8) — balanced, single transaction
-- assert_trial_balance() / rebuild_account_balances() · read-model tools (Inv 5)
-- All RPCs are security definer; callable via RLS-checked wrappers later.
-- =====================================================================

-- ---------------------------------------------------------------------
-- fy_for_date(business_date) -> financial_years.id
-- Resolves which FY owns a business date; raises if none / closed.
-- ---------------------------------------------------------------------
create or replace function fy_for_date(p_date date)
returns uuid
language plpgsql stable as $$
declare v_fy uuid; v_status fy_status;
begin
  select id, status into v_fy, v_status
    from financial_years
   where p_date between start_date and end_date
   order by start_date desc
   limit 1;
  if v_fy is null then
    raise exception 'No financial year defined for date %', p_date;
  end if;
  if v_status <> 'open' then
    raise exception 'Financial year for % is closed; posting refused', p_date;
  end if;
  return v_fy;
end $$;

-- ---------------------------------------------------------------------
-- next_number(doc_type, business_date) -> formatted document number
-- Invariant 8: allocates under FOR UPDATE row lock, gap-free per FY.
-- Auto-creates the series row on first use for that (doc_type, fy).
-- ---------------------------------------------------------------------
create or replace function next_number(p_doc_type text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy      uuid;
  v_prefix  text;
  v_val     bigint;
  v_pad     int;
begin
  v_fy := fy_for_date(p_date);

  -- ensure a row exists (default prefix/pad), then lock it.
  insert into number_series (doc_type, fy_id)
    values (p_doc_type, v_fy)
    on conflict (doc_type, fy_id) do nothing;

  select next_val, prefix, pad_width
    into v_val, v_prefix, v_pad
    from number_series
   where doc_type = p_doc_type and fy_id = v_fy
   for update;                                  -- <<< row lock: serialises allocation

  update number_series
     set next_val = next_val + 1
   where doc_type = p_doc_type and fy_id = v_fy;

  return v_prefix || lpad(v_val::text, v_pad, '0');
end $$;
comment on function next_number is 'Gap-free per (doc_type, FY). Row-locked. Invariant 8.';

-- ---------------------------------------------------------------------
-- write_audit(...)  — append a single audit_log row (Invariant 7).
-- ---------------------------------------------------------------------
create or replace function write_audit(
  p_action   audit_action,
  p_entity   text,
  p_entity_id text,
  p_summary  text default null,
  p_diff     jsonb default null,
  p_actor    uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, summary, diff)
    values (coalesce(p_actor, nullif(current_setting('request.jwt.claim.sub', true),'')::uuid),
            p_action, p_entity, p_entity_id, p_summary, p_diff);
end $$;

-- ---------------------------------------------------------------------
-- post_journal(header jsonb, lines jsonb) -> journal_entries.id
--
-- The single gateway for value into the ledger. One transaction (Inv 4).
--   header: { entry_date, source, source_id?, narration?, doc_type? }
--   lines : [ { account_code | account_id, debit, credit,
--               party_type?, party_id?, cost_center_code?, branch_id?,
--               stock_item_id?, stock_qty?, memo? }, ... ]
--
-- Guarantees:
--   * Σdebit = Σcredit  (balanced, else raise)              — double entry
--   * FY resolved from entry_date and must be OPEN          — period control
--   * entry_no from next_number under row lock              — Invariant 8
--   * builds entry as 'draft', inserts lines, flips 'posted'— Invariant 6 guard
--   * refreshes account_balances read-model                 — Invariant 5
--   * writes audit_log                                      — Invariant 7
-- ---------------------------------------------------------------------
create or replace function post_journal(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fy         uuid;
  v_date       date;
  v_doc_type   text;
  v_entry_no   text;
  v_entry_id   uuid;
  v_actor      uuid;
  v_line       jsonb;
  v_acct       uuid;
  v_cc         uuid;
  v_dr         numeric(14,2);
  v_cr         numeric(14,2);
  v_sum_dr     numeric(16,2) := 0;
  v_sum_cr     numeric(16,2) := 0;
  v_count      int := 0;
begin
  v_date     := (p_header->>'entry_date')::date;
  if v_date is null then
    raise exception 'post_journal: entry_date is required';
  end if;
  v_doc_type := coalesce(p_header->>'doc_type', 'voucher');
  v_fy       := fy_for_date(v_date);              -- also enforces OPEN fy
  v_actor    := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'post_journal: at least two lines required';
  end if;

  v_entry_no := next_number(v_doc_type, v_date);

  -- 1) header as DRAFT so the immutability guard permits line inserts
  insert into journal_entries
      (entry_no, fy_id, entry_date, source, source_id, narration, status, posted_by)
  values
      (v_entry_no, v_fy, v_date,
       coalesce(p_header->>'source','manual'),
       nullif(p_header->>'source_id','')::uuid,
       p_header->>'narration',
       'draft', v_actor)
  returning id into v_entry_id;

  -- 2) lines
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    -- resolve account by id or code
    if (v_line ? 'account_id') and nullif(v_line->>'account_id','') is not null then
      v_acct := (v_line->>'account_id')::uuid;
    else
      select id into v_acct from chart_of_accounts
        where code = v_line->>'account_code';
      if v_acct is null then
        raise exception 'post_journal: unknown account_code %', v_line->>'account_code';
      end if;
    end if;

    v_cc := null;
    if nullif(v_line->>'cost_center_code','') is not null then
      select id into v_cc from cost_centers where code = v_line->>'cost_center_code';
    elsif nullif(v_line->>'cost_center_id','') is not null then
      v_cc := (v_line->>'cost_center_id')::uuid;
    end if;

    v_dr := coalesce((v_line->>'debit')::numeric, 0);
    v_cr := coalesce((v_line->>'credit')::numeric, 0);

    insert into journal_lines
        (entry_id, account_id, debit, credit, cost_center_id,
         party_type, party_id, stock_item_id, stock_qty, branch_id, memo)
    values
        (v_entry_id, v_acct, v_dr, v_cr, v_cc,
         nullif(v_line->>'party_type',''),
         nullif(v_line->>'party_id','')::uuid,
         nullif(v_line->>'stock_item_id','')::uuid,
         coalesce((v_line->>'stock_qty')::numeric, 0),
         nullif(v_line->>'branch_id','')::uuid,
         v_line->>'memo');

    v_sum_dr := v_sum_dr + v_dr;
    v_sum_cr := v_sum_cr + v_cr;
    v_count  := v_count + 1;
  end loop;

  -- 3) balance check — the heart of double entry
  if v_sum_dr <> v_sum_cr then
    raise exception 'post_journal: unbalanced entry (debit % <> credit %)', v_sum_dr, v_sum_cr;
  end if;
  if v_sum_dr = 0 then
    raise exception 'post_journal: zero-value entry refused';
  end if;

  -- 4) flip to POSTED (freezes the entry & its lines via guards)
  update journal_entries set status = 'posted', posted_at = now()
    where id = v_entry_id;

  -- 5) refresh read-model (Invariant 5) for the accounts touched
  insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
  select l.account_id, v_fy, sum(l.debit), sum(l.credit), now()
    from journal_lines l
   where l.entry_id = v_entry_id
   group by l.account_id
  on conflict (account_id, fy_id) do update
     set debit_total  = account_balances.debit_total  + excluded.debit_total,
         credit_total = account_balances.credit_total + excluded.credit_total,
         updated_at   = now();

  -- 6) audit (Invariant 7)
  perform write_audit('post', 'journal_entries', v_entry_id::text,
            format('%s %s: %s lines, %s', p_header->>'source', v_entry_no, v_count, v_sum_dr),
            jsonb_build_object('entry_no', v_entry_no, 'amount', v_sum_dr), v_actor);

  return v_entry_id;
end $$;
comment on function post_journal is
  'Single gateway for value into the ledger. Balanced, one transaction, refreshes read-model, audits. Invariants 1,3,4,5,6,7,8.';

-- ---------------------------------------------------------------------
-- reverse_journal(entry_id, reason) -> new reversing entry id
-- Invariant 6: never mutate a posted entry; negate it with a mirror.
-- ---------------------------------------------------------------------
create or replace function reverse_journal(p_entry_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src     journal_entries%rowtype;
  v_lines   jsonb;
  v_new     uuid;
begin
  select * into v_src from journal_entries where id = p_entry_id;
  if not found then raise exception 'reverse_journal: entry % not found', p_entry_id; end if;
  if v_src.status <> 'posted' then
    raise exception 'reverse_journal: only posted entries can be reversed (is %)', v_src.status;
  end if;

  -- build mirrored lines (swap debit<->credit, negate stock qty)
  select jsonb_agg(jsonb_build_object(
           'account_id',  l.account_id,
           'debit',       l.credit,
           'credit',      l.debit,
           'party_type',  l.party_type,
           'party_id',    l.party_id,
           'cost_center_id', l.cost_center_id,
           'stock_item_id',  l.stock_item_id,
           'stock_qty',   (-1 * l.stock_qty),
           'branch_id',   l.branch_id,
           'memo',        'reversal'))
    into v_lines
    from journal_lines l where l.entry_id = p_entry_id;

  v_new := post_journal(
    jsonb_build_object('entry_date', current_date, 'source', v_src.source,
                       'source_id', v_src.source_id::text,
                       'narration', coalesce(p_reason, 'Reversal of ' || v_src.entry_no)),
    v_lines);

  update journal_entries set reverses_id = p_entry_id where id = v_new;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- rebuild_account_balances(fy_id?)  — regenerate the read-model from truth.
-- Proves Invariant 5: account_balances is disposable.
-- ---------------------------------------------------------------------
create or replace function rebuild_account_balances(p_fy uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_fy is null then
    delete from account_balances;
    insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
    select l.account_id, e.fy_id, sum(l.debit), sum(l.credit), now()
      from journal_lines l join journal_entries e on e.id = l.entry_id
     where e.status = 'posted'
     group by l.account_id, e.fy_id;
  else
    delete from account_balances where fy_id = p_fy;
    insert into account_balances (account_id, fy_id, debit_total, credit_total, updated_at)
    select l.account_id, e.fy_id, sum(l.debit), sum(l.credit), now()
      from journal_lines l join journal_entries e on e.id = l.entry_id
     where e.status = 'posted' and e.fy_id = p_fy
     group by l.account_id, e.fy_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- assert_trial_balance(fy_id?) -> numeric  (Σdebit - Σcredit, must be 0)
-- A health check computed straight from journal_lines (truth, not cache).
-- ---------------------------------------------------------------------
create or replace function assert_trial_balance(p_fy uuid default null)
returns numeric
language plpgsql stable as $$
declare v_diff numeric(16,2);
begin
  select coalesce(sum(l.debit) - sum(l.credit), 0)
    into v_diff
    from journal_lines l join journal_entries e on e.id = l.entry_id
   where e.status = 'posted'
     and (p_fy is null or e.fy_id = p_fy);
  if v_diff <> 0 then
    raise exception 'Trial balance broken: debit-credit difference = %', v_diff;
  end if;
  return v_diff;
end $$;
comment on function assert_trial_balance is 'Returns 0 when the ledger balances; raises otherwise. Computed from journal_lines.';

-- =====================================================================
-- 0038_holdings_transfers.sql — master plan §4.7
-- User Holdings & Handover/Transfers (adds atomicity §1.4).
--
-- Cash or stock physically in a user's custody, moved up/down the chain
-- with accept/reject. Accept is ALL-OR-NOTHING in one transaction.
--
--   user_cash_holdings   READ-MODEL of the user cash ledger (2140 by party;
--                        rebuildable via rebuild_user_cash_holdings()).
--   user_stock_holdings  AUTHORITATIVE physical qty in user custody
--                        (Invariant 2: qty lives only in stock + here).
--   transfers +          accept/reject state machine; stock lines are a
--   transfer_lines       child table, NOT JSON (audit 2.4).
--
-- Accounting (§4.7):
--   Cash handover A→B (accept):  Dr 2140(party B)  Cr 2140(party A)
--   Bank deposit by user:        Dr 1120 Bank      Cr 2140(party user)
--   Stock WH↔user / user↔user:   qty moves; VALUE STAYS IN INVENTORY
--                                (no journal, no P&L). The reconcile view
--                                below now counts custody stock so
--                                carrying value still ties to the ledger.
--
-- Permissions: stock.transfer / cash.transfer (added here, per §2.3).
-- All mutations via SECURITY DEFINER RPCs only (Invariant 3).
-- =====================================================================

-- ------------------------------------------------------------- tables

create table if not exists user_cash_holdings (
  user_id     uuid primary key references users(id),
  amount      numeric(14,2) not null default 0,
  updated_at  timestamptz not null default now()
);
comment on table user_cash_holdings is
  'READ-MODEL: cash in each user''s custody = Σ(debit-credit) on 2140 for party_type=user. Rebuildable.';

create table if not exists user_stock_holdings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id),
  item_id     uuid not null references items(id),
  batch_no    text,
  qty         numeric(14,3) not null default 0 check (qty >= 0),
  avg_cost    numeric(14,4) not null default 0,      -- WA cost carried from the warehouse
  updated_at  timestamptz not null default now(),
  unique (user_id, item_id)
);
comment on table user_stock_holdings is
  'AUTHORITATIVE physical qty in user custody (Invariant 2). Value stays in inventory ledger; avg_cost lets the reconcile view tie out.';

create table if not exists transfers (
  id            uuid primary key default gen_random_uuid(),
  transfer_no   text not null,
  fy_id         uuid not null references financial_years(id),
  type          text not null check (type in ('stock','cash')),
  -- exactly one origin and one destination:
  from_user_id  uuid references users(id),
  from_branch_id uuid references branches(id),
  to_user_id    uuid references users(id),
  to_branch_id  uuid references branches(id),
  -- cash-only fields:
  amount        numeric(14,2) check (amount is null or amount > 0),
  deposit_account text,                              -- set only for bank deposits ('1120')
  status        text not null default 'pending'
                check (status in ('pending','accepted','rejected','cancelled')),
  reference_order_id uuid references sales_orders(id),
  note          text,
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  responded_by  uuid references users(id),
  responded_at  timestamptz,
  journal_entry_id uuid references journal_entries(id),
  unique (fy_id, transfer_no),
  check (num_nonnulls(from_user_id, from_branch_id) = 1),
  check (num_nonnulls(to_user_id, to_branch_id, deposit_account) = 1),
  check (type <> 'cash' or (from_user_id is not null and from_branch_id is null and to_branch_id is null)),
  check (type <> 'stock' or (amount is null and deposit_account is null))
);
comment on table transfers is
  '§4.7 handovers. pending → accepted|rejected|cancelled. Accept moves balances atomically via respond_transfer(); bank deposits post immediately.';

create table if not exists transfer_lines (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references transfers(id) on delete cascade,
  item_id      uuid not null references items(id),
  qty          numeric(14,3) not null check (qty > 0),
  batch_no     text
);
comment on table transfer_lines is 'Stock transfer lines — a real child table, not JSON (audit 2.4).';

create index if not exists transfers_pending_to_idx on transfers (to_user_id) where status = 'pending';
create index if not exists transfers_from_idx on transfers (from_user_id);
create index if not exists transfer_lines_transfer_idx on transfer_lines (transfer_id);

create trigger user_cash_holdings_touch before update on user_cash_holdings
  for each row execute function touch_updated_at();
create trigger user_stock_holdings_touch before update on user_stock_holdings
  for each row execute function touch_updated_at();

-- ------------------------------------------------------- permissions

insert into permissions (code, description) values
  ('stock.transfer', 'Create/accept stock handovers between warehouse and users'),
  ('cash.transfer',  'Create/accept cash handovers and bank deposits')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission, scope)
select r.id, v.code, 'all'
  from roles r
  join (values ('manager','stock.transfer'), ('manager','cash.transfer'),
               ('accountant','cash.transfer'),
               ('sales','stock.transfer'),   ('sales','cash.transfer'),
               ('operator','stock.transfer')) as v(role_code, code)
    on v.role_code = r.code
on conflict do nothing;

-- ------------------------------------------------ number series seed

insert into number_series (doc_type, fy_id, prefix, pad_width, next_val)
select 'transfer', fy.id, 'TRF', 4, 1 from financial_years fy
on conflict (doc_type, fy_id) do nothing;

-- --------------------------------------------------- private helpers

-- Adjust the user cash read-model by a signed delta (row-locked upsert).
create or replace function _bump_user_cash(p_user uuid, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_cash_holdings (user_id, amount) values (p_user, 0)
    on conflict (user_id) do nothing;
  update user_cash_holdings
     set amount = amount + p_delta
   where user_id = p_user;
end $$;

-- Add qty into a user's stock holding at a given cost, WA-merging cost.
create or replace function _user_stock_in(p_user uuid, p_item uuid, p_qty numeric, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty  numeric(14,3);
  v_avg  numeric(14,4);
begin
  insert into user_stock_holdings (user_id, item_id, qty, avg_cost)
    values (p_user, p_item, 0, 0)
    on conflict (user_id, item_id) do nothing;
  select qty, avg_cost into v_qty, v_avg
    from user_stock_holdings
   where user_id = p_user and item_id = p_item
   for update;
  update user_stock_holdings
     set qty      = v_qty + p_qty,
         avg_cost = case when (v_qty + p_qty) = 0 then 0
                    else round(((v_qty * v_avg) + (p_qty * p_cost)) / (v_qty + p_qty), 4) end
   where user_id = p_user and item_id = p_item;
end $$;

-- Remove qty from a user's stock holding (locks; blocks going negative).
-- Returns the holding's avg cost so the receiver carries the same value.
create or replace function _user_stock_out(p_user uuid, p_item uuid, p_qty numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric(14,3);
  v_avg numeric(14,4);
begin
  select qty, avg_cost into v_qty, v_avg
    from user_stock_holdings
   where user_id = p_user and item_id = p_item
   for update;
  if v_qty is null or v_qty < p_qty then
    raise exception 'transfer: user % holds % of item %, needs %',
      p_user, coalesce(v_qty, 0), p_item, p_qty;
  end if;
  update user_stock_holdings
     set qty = v_qty - p_qty,
         avg_cost = case when (v_qty - p_qty) = 0 then 0 else avg_cost end
   where user_id = p_user and item_id = p_item;
  return v_avg;
end $$;

-- ------------------------------------------------------ create_transfer
-- Header: { type: 'stock'|'cash',
--           from_user_id? | from_branch_id?,
--           to_user_id?   | to_branch_id?   | deposit_account? ('1120'),
--           amount? (cash), reference_order_id?, note? }
-- Lines (stock only): [ { item_id, qty }, ... ]
--
-- Bank deposits (cash, deposit_account set) POST IMMEDIATELY — there is no
-- counterpart custodian to accept: Dr bank / Cr 2140(user), status accepted.
-- Everything else goes pending until respond_transfer().
-- ------------------------------------------------------------------------
create or replace function create_transfer(p_header jsonb, p_lines jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_type    text := p_header->>'type';
  v_from_u  uuid := nullif(p_header->>'from_user_id','')::uuid;
  v_from_b  uuid := nullif(p_header->>'from_branch_id','')::uuid;
  v_to_u    uuid := nullif(p_header->>'to_user_id','')::uuid;
  v_to_b    uuid := nullif(p_header->>'to_branch_id','')::uuid;
  v_amount  numeric := nullif(p_header->>'amount','')::numeric;
  v_deposit text := nullif(p_header->>'deposit_account','');
  v_id      uuid;
  v_no      text;
  v_fy      uuid;
  v_line    jsonb;
  v_entry   uuid;
  v_n       int := 0;
begin
  if v_actor is null then raise exception 'create_transfer: no authenticated user'; end if;

  if v_type = 'cash' then
    if not has_permission('cash.transfer') then
      raise exception 'create_transfer: not authorized (needs cash.transfer)';
    end if;
    if v_from_u is null then raise exception 'create_transfer: cash needs from_user_id'; end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'create_transfer: cash amount must be > 0';
    end if;
    if v_deposit is not null and v_deposit <> '1120' then
      raise exception 'create_transfer: deposit_account must be 1120';
    end if;
    if v_deposit is null and v_to_u is null then
      raise exception 'create_transfer: cash needs to_user_id or deposit_account';
    end if;
    if v_to_u = v_from_u then raise exception 'create_transfer: sender and receiver are the same user'; end if;
  elsif v_type = 'stock' then
    if not has_permission('stock.transfer') then
      raise exception 'create_transfer: not authorized (needs stock.transfer)';
    end if;
    if num_nonnulls(v_from_u, v_from_b) <> 1 or num_nonnulls(v_to_u, v_to_b) <> 1 then
      raise exception 'create_transfer: stock needs exactly one origin and one destination';
    end if;
    if v_from_b is not null and v_to_b is not null then
      raise exception 'create_transfer: branch-to-branch moves use stock adjustments, not handovers';
    end if;
    if v_from_u is not null and v_from_u = v_to_u then
      raise exception 'create_transfer: sender and receiver are the same user';
    end if;
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception 'create_transfer: stock transfer needs at least one line';
    end if;
  else
    raise exception 'create_transfer: type must be stock or cash';
  end if;

  -- a user-origin transfer must be created by that user (or an admin/manager
  -- with roles.manage) — never silently move another user's custody.
  if v_from_u is not null and v_from_u <> v_actor and not has_permission('roles.manage') then
    raise exception 'create_transfer: only % can hand over their own custody', v_from_u;
  end if;

  v_fy := fy_for_date(current_date);
  v_no := next_number('transfer', current_date);

  insert into transfers (transfer_no, fy_id, type, from_user_id, from_branch_id,
                         to_user_id, to_branch_id, amount, deposit_account,
                         reference_order_id, note, created_by)
  values (v_no, v_fy, v_type, v_from_u, v_from_b, v_to_u, v_to_b, v_amount, v_deposit,
          nullif(p_header->>'reference_order_id','')::uuid,
          nullif(p_header->>'note',''), v_actor)
  returning id into v_id;

  if v_type = 'stock' then
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      if nullif(v_line->>'item_id','') is null or coalesce((v_line->>'qty')::numeric, 0) <= 0 then
        raise exception 'create_transfer: every line needs item_id and qty > 0';
      end if;
      insert into transfer_lines (transfer_id, item_id, qty, batch_no)
      values (v_id, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric,
              nullif(v_line->>'batch_no',''));
      v_n := v_n + 1;
    end loop;
  end if;

  -- bank deposit: no counterpart custodian — post now, atomically.
  if v_type = 'cash' and v_deposit is not null then
    -- lock + verify the sender actually holds the cash
    perform _bump_user_cash(v_from_u, 0);
    perform 1 from user_cash_holdings where user_id = v_from_u and amount >= v_amount for update;
    if not found then
      raise exception 'create_transfer: user holds less cash than the deposit amount';
    end if;
    v_entry := post_journal(
      jsonb_build_object('entry_date', current_date, 'source', 'transfer',
                         'source_id', v_id::text, 'doc_type', 'handover',
                         'narration', 'Bank deposit '||v_no),
      jsonb_build_array(
        jsonb_build_object('account_code', v_deposit, 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_code', '2140', 'debit', 0, 'credit', v_amount,
                           'party_type', 'user', 'party_id', v_from_u::text)));
    perform _bump_user_cash(v_from_u, -v_amount);
    update transfers
       set status = 'accepted', responded_by = v_actor, responded_at = now(),
           journal_entry_id = v_entry
     where id = v_id;
  end if;

  perform write_audit('insert', 'transfers', v_id::text,
    v_type||' transfer '||v_no||case when v_deposit is not null then ' (bank deposit, posted)' else ' created (pending)' end,
    jsonb_build_object('header', p_header, 'lines', v_n));
  return v_id;
end $$;
comment on function create_transfer is
  '§4.7: create a pending cash/stock handover (bank deposits post immediately). Balances move only on accept.';

-- ------------------------------------------------------ respond_transfer
-- Accept moves cash/stock ATOMICALLY (+ journal for cash) — Invariant 4.
-- Reject is a no-op on balances. Only the destination custodian may respond
-- (warehouse-destined transfers: anyone holding stock.transfer).
-- ------------------------------------------------------------------------
create or replace function respond_transfer(p_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_t     transfers%rowtype;
  v_l     record;
  v_cost  numeric;
  v_ledger uuid;
  v_entry uuid;
begin
  if v_actor is null then raise exception 'respond_transfer: no authenticated user'; end if;

  select * into v_t from transfers where id = p_id for update;
  if v_t.id is null then raise exception 'respond_transfer: unknown transfer %', p_id; end if;
  if v_t.status <> 'pending' then
    raise exception 'respond_transfer: transfer % is already %', v_t.transfer_no, v_t.status;
  end if;

  if v_t.to_user_id is not null then
    if v_actor <> v_t.to_user_id then
      raise exception 'respond_transfer: only the receiving user can respond';
    end if;
  else
    if not has_permission('stock.transfer') then
      raise exception 'respond_transfer: not authorized (needs stock.transfer)';
    end if;
  end if;

  if not p_accept then
    update transfers set status = 'rejected', responded_by = v_actor, responded_at = now()
     where id = p_id;
    perform write_audit('reject', 'transfers', p_id::text,
      'Transfer '||v_t.transfer_no||' rejected');
    return p_id;
  end if;

  if v_t.type = 'cash' then
    -- lock + verify sender still holds the cash, then move it with a journal.
    perform _bump_user_cash(v_t.from_user_id, 0);
    perform 1 from user_cash_holdings
      where user_id = v_t.from_user_id and amount >= v_t.amount for update;
    if not found then
      raise exception 'respond_transfer: sender holds less cash than %', v_t.amount;
    end if;
    v_entry := post_journal(
      jsonb_build_object('entry_date', current_date, 'source', 'transfer',
                         'source_id', p_id::text, 'doc_type', 'handover',
                         'narration', 'Cash handover '||v_t.transfer_no),
      jsonb_build_array(
        jsonb_build_object('account_code', '2140', 'debit', v_t.amount, 'credit', 0,
                           'party_type', 'user', 'party_id', v_t.to_user_id::text),
        jsonb_build_object('account_code', '2140', 'debit', 0, 'credit', v_t.amount,
                           'party_type', 'user', 'party_id', v_t.from_user_id::text)));
    perform _bump_user_cash(v_t.from_user_id, -v_t.amount);
    perform _bump_user_cash(v_t.to_user_id,    v_t.amount);
    update transfers set journal_entry_id = v_entry where id = p_id;

  else -- stock: qty moves, value stays in inventory (no journal, no P&L)
    for v_l in select * from transfer_lines where transfer_id = p_id
    loop
      if v_t.from_branch_id is not null then
        -- WH → user: issue at branch WAC (post_stock_move enforces stock),
        -- carry that cost into the user's holding.
        v_ledger := post_stock_move(v_l.item_id, v_t.from_branch_id, 'transfer_out',
                                    -v_l.qty, 0, null, 'transfer', p_id, current_date);
        select unit_cost into v_cost from stock_ledger where id = v_ledger;
        perform _user_stock_in(v_t.to_user_id, v_l.item_id, v_l.qty, coalesce(v_cost, 0));
      elsif v_t.to_branch_id is not null then
        -- user → WH: pull from custody at the holding's WA cost, receive
        -- into the warehouse at that same cost (WAC re-merges there).
        v_cost := _user_stock_out(v_t.from_user_id, v_l.item_id, v_l.qty);
        perform post_stock_move(v_l.item_id, v_t.to_branch_id, 'transfer_in',
                                v_l.qty, v_cost, null, 'transfer', p_id, current_date);
      else
        -- user → user: custody-to-custody at the sender's WA cost.
        v_cost := _user_stock_out(v_t.from_user_id, v_l.item_id, v_l.qty);
        perform _user_stock_in(v_t.to_user_id, v_l.item_id, v_l.qty, v_cost);
      end if;
    end loop;
  end if;

  update transfers set status = 'accepted', responded_by = v_actor, responded_at = now()
   where id = p_id;
  perform write_audit('approve', 'transfers', p_id::text,
    'Transfer '||v_t.transfer_no||' accepted');
  return p_id;
end $$;
comment on function respond_transfer is
  '§4.7: accept (atomic balance move + journal for cash) or reject (no-op). One transaction — Invariant 4.';

-- ------------------------------------------------------ cancel_transfer
create or replace function cancel_transfer(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
  v_t transfers%rowtype;
begin
  select * into v_t from transfers where id = p_id for update;
  if v_t.id is null then raise exception 'cancel_transfer: unknown transfer %', p_id; end if;
  if v_t.status <> 'pending' then
    raise exception 'cancel_transfer: transfer % is already %', v_t.transfer_no, v_t.status;
  end if;
  if v_actor is distinct from v_t.created_by
     and v_actor is distinct from v_t.from_user_id
     and not has_permission('roles.manage') then
    raise exception 'cancel_transfer: only the sender can cancel';
  end if;
  update transfers set status = 'cancelled', responded_by = v_actor, responded_at = now()
   where id = p_id;
  perform write_audit('void', 'transfers', p_id::text,
    'Transfer '||v_t.transfer_no||' cancelled');
  return p_id;
end $$;

-- --------------------------------------------- read-model rebuild (§1.5)
create or replace function rebuild_user_cash_holdings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not has_permission('accounting.manage') then
    raise exception 'rebuild_user_cash_holdings: not authorized';
  end if;
  delete from user_cash_holdings;
  insert into user_cash_holdings (user_id, amount)
  select l.party_id, round(sum(l.debit - l.credit), 2)
    from journal_lines l
    join chart_of_accounts a on a.id = l.account_id
   where a.code = '2140' and l.party_type = 'user' and l.party_id is not null
   group by l.party_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function rebuild_user_cash_holdings is
  'Rebuild the user cash read-model from journal_lines (2140 by user party). Invariant 5.';

-- ------------------------------------- reconcile view now counts custody
-- Stock in user custody left the warehouse without a journal (value stays
-- in inventory), so the carrying side must include it or Invariant 5's
-- check would show a false difference.
create or replace view stock_value_reconcile as
with carry as (
  select inv_account, round(sum(v), 2) as stock_carrying_value
    from (
      select inventory_account_for(i.type) as inv_account, s.qty_on_hand * s.avg_cost as v
        from stock s join items i on i.id = s.item_id
      union all
      select inventory_account_for(i.type), h.qty * h.avg_cost
        from user_stock_holdings h join items i on i.id = h.item_id
    ) u
   group by inv_account
),
ledger as (
  select a.code as inv_account, round(sum(l.debit - l.credit), 2) as ledger_value
    from journal_lines l join chart_of_accounts a on a.id = l.account_id
   where a.code in ('1210','1220','1230','1240')
   group by a.code
)
select coalesce(c.inv_account, g.inv_account)          as inv_account,
       coalesce(c.stock_carrying_value, 0)             as stock_carrying_value,
       coalesce(g.ledger_value, 0)                     as ledger_value,
       coalesce(c.stock_carrying_value,0) - coalesce(g.ledger_value,0) as difference
  from carry c full outer join ledger g on g.inv_account = c.inv_account;
alter view stock_value_reconcile set (security_invoker = on);
comment on view stock_value_reconcile is
  'difference ~0: (warehouse + user-custody) WAC carrying value vs inventory control accounts.';

-- ------------------------------------------------------------ RLS
alter table user_cash_holdings  enable row level security;
alter table user_stock_holdings enable row level security;
alter table transfers           enable row level security;
alter table transfer_lines      enable row level security;

create policy read_all_auth on user_cash_holdings  for select to authenticated using (true);
create policy read_all_auth on user_stock_holdings for select to authenticated using (true);
create policy read_all_auth on transfers           for select to authenticated using (true);
create policy read_all_auth on transfer_lines      for select to authenticated using (true);
-- no insert/update/delete policies: definer RPCs are the only write path.

-- ------------------------------------------------------------ grants
revoke all on function create_transfer(jsonb, jsonb)      from anon, public;
revoke all on function respond_transfer(uuid, boolean)    from anon, public;
revoke all on function cancel_transfer(uuid)              from anon, public;
revoke all on function rebuild_user_cash_holdings()       from anon, public;
revoke all on function _bump_user_cash(uuid, numeric)     from anon, public, authenticated;
revoke all on function _user_stock_in(uuid, uuid, numeric, numeric) from anon, public, authenticated;
revoke all on function _user_stock_out(uuid, uuid, numeric)         from anon, public, authenticated;
grant execute on function create_transfer(jsonb, jsonb)   to authenticated;
grant execute on function respond_transfer(uuid, boolean) to authenticated;
grant execute on function cancel_transfer(uuid)           to authenticated;
grant execute on function rebuild_user_cash_holdings()    to authenticated;

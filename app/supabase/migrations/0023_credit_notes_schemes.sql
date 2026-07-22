-- =====================================================================
-- 0023_credit_notes_schemes.sql  ·  Phase 4 — Credit notes + schemes/rebates  (§7.5)
--
-- Volume-based monthly rebates issued as customer CREDIT NOTES that reduce
-- outstanding (never a cash payout), plus complaint-driven credit notes (§7.3).
--
-- Fixes the original's silent GST omission: GST treatment is an EXPLICIT
-- per-scheme flag (gst_adjusted). Two accounting shapes:
--   • pure commercial (financial) credit — expense-only, no GST touched:
--       Dr 5530 Scheme Rebates (expense)     amount
--          Cr 1130 AR (customer)             amount           party = customer
--   • GST-adjusted credit (issued against official sales) — also reverses
--     proportional output tax, mirroring the §4.5 return template:
--       Dr 5530 Scheme Rebates (taxable part)  base
--       Dr 2120 Output GST Payable             tax            (reversal)
--          Cr 1130 AR (customer)               base + tax
-- Either way AR (1130) drops, so the customer's outstanding falls (Invariant 1:
-- the credit lives in journal_lines; credit_notes/scheme tables are AUTH docs
-- that carry the posted journal_entry_id).
-- =====================================================================

-- new expense account for rebates (parent 5000 EXPENSES)
insert into chart_of_accounts (code, name, type, normal_side, is_postable, control_of, is_system)
values ('5180','Scheme Rebates','expense','debit', true, null, true)
on conflict (code) do nothing;
update chart_of_accounts c set parent_id = p.id
  from chart_of_accounts p where c.code = '5180' and p.code = '5000' and c.parent_id is null;

create type credit_note_reason as enum ('scheme_rebate','complaint','sales_adjustment','other');
create type credit_note_status as enum ('draft','approved','posted','cancelled');
create type scheme_eligibility_status as enum ('pending_approval','approved','rejected','posted');
create type scheme_status as enum ('active','closed');

-- ---------------------------------------------------------------------
-- credit_notes — the posted credit document. journal_entry_id is the truth
-- link; amount is the gross credit to the customer ledger.
-- ---------------------------------------------------------------------
create table credit_notes (
  id                uuid primary key default gen_random_uuid(),
  credit_note_no    text not null,
  fy_id             uuid not null references financial_years(id),
  customer_store_id uuid not null references customer_stores(id),
  customer_id       uuid not null references customers(id),
  amount            numeric(14,2) not null check (amount > 0),   -- gross (base+tax if gst_adjusted)
  base_amount       numeric(14,2) not null default 0,            -- taxable portion
  tax_amount        numeric(14,2) not null default 0,            -- output-GST reversed
  reason            credit_note_reason not null default 'other',
  reference_sale_id uuid references invoices(id),
  scheme_eligibility_id uuid,                                    -- set for scheme credits (FK below)
  complaint_id      uuid references complaints(id),
  narration         text,
  status            credit_note_status not null default 'posted',
  journal_entry_id  uuid references journal_entries(id),
  approved_by       uuid references users(id),
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index credit_notes_store_idx on credit_notes (customer_store_id, created_at);
create index credit_notes_cust_idx  on credit_notes (customer_id);
comment on table credit_notes is 'Customer credit documents (scheme rebates + complaints); AR reduced via journal_entry_id. §7.5.';

-- ---------------------------------------------------------------------
-- schemes — a volume rebate window with tiered rates.
--   tiers_json: [{ "min_cases": 100, "rebate_per_case": 5 }, ...] highest met wins
-- ---------------------------------------------------------------------
create table schemes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  period_start date not null,
  period_end   date not null,
  target_type  text not null default 'total_cases',
  tiers_json   jsonb not null default '[]'::jsonb,
  eligibility  text not null default 'global',       -- global | group | customer
  gst_adjusted boolean not null default false,        -- explicit GST treatment (§7.5)
  gst_rate     numeric(5,2) not null default 0,       -- used only if gst_adjusted
  status       scheme_status not null default 'active',
  notes        text,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  check (period_end >= period_start)
);
comment on column schemes.gst_adjusted is 'If true, post_scheme_credit_note reverses proportional output GST at gst_rate; else expense-only.';

-- ---------------------------------------------------------------------
-- scheme_eligibility — per-store achievement for a scheme, approved → posted.
-- ---------------------------------------------------------------------
create table scheme_eligibility (
  id                uuid primary key default gen_random_uuid(),
  scheme_id         uuid not null references schemes(id) on delete cascade,
  customer_store_id uuid not null references customer_stores(id),
  total_volume      numeric(14,3) not null default 0,   -- cases in the window
  tier_achieved     int,
  rebate_amount     numeric(14,2) not null default 0,   -- gross rebate earned
  status            scheme_eligibility_status not null default 'pending_approval',
  approved_by       uuid references users(id),
  approved_at       timestamptz,
  credit_note_id    uuid references credit_notes(id),
  created_at        timestamptz not null default now(),
  unique (scheme_id, customer_store_id)
);
create index scheme_elig_scheme_idx on scheme_eligibility (scheme_id, status);

-- deferred FKs now that both tables exist
alter table credit_notes
  add constraint credit_notes_scheme_elig_fk
  foreign key (scheme_eligibility_id) references scheme_eligibility(id);
-- soft-link complaints.credit_note_id → credit_notes (complaints created in 0022)
alter table complaints
  add constraint complaints_credit_note_fk
  foreign key (credit_note_id) references credit_notes(id);

create trigger credit_notes_touch before update on credit_notes for each row execute function touch_updated_at();
create trigger schemes_touch       before update on schemes      for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- _post_credit_note(store, amount, reason, opts) -> credit_note id  [internal]
-- Shared posting core for scheme + complaint credits. Posts the AR-reducing
-- journal and writes the credit_notes row in one transaction.
--   opts: { base_amount?, tax_amount?, gst_adjusted?, reference_sale_id?,
--           scheme_eligibility_id?, complaint_id?, narration?, date? }
-- If gst_adjusted, base+tax must sum to amount and tax is reversed against 2120.
-- ---------------------------------------------------------------------
create or replace function _post_credit_note(
  p_store uuid, p_amount numeric, p_reason credit_note_reason, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cust    uuid;
  v_date    date := coalesce((p_opts->>'date')::date, current_date);
  v_fy      uuid := fy_for_date(v_date);
  v_gstadj  boolean := coalesce((p_opts->>'gst_adjusted')::boolean, false);
  v_base    numeric(14,2);
  v_tax     numeric(14,2) := coalesce((p_opts->>'tax_amount')::numeric, 0);
  v_no      text;
  v_je      uuid;
  v_cn      uuid;
  v_lines   jsonb;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception '_post_credit_note: amount must be > 0'; end if;
  select customer_id into v_cust from customer_stores where id = p_store;
  if v_cust is null then raise exception '_post_credit_note: unknown store %', p_store; end if;

  if v_gstadj then
    v_base := coalesce((p_opts->>'base_amount')::numeric, p_amount - v_tax);
    if round(v_base + v_tax, 2) <> round(p_amount, 2) then
      raise exception '_post_credit_note: base %+tax % <> amount %', v_base, v_tax, p_amount;
    end if;
    -- Dr Scheme Rebates (base) + Dr Output GST (tax reversal) / Cr AR (gross)
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5180','debit', v_base, 'credit', 0),
      jsonb_build_object('account_code','2120','debit', v_tax,  'credit', 0),
      jsonb_build_object('account_code','1130','debit', 0, 'credit', p_amount,
                         'party_type','customer','party_id', v_cust::text));
  else
    v_base := p_amount; v_tax := 0;
    -- expense-only: Dr Scheme Rebates / Cr AR
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5180','debit', p_amount, 'credit', 0),
      jsonb_build_object('account_code','1130','debit', 0, 'credit', p_amount,
                         'party_type','customer','party_id', v_cust::text));
  end if;

  v_je := post_journal(
    jsonb_build_object('entry_date', v_date, 'doc_type','credit_note',
                       'source','credit_note',
                       'narration', coalesce(p_opts->>'narration',
                         format('Credit note (%s) to store %s', p_reason, p_store))),
    v_lines);

  v_no := next_number('credit_note', v_date);
  insert into credit_notes (credit_note_no, fy_id, customer_store_id, customer_id,
                            amount, base_amount, tax_amount, reason, reference_sale_id,
                            scheme_eligibility_id, complaint_id, narration, status,
                            journal_entry_id, approved_by, created_by)
  values (v_no, v_fy, p_store, v_cust, p_amount, v_base, v_tax, p_reason,
          nullif(p_opts->>'reference_sale_id','')::uuid,
          nullif(p_opts->>'scheme_eligibility_id','')::uuid,
          nullif(p_opts->>'complaint_id','')::uuid,
          p_opts->>'narration', 'posted', v_je, v_actor, v_actor)
  returning id into v_cn;

  update journal_entries set source_id = v_cn where id = v_je;

  perform write_audit('post','credit_notes', v_cn::text,
            format('Credit note %s: %s to store %s', v_no, p_amount, p_store),
            jsonb_build_object('credit_note_no', v_no, 'amount', p_amount,
                               'gst_adjusted', v_gstadj), v_actor);
  return v_cn;
end $$;

-- ---------------------------------------------------------------------
-- calc_scheme_eligibility(scheme) -> int rows written
-- Month-end auto-calc: per store, sum case volume in the window, pick the
-- highest tier met, compute rebate = tier.rebate_per_case × volume. Populates
-- scheme_eligibility as pending_approval (manager approves, then posts).
-- "cases" = sum of invoice_line qty over items in the window (base units).
-- ---------------------------------------------------------------------
create or replace function calc_scheme_eligibility(p_scheme uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s       schemes;
  v_tier    jsonb;
  v_rec     record;
  v_best_r  numeric; v_best_t int; v_rebate numeric(14,2);
  v_n       int := 0; v_i int;
  v_actor   uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_s from schemes where id = p_scheme;
  if not found then raise exception 'calc_scheme_eligibility: unknown scheme %', p_scheme; end if;

  for v_rec in
    select i.store_id, sum(il.qty) as vol
      from invoices i
      join invoice_lines il on il.invoice_id = i.id
     where i.status = 'posted'
       and i.invoice_date between v_s.period_start and v_s.period_end
     group by i.store_id
  loop
    v_best_r := 0; v_best_t := null; v_i := 0;
    for v_tier in select * from jsonb_array_elements(v_s.tiers_json) loop
      v_i := v_i + 1;
      if v_rec.vol >= (v_tier->>'min_cases')::numeric
         and (v_tier->>'rebate_per_case')::numeric >= v_best_r then
        v_best_r := (v_tier->>'rebate_per_case')::numeric;
        v_best_t := v_i;
      end if;
    end loop;

    if v_best_t is not null and v_best_r > 0 then
      v_rebate := round(v_rec.vol * v_best_r, 2);
      insert into scheme_eligibility (scheme_id, customer_store_id, total_volume,
                                      tier_achieved, rebate_amount, status)
      values (p_scheme, v_rec.store_id, v_rec.vol, v_best_t, v_rebate, 'pending_approval')
      on conflict (scheme_id, customer_store_id) do update
        set total_volume = excluded.total_volume,
            tier_achieved = excluded.tier_achieved,
            rebate_amount = excluded.rebate_amount,
            status = 'pending_approval'
        where scheme_eligibility.status = 'pending_approval';  -- don't clobber approved/posted
      v_n := v_n + 1;
    end if;
  end loop;

  perform write_audit('update','schemes', p_scheme::text,
            format('Scheme %s eligibility computed: %s stores', v_s.name, v_n),
            jsonb_build_object('rows', v_n), v_actor);
  return v_n;
end $$;
comment on function calc_scheme_eligibility is 'Month-end: compute per-store rebate tier from invoice volume; writes pending_approval rows. §7.5.';

-- ---------------------------------------------------------------------
-- post_scheme_credit_note(eligibility_id) -> credit_note id
-- Manager-approved posting of a scheme rebate as a credit note. Respects the
-- scheme's gst_adjusted flag: if set, splits the gross rebate into base+tax and
-- reverses proportional output GST.
-- ---------------------------------------------------------------------
create or replace function post_scheme_credit_note(p_eligibility uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e     scheme_eligibility;
  v_s     schemes;
  v_base  numeric(14,2); v_tax numeric(14,2);
  v_cn    uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_e from scheme_eligibility where id = p_eligibility;
  if not found then raise exception 'post_scheme_credit_note: unknown eligibility %', p_eligibility; end if;
  if v_e.status = 'posted' or v_e.credit_note_id is not null then
    raise exception 'post_scheme_credit_note: eligibility % already posted', p_eligibility;
  end if;
  if v_e.rebate_amount <= 0 then
    raise exception 'post_scheme_credit_note: zero rebate for eligibility %', p_eligibility;
  end if;
  select * into v_s from schemes where id = v_e.scheme_id;

  if v_s.gst_adjusted then
    -- gross rebate is inclusive; back out tax at scheme gst_rate
    v_base := round(v_e.rebate_amount / (1 + v_s.gst_rate/100.0), 2);
    v_tax  := round(v_e.rebate_amount - v_base, 2);
  else
    v_base := v_e.rebate_amount; v_tax := 0;
  end if;

  v_cn := _post_credit_note(v_e.customer_store_id, v_e.rebate_amount, 'scheme_rebate',
            jsonb_build_object('gst_adjusted', v_s.gst_adjusted,
                               'base_amount', v_base, 'tax_amount', v_tax,
                               'scheme_eligibility_id', p_eligibility::text,
                               'narration', format('Scheme rebate: %s', v_s.name)));

  update scheme_eligibility
     set status = 'posted', credit_note_id = v_cn,
         approved_by = coalesce(approved_by, v_actor),
         approved_at = coalesce(approved_at, now())
   where id = p_eligibility;
  return v_cn;
end $$;
comment on function post_scheme_credit_note is 'Post an approved scheme rebate as a credit note; reverses proportional GST if scheme.gst_adjusted. §7.5.';

-- ---------------------------------------------------------------------
-- post_complaint_credit_note(complaint, amount, opts) -> credit_note id
-- Resolve a complaint by issuing a credit note (resolution = credit_note).
-- ---------------------------------------------------------------------
create or replace function post_complaint_credit_note(
  p_complaint uuid, p_amount numeric, p_opts jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c   complaints;
  v_cn  uuid;
  v_actor uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_c from complaints where id = p_complaint;
  if not found then raise exception 'post_complaint_credit_note: unknown complaint %', p_complaint; end if;
  if v_c.status = 'resolved' then
    raise exception 'post_complaint_credit_note: complaint % already resolved', p_complaint;
  end if;

  v_cn := _post_credit_note(v_c.customer_store_id, p_amount, 'complaint',
            p_opts || jsonb_build_object('complaint_id', p_complaint::text,
                        'narration', coalesce(p_opts->>'narration','Complaint credit note')));

  update complaints
     set status = 'resolved', resolution = 'credit_note',
         credit_note_id = v_cn, resolved_at = now(), updated_at = now()
   where id = p_complaint;
  return v_cn;
end $$;
comment on function post_complaint_credit_note is 'Resolve a complaint with a credit note (Dr rebate/GST, Cr AR). §7.3/§7.5.';

-- ---------------------------------------------------------------------
-- RLS. Scheme/credit-note DOCUMENTS readable by ledger + customer roles;
-- posting is through definer RPCs (no direct write policy on credit_notes).
-- Scheme masters + eligibility editable with accounting.manage.
-- ---------------------------------------------------------------------
alter table credit_notes       enable row level security;
alter table schemes            enable row level security;
alter table scheme_eligibility enable row level security;

create policy read_all_auth on credit_notes       for select to authenticated using (true);
create policy read_all_auth on schemes            for select to authenticated using (true);
create policy read_all_auth on scheme_eligibility for select to authenticated using (true);

-- schemes are a commercial master (manager/accountant)
create policy manage_schemes on schemes for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
-- eligibility rows are written by the definer calc/post RPCs; manual approval
-- edits (approve/reject) allowed with accounting.manage.
create policy manage_scheme_elig on scheme_eligibility for all to authenticated
  using (has_permission('accounting.manage')) with check (has_permission('accounting.manage'));
-- credit_notes: definer-only writes (money doc) — no write policy.

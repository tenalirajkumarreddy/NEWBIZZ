-- =====================================================================
-- 0022_crm.sql  ·  Phase 4 — CRM: leads, interactions, complaints, campaigns  (§7.3)
--
-- Grow and retain customers. This is operational/AUTH data with NO ledger
-- impact of its own. The two places CRM touches money are handled elsewhere by
-- the existing gateways:
--   • lead → convert creates a real customer + first store (masters only here)
--   • complaint resolved via credit note posts through 0023 post_complaint_credit_note
-- so this migration stays money-free (Invariant 1/3 preserved).
-- =====================================================================

create type lead_status        as enum ('new','contacted','qualified','converted','lost');
create type interaction_type   as enum ('call','visit','whatsapp','order','note');
create type complaint_status   as enum ('open','in_progress','resolved','rejected');
create type complaint_resolution as enum ('replacement','credit_note','rejected');
create type campaign_channel   as enum ('whatsapp','sms','email');
create type campaign_status    as enum ('draft','scheduled','sending','sent','cancelled');

-- ---------------------------------------------------------------------
-- leads — prospective customers in the pipeline.
-- ---------------------------------------------------------------------
create table leads (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  company        text,
  phone          text,
  email          text,
  source         text,                              -- referral / campaign / walk-in
  assigned_to    uuid references users(id),
  status         lead_status not null default 'new',
  notes          text,
  follow_up_date date,
  converted_customer_id uuid references customers(id),   -- set on conversion
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index leads_status_idx    on leads (status, follow_up_date);
create index leads_assigned_idx  on leads (assigned_to);

-- ---------------------------------------------------------------------
-- interactions — a touch with a lead OR an existing store (exactly one).
-- ---------------------------------------------------------------------
create table interactions (
  id                uuid primary key default gen_random_uuid(),
  customer_store_id uuid references customer_stores(id) on delete cascade,
  lead_id           uuid references leads(id) on delete cascade,
  type              interaction_type not null default 'note',
  by_user_id        uuid references users(id),
  note              text,
  created_at        timestamptz not null default now(),
  check (customer_store_id is not null or lead_id is not null)
);
create index interactions_store_idx on interactions (customer_store_id, created_at);
create index interactions_lead_idx  on interactions (lead_id, created_at);

-- ---------------------------------------------------------------------
-- complaints — against a store; resolution may route to a credit note (0023).
-- ---------------------------------------------------------------------
create table complaints (
  id                uuid primary key default gen_random_uuid(),
  customer_store_id uuid not null references customer_stores(id),
  status            complaint_status not null default 'open',
  resolution        complaint_resolution,            -- set when resolved
  credit_note_id    uuid,                            -- → credit_notes(id) (0023); no FK (later migration)
  note              text,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  updated_at        timestamptz
);
create index complaints_store_idx  on complaints (customer_store_id, status);
create index complaints_status_idx on complaints (status);
comment on column complaints.credit_note_id is 'Set by post_complaint_credit_note (0023); soft link (FK target created later).';

-- ---------------------------------------------------------------------
-- campaigns + results — outbound messaging. Sending itself is app-layer
-- (official WhatsApp Business Cloud API / DLT SMS, §7.8); this stores the
-- definition and per-store outcome for attribution.
-- ---------------------------------------------------------------------
create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  audience_json jsonb not null default '{}'::jsonb,   -- filter spec resolved at send time
  message       text,
  channel       campaign_channel not null default 'whatsapp',
  schedule_at   timestamptz,
  status        campaign_status not null default 'draft',
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create table campaign_results (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  customer_store_id uuid references customer_stores(id),
  sent              boolean not null default false,
  read              boolean not null default false,
  order_id          uuid references sales_orders(id),  -- attribution: did the touch drive an order?
  created_at        timestamptz not null default now()
);
create index campaign_results_campaign_idx on campaign_results (campaign_id);

create trigger leads_touch      before update on leads      for each row execute function touch_updated_at();
create trigger complaints_touch before update on complaints for each row execute function touch_updated_at();
create trigger campaigns_touch  before update on campaigns  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- convert_lead(p_lead, p_customer jsonb, p_store jsonb) -> customer id
-- Turns a qualified lead into a real customer + its first store (masters only;
-- no ledger). Idempotent-ish: refuses to convert an already-converted lead.
-- Codes are generated collision-proof (customers persist across FYs, so we do
-- NOT use the yearly-resetting number series for them).
--   p_customer: { name?, kind?, gstin?, phone?, email?, state_code?, credit_limit?, credit_days? }
--   p_store   : { name?, address_line?, area?, city?, pincode?, state_code?, route_id? }
-- ---------------------------------------------------------------------
create or replace function convert_lead(
  p_lead uuid, p_customer jsonb default '{}'::jsonb, p_store jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead   leads;
  v_cust   uuid;
  v_store  uuid;
  v_ccode  text;
  v_scode  text;
  v_actor  uuid := nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
begin
  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'convert_lead: unknown lead %', p_lead; end if;
  if v_lead.status = 'converted' or v_lead.converted_customer_id is not null then
    raise exception 'convert_lead: lead % already converted', p_lead;
  end if;

  v_ccode := 'CUST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_scode := 'STR-'  || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into customers (code, name, kind, gstin, pan, state_code, phone, email,
                         credit_limit, credit_days, created_by)
  values (v_ccode,
          coalesce(p_customer->>'name', v_lead.company, v_lead.name),
          coalesce((p_customer->>'kind')::customer_kind, 'retail'),
          nullif(p_customer->>'gstin',''),
          nullif(p_customer->>'pan',''),
          coalesce(p_customer->>'state_code','33'),
          coalesce(p_customer->>'phone', v_lead.phone),
          coalesce(p_customer->>'email', v_lead.email),
          coalesce((p_customer->>'credit_limit')::numeric, 0),
          coalesce((p_customer->>'credit_days')::int, 0),
          v_actor)
  returning id into v_cust;

  insert into customer_stores (customer_id, code, name, contact_name, phone,
                               address_line, area, city, pincode, state_code,
                               route_id, created_by)
  values (v_cust, v_scode,
          coalesce(p_store->>'name', 'Main Store'),
          coalesce(p_store->>'contact_name', v_lead.name),
          coalesce(p_store->>'phone', v_lead.phone),
          nullif(p_store->>'address_line',''),
          nullif(p_store->>'area',''),
          nullif(p_store->>'city',''),
          nullif(p_store->>'pincode',''),
          coalesce(p_store->>'state_code','33'),
          nullif(p_store->>'route_id','')::uuid,
          v_actor)
  returning id into v_store;

  update leads
     set status = 'converted', converted_customer_id = v_cust, updated_at = now()
   where id = p_lead;

  insert into interactions (lead_id, customer_store_id, type, by_user_id, note)
  values (p_lead, v_store, 'note', v_actor,
          format('Lead converted → customer %s / store %s', v_ccode, v_scode));

  perform write_audit('insert','customers', v_cust::text,
            format('Lead %s converted to customer %s', p_lead, v_ccode),
            jsonb_build_object('lead_id', p_lead, 'customer_code', v_ccode,
                               'store_code', v_scode), v_actor);
  return v_cust;
end $$;
comment on function convert_lead is 'Lead → real customer + first store (masters only, no ledger). §7.3.';

-- ---------------------------------------------------------------------
-- RLS: CRM is readable/writable by anyone who can manage customers or create
-- orders (field + office). Lead conversion goes through the definer RPC.
-- ---------------------------------------------------------------------
alter table leads             enable row level security;
alter table interactions      enable row level security;
alter table complaints        enable row level security;
alter table campaigns         enable row level security;
alter table campaign_results  enable row level security;

create policy read_all_auth on leads            for select to authenticated using (true);
create policy read_all_auth on interactions     for select to authenticated using (true);
create policy read_all_auth on complaints       for select to authenticated using (true);
create policy read_all_auth on campaigns        for select to authenticated using (true);
create policy read_all_auth on campaign_results for select to authenticated using (true);

create policy manage_leads        on leads            for all to authenticated
  using (has_permission('customer.manage') or has_permission('order.create'))
  with check (has_permission('customer.manage') or has_permission('order.create'));
create policy manage_interactions on interactions     for all to authenticated
  using (has_permission('customer.manage') or has_permission('order.create'))
  with check (has_permission('customer.manage') or has_permission('order.create'));
create policy manage_complaints   on complaints       for all to authenticated
  using (has_permission('customer.manage') or has_permission('order.create'))
  with check (has_permission('customer.manage') or has_permission('order.create'));
create policy manage_campaigns    on campaigns        for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));
create policy manage_campaign_res on campaign_results for all to authenticated
  using (has_permission('customer.manage')) with check (has_permission('customer.manage'));

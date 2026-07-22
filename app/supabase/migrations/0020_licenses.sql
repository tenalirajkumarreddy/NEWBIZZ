-- =====================================================================
-- 0020_licenses.sql  ·  Phase 3 — statutory licenses & certifications (§6.7)
--
-- Track statutory licenses (FSSAI, BIS/ISI, PCB consent, trade license, legal
-- metrology) so the business never sells on a lapsed license, and FSSAI/BIS
-- numbers can print on invoices. Pure register — no ledger, no stock.
-- QC/lab testing (A2) stays excluded; this is only the license register.
-- =====================================================================

create type license_type   as enum
  ('fssai','bis_isi','pcb_consent','trade_license','legal_metrology','other');
create type license_status as enum ('active','expired','renewal_in_progress');

create table licenses (
  id                    uuid primary key default gen_random_uuid(),
  type                  license_type not null,
  license_no            text not null,
  issuing_authority     text,
  issued_date           date,
  expiry_date           date not null,
  document_url          text,
  status                license_status not null default 'active',
  renewal_reminder_days int not null default 60 check (renewal_reminder_days >= 0),
  notes                 text,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);
create index licenses_expiry_idx on licenses (expiry_date);
create index licenses_status_idx on licenses (status);
comment on table licenses is 'Statutory license register; license_expiry_scan() drives renewal alerts. No accounting impact.';

create trigger licenses_touch before update on licenses
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- licenses_due(as_of) -> table of licenses within their reminder window or
-- already expired. The dashboard + the daily scan both read this.
-- ---------------------------------------------------------------------
create or replace function licenses_due(p_as_of date default current_date)
returns table (id uuid, type license_type, license_no text, expiry_date date,
               days_to_expiry int, is_expired boolean)
language sql stable
set search_path = public
as $$
  select l.id, l.type, l.license_no, l.expiry_date,
         (l.expiry_date - p_as_of) as days_to_expiry,
         (l.expiry_date < p_as_of) as is_expired
    from licenses l
   where l.status <> 'renewal_in_progress'
     and l.expiry_date <= p_as_of + (l.renewal_reminder_days || ' days')::interval
   order by l.expiry_date;
$$;

-- ---------------------------------------------------------------------
-- license_expiry_scan() — daily job (§1.6). Marks lapsed licenses 'expired'
-- and returns the set that needs a renewal alert (caller notifies).
-- Idempotent: safe to run repeatedly.
-- ---------------------------------------------------------------------
create or replace function license_expiry_scan()
returns table (id uuid, type license_type, license_no text, expiry_date date,
               days_to_expiry int, is_expired boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- flip anything past expiry to 'expired' (unless a renewal is already in progress)
  update licenses
     set status = 'expired', updated_at = now()
   where expiry_date < current_date and status = 'active';

  return query select * from licenses_due(current_date);
end $$;
comment on function license_expiry_scan is 'Daily: mark lapsed licenses expired, return the renewal-alert set. Idempotent.';

-- ---------------------------------------------------------------------
-- RLS: readable by any authenticated user (numbers surface on invoices);
-- writable with settings.manage (admin/settings custodian).
-- ---------------------------------------------------------------------
alter table licenses enable row level security;
create policy read_all_auth on licenses for select to authenticated using (true);
create policy manage_licenses on licenses for all to authenticated
  using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

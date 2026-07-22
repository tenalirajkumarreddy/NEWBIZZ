-- =====================================================================
-- 0044_manual_vouchers.sql  ·  Phase 2 — Manual Vouchers (§5.2)
--
-- The accountant needs to post entries the auto-engine can't infer: provisions,
-- depreciation, adjustments, contra (cash↔bank), opening tweaks, corrections.
-- These reuse journal_entries/journal_lines with source='voucher'. post_journal
-- itself is not permission-gated (it's called by many definer RPCs that gate
-- themselves), so this thin wrapper adds the has_permission('journal.post')
-- capability check for the one path a human drives directly.
--
-- Reversal already exists (reverse_journal, granted) — one click sets
-- reverses_id and posts the mirror entry in the open FY.
-- =====================================================================

-- ---------------------------------------------------------------------
-- post_voucher(p_header, p_lines) -> journal_entries.id
--   header: { entry_date, narration?, voucher_type? }   (source forced 'voucher')
--   lines : same shape post_journal accepts — [{account_code|account_id,
--            debit, credit, party_type?, party_id?, cost_center_code?, memo?}]
-- Balanced Dr=Cr and >=2 lines are enforced downstream by post_journal.
-- doc_type 'journal' shares the JV number series (Invariant 8).
-- ---------------------------------------------------------------------
create or replace function post_voucher(p_header jsonb, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('journal.post') then
    raise exception 'post_voucher: not authorized (journal.post required)';
  end if;

  v_id := post_journal(
    jsonb_build_object(
      'entry_date', p_header->>'entry_date',
      'doc_type', 'journal',
      'source', 'voucher',
      'narration', coalesce(nullif(p_header->>'narration',''),
                    'Manual voucher' ||
                    coalesce(' ('||nullif(p_header->>'voucher_type','')||')',''))),
    p_lines);
  return v_id;
end $$;
comment on function post_voucher is 'Gated (journal.post) manual voucher poster; forwards to post_journal with source=voucher. §5.2.';

revoke all on function post_voucher(jsonb, jsonb) from public, anon;
grant execute on function post_voucher(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- voucher_templates — prefill for recurring manual entries. default_lines_json
-- mirrors the p_lines shape; the form loads it and lets the user tweak amounts.
-- ---------------------------------------------------------------------
create table voucher_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  voucher_type       text not null default 'journal',   -- payment|receipt|contra|journal
  default_lines_json jsonb not null default '[]'::jsonb,
  notes              text,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
comment on table voucher_templates is 'Prefill for recurring manual vouchers. §5.2.';

create trigger voucher_templates_touch before update on voucher_templates
  for each row execute function touch_updated_at();

alter table voucher_templates enable row level security;
create policy read_all_auth on voucher_templates for select to authenticated using (true);
create policy manage_voucher_templates on voucher_templates for all to authenticated
  using (has_permission('journal.post')) with check (has_permission('journal.post'));

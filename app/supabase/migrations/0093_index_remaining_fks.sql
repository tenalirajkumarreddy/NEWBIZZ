-- =====================================================================
-- 0093_index_remaining_fks.sql   Index FK columns created after 0088
--
-- Follow-up to 0088_perf_fk_indexes.sql. The performance advisor flagged the
-- FK columns added by the later job-card (0090), customer-portal (0091) and
-- payment-intent (0092) migrations that had no leading-column index yet.
--
-- Create indexes (convention `<table>_<column>_idx`, all `if not exists`).
-- Columns already covered (confirmed against live schema) are skipped:
--   production_job_cards.run_id       -> production_job_cards_run_idx
--   production_job_cards.output_item  -> (created here)
--   customer_portal.customer_id       -> customer_portal_pkey
--   payment_intents.customer_id       -> payment_intents_customer_idx
-- =====================================================================

create index if not exists production_job_cards_assigned_to_idx   on production_job_cards (assigned_to);
create index if not exists production_job_cards_created_by_idx    on production_job_cards (created_by);
create index if not exists production_job_cards_device_id_idx     on production_job_cards (device_id);
create index if not exists production_job_cards_fy_id_idx         on production_job_cards (fy_id);
create index if not exists production_job_cards_output_item_id_idx on production_job_cards (output_item_id);

create index if not exists customer_portal_created_by_idx         on customer_portal (created_by);

create index if not exists payment_intents_matched_receipt_id_idx on payment_intents (matched_receipt_id);
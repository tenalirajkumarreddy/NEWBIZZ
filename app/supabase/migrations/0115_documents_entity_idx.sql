-- =====================================================================
-- 0115_documents_entity_idx
-- Fast lookups for transaction-attached receipts (documents vault
-- tagging): entity_type + entity_id index on documents.
-- =====================================================================
create index if not exists documents_entity_idx on public.documents(entity_type, entity_id);

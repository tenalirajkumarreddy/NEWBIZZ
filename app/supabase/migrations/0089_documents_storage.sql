-- =====================================================================
-- 0089_documents_storage.sql   Private documents bucket + storage RLS +
--                              documents metadata policy adjustments.
--
-- The `documents` table (metadata) exists since 0027 but had no Storage
-- bucket and no app-layer usage. This migration adds the missing private
-- bucket, gates byte-level access via Storage RLS, and realigns the table's
-- DML policies so any authenticated user can upload while only the uploader
-- (or an accounting manager) edits/deletes metadata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Private bucket (max 10 MB), matching the vault media allow-list.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- B) Storage RLS on storage.objects — authenticated byte-level access,
--    scoped to the documents bucket (service_role bypasses by role).
-- ---------------------------------------------------------------------
create policy "documents read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

create policy "documents insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

create policy "documents delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents');

-- ---------------------------------------------------------------------
-- C) Realign documents table DML policies.
--    Keep read_documents (SELECT) as-is: internal visible to all
--    authenticated; restricted only to uploader + accounting manager.
--    Replace the permission-gated ALL policy with narrow insert/owner rules.
-- ---------------------------------------------------------------------
drop policy if exists manage_documents on documents;

create policy documents_insert on documents for insert to authenticated
  with check (true);

create policy documents_owner_update on documents for update to authenticated
  using (uploaded_by = current_app_user() or has_permission('accounting.manage'));

create policy documents_owner_delete on documents for delete to authenticated
  using (uploaded_by = current_app_user() or has_permission('accounting.manage'));
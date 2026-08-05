# Documents Vault — Design Spec

**Date:** 2026-08-05
**Module:** `documents` (existing table since `0027`)
**Status:** Draft

---

## 1. Purpose

Build the standalone **Documents Vault** — a central page where any
authenticated user can upload files, tag them, attach them to any business
entity (license, supplier, invoice, vehicle, bank account, …), then search,
preview, and download them.

The backend's `documents` metadata table already exists (migration `0027`)
complete with RLS, but has **zero UI** and — critically — the `documents`
**Storage bucket does not exist** and there is **no app-layer Storage code
anywhere** in the codebase. This spec adds the missing bucket + storage
policy migration, the data layer, the page, and the nav entry.

Scope boundary: inline "attach to this record" panels on existing pages are
**explicitly v2** and out of scope. This spec is the vault only.

---

## 2. Current state (verified against live DB)

- `documents` table (public): `id`, `title`, `storage_bucket`,
  `storage_path`, `mime_type`, `size_bytes`, `entity_type`,
  `entity_id`, `tags text[]`, `visibility` (`internal` | `restricted`),
  `uploaded_by`, `created_at`, `updated_at`,
  `unique (storage_bucket, storage_path)`.
- RLS enabled. Policies: `read_documents` (SELECT) and `manage_documents`
  (ALL) — both keyed to permission codes / uploader.
- Row count: **0**.
- Storage buckets: only `party-images` (public). **No `documents` bucket.**
- No `supabase.storage` usage anywhere in `app/src`.

---

## 3. Storage & Security design (migration `0089_documents_storage.sql`)

### 3.1 Create a private bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760);  -- 10 MB
on conflict (id) do nothing;
```

Private (not public, unlike `party-images`) so restricted documents are never
fetchable without a login + signed URL.

### 3.2 Storage RLS on `storage.objects`

Grant `authenticated` byte-level access scoped to the `documents` bucket only:

```sql
create policy "documents read"   on storage.objects for select using (bucket_id = 'documents');
create policy "documents insert" on storage.objects for insert with check (bucket_id = 'documents');
create policy "documents delete" on storage.objects for delete using (bucket_id = 'documents');
```

Access is gated by `authenticated` (the caller already has a JWT via the auth
lib). Service-role uploads bypass RLS by role as usual. The `documents`
**metadata** row stays the authority on `visibility` via the table-level RLS.

### 3.3 Adjust `documents` table policies

- Keep `read_documents` (SELECT) unchanged: internal visible to all
  authenticated; restricted visible only to uploader or `accounting.manage`.
- Replace `manage_documents` (currently ALL, permission-gated) with narrower,
  authenticated-defaults policies:

```sql
-- anyone authenticated may attach a document
create policy documents_insert on documents for insert to authenticated
  with check (true);

-- only the uploader, or an accounting manager, may edit/delete metadata
create policy documents_owner_update on documents for update to authenticated
  using (uploaded_by = current_app_user() or has_permission('accounting.manage'));
create policy documents_owner_delete on documents for delete to authenticated
  using (uploaded_by = current_app_user() or has_permission('accounting.manage'));
```

The semantic contract: **insert = everyone, update/delete = the uploader or an
`accounting.manage` holder**. If the existing `manage_documents` policy already
implements that intent, the implementation may keep it and only add the narrow
`documents_insert` policy rather than recreating it.

---

## 4. Data layer (`app/src/lib/data/documents.ts`)

All server-side, following existing `app/src/lib/data/*` + `app/src/lib/actions/*`
conventions. Uploads flow through a **server action** using the authenticated
client (cookie session) so Storage RLS sees an authenticated JWT.

### 4.1 `uploadDocument(formData)` — server action
- Reads `FormData`: file, title, `entity_type`, `entity_id`, `tags`,
  `visibility`.
- **Validates**:
  - mime/extension in allow-list: `pdf`, `jpg`, `jpeg`, `png`, `webp`,
    `doc`, `docx`, `xls`, `xlsx`;
  - size ≤ 10 MB.
  - Rejects with a typed error object (for inline form display), never a
    generic throw.
- Uploads bytes to `documents/<folder>/<yyyyMM>/<uuid>.<ext>` where folder is
  `general` when no entity, else a slugified `entity_type`.
- Inserts the `documents` row (`visibility` default `internal`).
- Returns the created row (id, mime, path, signed preview URL).

### 4.2 `getDocuments(filters)` — server component read
- Filters: `search` (title/tag ILIKE), `entityType`, `visibility`,
  `page`/`pageSize` (default 50), plus `total` count.
- Joins nothing — entity display label is resolved separately (see 4.4).

### 4.3 `getDocumentSignedUrl(id, expiresIn = 3600)`
- `supabase.storage.from('documents').createSignedUrl(path, expiresIn)`.
- Used for inline preview (images/PDF) and download.

### 4.4 `resolveEntityLabel(entityType, entityId)`
- Best-effort human label for the entity a doc is attached to
  (e.g. license → `#L-0012 · Shop Licence`). Unknown/unresolved types render
  `—`. Employs a small per-type lookup map using existing data functions;
  never throws.

### 4.5 `deleteDocument(id)`
- Owner/accounting only (enforced again on metadata row).
- Deletes the `documents` row, then best-effort removes the object from the
  `documents` bucket.

---

## 5. Page — `/documents`

### 5.1 Route & nav
- `app/src/app/(app)/documents/page.tsx` (server) → `DocumentsView.tsx` (client).
- Nav entry **Documents** in the **Accounting** group, **no `perm`**
  (all authenticated). e.g.
  `{ id: "documents", label: "Documents", href: "/documents" }`.

### 5.2 Layout (top → bottom)
1. **Toolbar**: title + Upload button + filters — search text, entity-type
   select, visibility select.
2. **List** (table): title (with file-type icon), entity ref label, size,
   tags, uploaded-by + date, visibility badge. Row actions: Preview,
   Download, Delete (delete only for owner/accounting).
3. Empty state when no matches.

### 5.3 Upload drawer
- Fields: Title (required), Entity picker, Tags (comma-separated), Visibility
  toggle (Internal / Restricted), file drop/select.
- On submit: `uploadDocument`; inline validation errors; success closes drawer
  and refreshes the list.

### 5.4 Preview modal
- Images & PDF: inline (signed URL in `iframe`/`<img>`).
- Office docs: download-link card (no inline preview), with the signed URL.

---

## 6. Entity picker

- Curated dropdown of common attachable types:
  License, Supplier, Customer, Store, Item, Vehicle, Invoice, Receipt,
  Supplier Bill, Delivery Challan, Credit Note, Bank Account, Loan, Worker,
  Expense, BOM, Production Run — plus **No attachment** and free-text fallback.
- Choosing a type reveals an async search box that resolves the record via
  existing data functions (best-effort; unknown ids degrade to free text).

---

## 7. Error handling & edge cases

- **Type/size** rejected inline with a specific message; oversized blocked
  server-side (never trusts client).
- **Duplicates:** no unique constraint on (entity, title) — matching rows are
  allowed.
- **Syncing:** storage-object deletion on `deleteDocument` is best-effort; a
  stray object (row gone but object remains) is acceptable and harmless.
- **Empty entity:** files can be uploaded with no attachment (general vault).
- **Restricted docs** render a lock badge; preview/download of a restricted
  doc a viewer lacks permission for is prevented by table RLS (row won't be
  returned), so the UI can't even render the row.

---

## 8. Testing

- Migration applies cleanly; `documents` bucket exists, private, 10 MB cap.
- Upload happy path: file appears in list, preview renders, storage object
  exists.
- Validation: pdf ok; `.exe` and 11 MB rejected with inline errors.
- RLS: anon `SELECT` on `documents` returns nothing; authenticated sees
  internal rows; non-owner/non-accounting cannot delete someone else's row;
  `documents` bucket objects are not public-URL-fetchable.
- Delete removes row + object.
- Typecheck + `next build` green.

---

## 9. Out of scope (explicit)

- Inline attach/detach panels on entity pages (v2).
- Versioning, folders/tree, OCR, full-text indexing.
- Document preview for Office formats (download only).
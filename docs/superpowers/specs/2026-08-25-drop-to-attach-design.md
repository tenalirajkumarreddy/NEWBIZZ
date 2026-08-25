# Global Drop-to-Attach — Design Spec

**Date:** 2026-08-25
**Module:** `documents` (+ shell/topbar)
**Status:** Approved design — awaiting user review of this spec
**Builds on:** Documents Vault (`2026-08-05-documents-vault-design.md`, migration `0089`), inline `DocumentAttachPanel`

---

## 1. Purpose

Let users file paperwork at the moment they have it in hand: **drag any file onto the app** (or press the new header **+**), and a popup asks *"what exactly is this file?"* — e.g. a ₹500 petty-cash receipt — then either **links it to an existing record** or **creates the record** (expense, supplier bill, GRN, …) with the file attached in one go. No hunting for the right page first.

## 2. Current state (verified)

- `documents` table (0027) + private `documents` bucket, 10 MB cap, storage RLS (0089).
- Vault page `/documents` with upload drawer; server action `uploadDocument()` validates mime/size server-side, uploads to `documents/<type>/<yyyyMM>/<uuid>.ext`, inserts metadata, cleans up orphan object if metadata insert fails (`app/src/lib/actions/documents.ts:41`).
- Inline `DocumentAttachPanel` already wired on detail pages: suppliers, customers, invoices, items, vehicles, production runs.
- `ENTITY_LABEL_LOOKUPS` (`lib/data/documents.ts:43`) covers license, supplier, customer, store, item, vehicle, invoice, supplier_bill, challan, credit_note, bank_account, worker, production_run, sales_order — **missing**: expense, customer_receipt, purchase_order, purchase_receipt (GRN), supplier_payment.
- `Topbar` right cluster: GlobalSearch → Warehouse selector → FY selector → `NotificationsBell` → avatar (`components/shell/Topbar.tsx:52-67`). The **+ goes immediately left of `NotificationsBell`**.
- No global drag-and-drop handling exists anywhere.

## 3. Decisions locked (user-approved)

| Decision | Choice |
|---|---|
| Create depth | **Full create form inside the popup** (no navigation) |
| Types offered | Expense · Supplier Bill · Purchase/GRN · Supplier Payment · Customer Receipt · Bank document · Plain document |
| Drop scope | **Global overlay** — drag anywhere on any page shows "Drop to attach" |
| First screen | **Type first**, then Link / Create tabs |
| Header + | Opens the **same popup**, starting at manual file pick |
| Link mode | Search by number/name, pick, attach |
| Multi-file | Allowed; optional "apply same type to all" |
| Metadata | Editable title / tags / visibility before save |
| Gating | Tiles filtered by the user's permissions |

## 4. UX flow

```
drag file(s) anywhere ──▶ overlay "Drop to attach" ──▶ drop
header ＋ ──▶ file picker ──────────────────────────▶┐
                                                     ▼
        ┌────────────────── POPUP ───────────────────────────────┐
        │ Step 0 STAGE    chips: thumbnail/name/size (+ ✕ each);  │
        │                 invalid type/size flagged inline         │
        │ Step 1 TYPE     tile grid (permission-filtered);         │
        │                 multi-file ⇒ "apply to all files" toggle │
        │ Step 2a LINK    tab "Link to existing":                  │
        │                 search box → results (no · label · date) │
        │                 → pick → attach                          │
        │ Step 2b CREATE  tab "Create new": full form for the      │
        │                 chosen type → Save = record + attachment │
        │ Any step        title / tags / visibility editable       │
        └──────────────────────────────────────────────────────────┘
```

- Esc / ✕ cancels; nothing uploads until final confirm.
- After success: toast ("Attached to EXP-0042"), popup closes, staged files cleared.

### Type registry (single source of truth)

Each entry declares: key, label, glyph, `perm` (view-gate for the tile), link-search config (RPC/data fn + result renderer), create-form component, `entity_type` string stored on the document row.

| Key | Perm | entity_type | Link searches by | Create form |
|---|---|---|---|---|
| expense | `expense.manage` | expense | expense no / title / party | existing expense fields (date, amount, head, party, notes) |
| supplier_bill | `purchase.record_bill` | supplier_bill | bill no / supplier | supplier, bill no/date, amounts |
| purchase_grn | `purchase.create` | purchase_order / purchase_receipt | PO/GRN no / supplier | supplier + line summary |
| supplier_payment | `purchase.pay` | supplier_payment | payment no / supplier | supplier, amount, mode |
| customer_receipt | `receipt.record` | customer_receipt | receipt no / customer / store | customer-store, amount, mode |
| bank_document | `bank.reconcile` or `bank.cheque` | bank_account | account name | none (link-only) |
| plain | — (any authenticated) | null | — | none (vault-only) |

Exact table/column names for the newer types get pinned during planning (verify against live DB, mirroring how `ENTITY_LABEL_LOOKUPS` resolves labels). Extend `ENTITY_LABEL_LOOKUPS` + `KIND_LABELS` with the missing types so vault rows render proper labels.

## 5. Architecture & components

```
AppShell
  └─ DropZoneProvider            (client) window-level dragenter/dragover/dragleave/drop;
       │                          overlay UI; holds staged File[]; opens dialog
       └─ QuickAttachDialog       step machine stage → type → link|create → done
            ├─ TypeTiles          filtered by session permissions
            ├─ LinkSearch         per-type async search (existing data fns)
            ├─ CreateForms        thin wrappers around modules' existing actions
            └─ MetadataFields     title/tags/visibility per file
Topbar
  └─ QuickAttachButton  ＋   left of NotificationsBell; triggers file picker →
                              same provider state
Server
  └─ uploadDocument()           reused unchanged (validation, orphan cleanup);
                                binds entity_type/entity_id at insert time
  └─ <module> create actions    reused unchanged (expense/bill/GRN/payment/receipt RPCs)
```

- Provider mounts once in `(app)` layout so every authenticated page gets it.
- Drag listeners are window-level but only react when `dataTransfer` contains `Files`; non-file drags (text, internal UI drags) never trigger the overlay.

## 6. Data flow

1. Stage: client-side mime/size pre-check (same allow-list constants imported from `lib/data/documents.ts`). No bytes move yet.
2. On final save:
   - **Create path:** call the module's create action → get record id → `uploadDocument()` per file with `entityType/entityId` bound → metadata row carries the linkage natively. If upload fails after record creation, record still stands; error surfaces per-file with retry.
   - **Link path:** `uploadDocument()` with the picked entity directly.
   - **Plain path:** `uploadDocument()` with no entity.
3. `revalidatePath` for `/documents` and the relevant module register (pattern exists).

Rationale for upload-at-save (vs upload-first): single storage write, no orphans on cancel, and the metadata row is born linked — matching the existing invariant that stray objects are cleaned best-effort but rows are authoritative.

## 7. Error handling & edge cases

- Invalid type/size: flagged at staging, re-validated server-side (never trust client).
- Dropping a folder: browsers expose `File` items only; folder drops yield nothing usable → ignore gracefully.
- Multi-file partial failure: per-file status chip (queued → uploading → done/error + retry).
- Create-form validation errors render inline inside the popup; nothing uploaded.
- Session loss mid-flow: server actions return auth errors as today; staged files stay staged client-side.
- Duplicate attachments intentionally allowed (same as vault today).

## 8. Security

- All writes through existing server actions under the authenticated cookie client (Storage RLS + `documents` insert policy apply unchanged).
- Tile visibility is UX only; the real gates are the modules' own create actions/RPCs and `has_permission()` — a crafted request without the perm fails server-side exactly as it would from the module's own page.
- No new env/secrets.

## 9. Testing

- Permission filtering: tiles rendered match session perms (unit).
- Flow tests (manual/E2E): drop 1 file → link to invoice; drop 3 files → apply-to-all; create expense from popup end-to-end; ＋ button flow; Esc cancels with zero storage objects created.
- Validation: `.exe` and >10 MB rejected at staging.
- Typecheck stays at baseline.

## 10. Out of scope (explicit)

- OCR / automatic classification of the dropped file.
- Touch drag-and-drop on mobile (＋ picker covers mobile).
- Zip extraction / bulk import.
- Inline attach panels on remaining detail pages (separate small task, reuses existing panel).

## 11. Acceptance criteria

1. Dragging a file over any page shows the overlay; dropping opens the popup with the file staged.
2. ＋ sits left of the notifications bell and opens the same popup via file picker.
3. Only permitted types appear as tiles; server-side perms remain the authority.
4. A ₹500 receipt can become a posted Expense with the file attached without leaving the popup.
5. Link-by-search attaches to the exact record; vault row shows correct entity label.
6. Multi-file drop works with apply-to-all; per-file success/failure visible.
7. Cancel leaves zero new storage objects and zero new rows.

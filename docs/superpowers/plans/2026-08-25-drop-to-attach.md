# Drop-to-Attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag a file anywhere in NEWBIZZ (or press the new topbar ＋) → a popup asks "what is this file?" → link it to an existing record (search by number/name) or create the record (Expense / Supplier Bill / GRN / Supplier Payment / Customer Receipt / plain document) with the file attached in one go.

**Architecture:** A single `QuickAttachProvider` (client) mounted in `AppShell` owns window-level drag detection, a full-screen drop overlay, a hidden multi-file input, and the staged-file queue. It renders `QuickAttachDialog`, a step machine (stage → type tiles → link/create) driven by a static type registry. All writes reuse existing server actions: module creates (`recordExpense`, `postSupplierBill`, `postGrn`, `paySupplier`, `recordReceipt`) followed by the existing `uploadDocument()` with the entity binding set at insert time. Server-side permissions remain the authority; claims only filter which tiles render.

**Tech Stack:** Next.js 14.2.35 app router, React server actions, Supabase JS (cookie session client), Tailwind utility classes matching the existing ink/line/fill token system, existing UI kit (`Dialog`, `Button`, `Field`, `Input`, `Select`, `Badge`, `Toast`). **No new dependencies.**

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-25-drop-to-attach-design.md`
- No new npm dependencies; no DB migrations (documents infra from 0089 is reused as-is).
- Upload allow-list and size cap come from one shared client-safe module (Task 1); server always re-validates via existing `uploadDocument`.
- Permission codes used verbatim: `expense.manage`, `purchase.record_bill`, `purchase.create`, `purchase.pay`, `receipt.record`, `bank.reconcile`, `bank.cheque`.
- Client permission checks use `can(claims, perm)` from `@/lib/auth/claims` — UX filtering only; RPCs re-check server-side (Invariant 3).
- Follow existing code style: `// ---- title ----` header comments explaining purpose, typed public function signatures, no comments inside JSX beyond section markers.
- Verification commands: `npm run typecheck` (must stay at baseline — payroll/fleet errors pre-exist; zero new errors allowed) and `npm run build` green at the end. There is **no unit test framework** in this repo; verification is typecheck + build + the manual checklist in Task 7.
- Commit style: conventional commits (`feat(quick-attach): …`). Never commit secrets.

---

### Task 1: Shared limits module + label coverage for newer entity types

**Files:**
- Create: `app/src/lib/documents-limits.ts`
- Modify: `app/src/lib/data/documents.ts` (remove local constants, re-export from shared module; fix `bank_account` lookup; extend `ENTITY_LABEL_LOOKUPS`)
- Modify: `app/src/lib/actions/documents.ts` (import labels/constants consistently)

**Interfaces:**
- Produces: `ALLOWED_MIME_PREFIXES: string[]`, `MAX_FILE_BYTES: number`, `isAllowedFile(file: File): boolean` from `@/lib/documents-limits` — consumed by Tasks 3–5 and by existing `actions/documents.ts`.
- Produces: extended `ENTITY_LABEL_LOOKUPS` so vault rows for the new types render proper labels (consumed by Task 5 result rendering indirectly).

**Background facts (verified against live DB 2026-08-25):**
- `expenses(id, expense_no, amount, note, expense_date)`; `supplier_bills(id, bill_no, supplier_bill_no, bill_date)`; `purchase_orders(id, po_no, po_date)`; `purchase_receipts(id, grn_no, grn_date)`; `supplier_payments(id, payment_no, payment_date, mode, reference)`; `customer_receipts(id, receipt_no, receipt_date, reference)`; `bank_accounts(id, name, bank_name, account_no, …)` — **note: `account_name` does NOT exist**; the current `ENTITY_LABEL_LOOKUPS.bank_account.column = "account_name"` is a latent bug (its select fails silently today).

- [ ] **Step 1: Create the client-safe limits module**

Create `app/src/lib/documents-limits.ts`:

```ts
// =====================================================================
// lib/documents-limits.ts — client-safe documents constraints.
//
// The upload allow-list and size cap previously lived in
// lib/data/documents.ts, which is `server-only`; client components (the
// quick-attach staging step) need the same rules to pre-flag bad files
// without importing server code. This module has NO server-only imports
// and is safe everywhere. The server action remains the authority — it
// re-validates on every upload.
// =====================================================================

/** Allowed mime prefixes (pdf matched exactly, others by prefix). */
export const ALLOWED_MIME_PREFIXES = [
  "pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "msword",
  "officedocument",
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function isAllowedMime(mimeLower: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) =>
    p === "pdf" ? mimeLower === "application/pdf" : mimeLower.startsWith(p),
  );
}

export function isAllowedFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  return isAllowedMime(mime) && file.size <= MAX_FILE_BYTES;
}

/** Rejection reason for staging UI, or null when acceptable. */
export function fileRejectionReason(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  if (!isAllowedMime(mime)) {
    return "Only PDF, images (jpg/png/webp), and Office documents are allowed.";
  }
  if (file.size > MAX_FILE_BYTES) return "File exceeds the 10 MB limit.";
  return null;
}
```

- [ ] **Step 2: Rewire `lib/data/documents.ts`**

In `app/src/lib/data/documents.ts`:

Replace lines 39–40:

```ts
export const ALLOWED_MIME_PREFIXES = ["pdf", "image/jpeg", "image/png", "image/webp", "msword", "officedocument"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
```

with:

```ts
export { ALLOWED_MIME_PREFIXES, MAX_FILE_BYTES } from "@/lib/documents-limits";
```

In `ENTITY_LABEL_LOOKUPS` (line ~43):

- Fix the latent bug: change `bank_account: { table: "bank_accounts", column: "account_name" }` to `column: "name"`.
- Add these entries after `sales_order`:

```ts
  expense: { table: "expenses", column: "expense_no" },
  customer_receipt: { table: "customer_receipts", column: "receipt_no" },
  purchase_order: { table: "purchase_orders", column: "po_no" },
  purchase_receipt: { table: "purchase_receipts", column: "grn_no" },
  supplier_payment: { table: "supplier_payments", column: "payment_no" },
```

- [ ] **Step 3: Extend `KIND_LABELS` in `lib/actions/documents.ts`**

Add after `sales_order: "Sales Order",` (line ~32):

```ts
  customer_receipt: "Customer Receipt",
  purchase_order: "Purchase Order",
  purchase_receipt: "GRN",
  supplier_payment: "Supplier Payment",
```

(`expense`, `loan`, `bom` already exist.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck` (in `app/`).
Expected: same error count as baseline (payroll/fleet errors pre-exist; none in touched files).

Also confirm the vault page still compiles its import of the constants (it imports from `@/lib/actions/documents` which re-imports from `@/lib/data/documents`) — typecheck covers this.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents-limits.ts src/lib/data/documents.ts src/lib/actions/documents.ts
git commit -m "feat(documents): client-safe limits + label coverage for newer entity types"
```

---

### Task 2: Link-target search server action

**Files:**
- Create: `app/src/lib/actions/quick-attach.ts`

**Interfaces:**
- Consumes: nothing from other tasks (standalone server action file).
- Produces:

```ts
export interface LinkHit { id: string; title: string; subtitle: string | null; }
export type QuickTypeKey =
  | "expense" | "supplier_bill" | "purchase_grn" | "supplier_payment"
  | "customer_receipt" | "bank_document" | "plain";
export async function searchLinkTargets(typeKey: QuickTypeKey, query: string):
  Promise<{ ok: true; hits: LinkHit[] } | { ok: false; error: string }>;
export interface PickerOption { id: string; label: string; sub?: string | null; }
export async function pickSuppliers(query: string): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
export async function pickCustomerStores(query: string): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
export async function pickItems(query: string): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
export async function pickExpenseAccounts(): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
export async function pickPaymentMethods(): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
```

These picker actions are consumed by the create forms in Task 5.

**Conventions copied from `lib/data/search.ts`:** escape `%`/`_` before ILIKE, `.or()` across display columns, limit 8 per type, minimum 2-char query. Reads run under the authenticated cookie client so RLS scopes what each user sees.

- [ ] **Step 1: Write the action file**

Create `app/src/lib/actions/quick-attach.ts`:

```ts
"use server";

// =====================================================================
// lib/actions/quick-attach.ts — server actions for the Drop-to-Attach
// popup: per-type "link to existing" search plus small option pickers
// for the inline create forms. Everything is an RLS-scoped read through
// the authenticated client — no writes live here (creates call the
// modules' own actions, uploads call uploadDocument).
// =====================================================================

import { createClient } from "@/lib/supabase/server";

export type QuickTypeKey =
  | "expense" | "supplier_bill" | "purchase_grn" | "supplier_payment"
  | "customer_receipt" | "bank_document" | "plain";

export interface LinkHit {
  id: string;
  title: string;
  subtitle: string | null;
}

const LIMIT = 8;

function likeNeedle(query: string): string {
  return `%${query.trim().replace(/[%_]/g, "\\$&")}%`;
}

async function searchTable(
  table: string,
  columns: string[],
  needle: string,
  select = "*",
): Promise<any[]> {
  const supabase = createClient();
  const res = await (supabase as any)
    .from(table)
    .select(select)
    .or(columns.map((c) => `${c}.ilike.${needle}`).join(","))
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  return res.data ?? [];
}

export async function searchLinkTargets(
  typeKey: QuickTypeKey,
  query: string,
): Promise<{ ok: true; hits: LinkHit[] } | { ok: false; error: string }> {
  const term = query.trim();
  if (term.length < 2) return { ok: true, hits: [] };
  const n = likeNeedle(term);

  try {
    let hits: LinkHit[] = [];
    switch (typeKey) {
      case "expense": {
        const rows = await searchTable(
          "expenses",
          ["expense_no", "note"],
          n,
          "id, expense_no, amount, expense_date, note",
        );
        hits = rows.map((r) => ({
          id: r.id,
          title: r.expense_no,
          subtitle: `₹${Number(r.amount).toLocaleString("en-IN")} · ${r.expense_date ?? ""}${r.note ? ` · ${String(r.note).slice(0, 40)}` : ""}`,
        }));
        break;
      }
      case "supplier_bill": {
        const rows = await searchTable(
          "supplier_bills",
          ["bill_no", "supplier_bill_no"],
          n,
          "id, bill_no, supplier_bill_no, bill_date, grand_total, supplier:suppliers(name)",
        );
        hits = rows.map((r) => ({
          id: r.id,
          title: r.bill_no ?? r.supplier_bill_no,
          subtitle: `${r.supplier?.name ?? ""} · ₹${Number(r.grand_total ?? 0).toLocaleString("en-IN")} · ${r.bill_date ?? ""}`,
        }));
        break;
      }
      case "purchase_grn": {
        const [pos, grns] = await Promise.all([
          searchTable("purchase_orders", ["po_no"], n, "id, po_no, po_date"),
          searchTable("purchase_receipts", ["grn_no"], n, "id, grn_no, grn_date"),
        ]);
        hits = [
          ...grns.map((r) => ({ id: r.id, title: r.grn_no, subtitle: `GRN · ${r.grn_date ?? ""}` })),
          ...pos.map((r) => ({ id: r.id, title: r.po_no, subtitle: `Purchase Order · ${r.po_date ?? ""}` })),
        ];
        break;
      }
      case "supplier_payment": {
        const rows = await searchTable(
          "supplier_payments",
          ["payment_no", "reference"],
          n,
          "id, payment_no, payment_date, amount, reference",
        );
        hits = rows.map((r) => ({
          id: r.id,
          title: r.payment_no,
          subtitle: `₹${Number(r.amount).toLocaleString("en-IN")} · ${r.payment_date ?? ""}${r.reference ? ` · ${r.reference}` : ""}`,
        }));
        break;
      }
      case "customer_receipt": {
        const rows = await searchTable(
          "customer_receipts",
          ["receipt_no", "reference"],
          n,
          "id, receipt_no, receipt_date, amount, reference",
        );
        hits = rows.map((r) => ({
          id: r.id,
          title: r.receipt_no,
          subtitle: `₹${Number(r.amount).toLocaleString("en-IN")} · ${r.receipt_date ?? ""}${r.reference ? ` · ${r.reference}` : ""}`,
        }));
        break;
      }
      case "bank_document": {
        const rows = await searchTable(
          "bank_accounts",
          ["name", "bank_name", "account_no"],
          n,
          "id, name, bank_name, account_no",
        );
        hits = rows.map((r) => ({
          id: r.id,
          title: r.name ?? r.bank_name,
          subtitle: `Bank A/C${r.account_no ? ` ····${String(r.account_no).slice(-4)}` : ""}`,
        }));
        break;
      }
      case "plain":
        return { ok: true, hits: [] };
    }
    return { ok: true, hits };
  } catch (e: any) {
    console.error("[action:searchLinkTargets]", e?.message);
    return { ok: false, error: e?.message ?? "Search failed." };
  }
}

// ---------------------------------------------------------------------
// Option pickers for the inline create forms.
// ---------------------------------------------------------------------

export interface PickerOption {
  id: string;
  label: string;
  sub?: string | null;
}

async function pick(table: string, columns: string[], query: string, select: string,
                    render: (row: any) => PickerOption): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }> {
  try {
    const supabase = createClient();
    let q = (supabase as any).from(table).select(select).limit(10);
    const term = query.trim();
    if (term.length >= 1) {
      const n = likeNeedle(term);
      q = q.or(columns.map((c) => `${c}.ilike.${n}`).join(","));
    }
    const res = await q;
    return { ok: true, options: (res.data ?? []).map(render) };
  } catch (e: any) {
    console.error(`[action:pick:${table}]`, e?.message);
    return { ok: false, error: e?.message ?? "Lookup failed." };
  }
}

export async function pickSuppliers(query: string) {
  return pick("suppliers", ["code", "name"], query, "id, code, name",
    (r) => ({ id: r.id, label: r.name ?? r.code, sub: r.code }));
}

export async function pickCustomerStores(query: string) {
  return pick("customer_stores", ["code", "name"], query, "id, code, name, customer:customers(name)",
    (r) => ({ id: r.id, label: r.name ?? r.code, sub: r.customer?.name ?? r.code }));
}

export async function pickItems(query: string) {
  return pick("items", ["sku", "name"], query, "id, sku, name",
    (r) => ({ id: r.id, label: r.name ?? r.sku, sub: r.sku }));
}

export async function pickExpenseAccounts() {
  return pick("chart_of_accounts", [], "", "code, name",
    (r) => ({ id: r.code, label: `${r.code} · ${r.name}` }));
}

export async function pickPaymentMethods() {
  return pick("payment_methods", [], "", "id, name",
    (r) => ({ id: r.id, label: r.name }));
}
```

Note on `pickExpenseAccounts`/`pickPaymentMethods`: they pass an empty columns array, so no `.or()` filter is applied (the join of zero strings would be invalid) — the guard `term.length >= 1` never fires because query is `""`.

- [ ] **Step 2: Sanity-check the empty-filter path**

Before moving on, confirm `pickExpenseAccounts` handles the empty-columns case: re-read the `pick()` helper and verify that when `columns.length === 0` and `query === ""` the builder produces a plain `select().limit()` with no `.or()` chain. If your implementation accidentally calls `.or("")` (PostgREST 400), fix the guard so `.or()` is only chained when the joined string is non-empty:

```ts
const orExpr = columns.map((c) => `${c}.ilike.${n}`).join(",");
if (orExpr) q = q.or(orExpr);
```

Run: `npm run typecheck`
Expected: baseline, no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/quick-attach.ts
git commit -m "feat(quick-attach): link-target search + option picker server actions"
```

---

### Task 3: QuickAttachProvider — drag detection, overlay, staged files

**Files:**
- Create: `app/src/components/shell/QuickAttachProvider.tsx`
- Modify: `app/src/components/shell/AppShell.tsx`

**Interfaces:**
- Consumes: `isAllowedFile`/`MAX_FILE_BYTES` from `@/lib/documents-limits` (Task 1); `AppClaims`, `can` from `@/lib/auth/claims`; `useToast` from `@/components/ui/Toast`.
- Produces (context consumed by Tasks 4–6):

```ts
interface QuickAttachContextValue {
  openPicker(): void;                       // ＋ button / programmatic
  openWithFiles(files: File[]): void;       // drop handler
}
const QuickAttachContext = React.createContext<QuickAttachContextValue | null>(null);
export function useQuickAttach(): QuickAttachContextValue;   // throws when missing
```

Props: `<QuickAttachProvider claims={AppClaims}>{children}</QuickAttachProvider>` — mounts `QuickAttachDialog` (Task 4) when the stage queue is non-empty.

**Design notes:**
- Window-level `dragenter/dragover/dragleave/drop` with a counter (child enter/leave fire both events). Only react when `e.dataTransfer.types.includes("Files")`. Overlay shows on drag-active; drop collects `e.dataTransfer.files`.
- The overlay must cover the whole viewport (fixed inset-0, above topbar/sidebar z-indexes — use `z-[100]`).
- Staging validation happens immediately: rejected files are kept in the queue but flagged (dialog shows reason, cannot be saved). Dropping a folder yields no `File` items in most browsers — nothing to handle specially.
- `ToastProvider` currently wraps only `{children}` inside `<main>` (AppShell.tsx:74); the overlay spans the whole grid, so hoist `ToastProvider` to wrap the entire grid so `useToast` works inside the provider/dialog.

- [ ] **Step 1: Write the provider**

Create `app/src/components/shell/QuickAttachProvider.tsx`:

```tsx
"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import { fileRejectionReason } from "@/lib/documents-limits";
import { QuickAttachDialog } from "./QuickAttachDialog";

// ---------------------------------------------------------------------
// QuickAttachProvider — window-level "drop a file anywhere" plumbing.
//
// Owns: global drag detection (counter-based, Files-only), the full-
// screen drop overlay, the hidden multi-file picker behind the topbar ＋,
// and the staged-file queue handed to QuickAttachDialog. Purely client
// state — nothing uploads until the dialog's save step runs.
// ---------------------------------------------------------------------

interface QuickAttachContextValue {
  openPicker: () => void;
  openWithFiles: (files: File[]) => void;
}

const QuickAttachContext = createContext<QuickAttachContextValue | null>(null);

export function useQuickAttach(): QuickAttachContextValue {
  const ctx = useContext(QuickAttachContext);
  if (!ctx) throw new Error("useQuickAttach must be used inside <QuickAttachProvider>");
  return ctx;
}

export interface StagedFile {
  file: File;
  rejection: string | null;
  title: string;
  tags: string;
  visibility: "internal" | "restricted";
}

export function QuickAttachProvider({ claims, children }: { claims: AppClaims; children: ReactNode }) {
  const [dragDepth, setDragDepth] = useState(0);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Claims are held for the dialog's tile filtering (Task 4 consumes via prop drilling).
  const claimsRef = useRef(claims);
  claimsRef.current = claims;

  const openWithFiles = useCallback((files: File[]) => {
    const usable = Array.from(files).filter((f) => f.size > 0 || f.type);
    if (usable.length === 0) return;
    setStaged(
      usable.map((file) => ({
        file,
        rejection: fileRejectionReason(file),
        title: file.name.replace(/\.[^.]+$/, ""),
        tags: "",
        visibility: "internal" as const,
      })),
    );
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => { if (!hasFiles(e)) return; depth += 1; setDragDepth(depth); };
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onLeave = () => { depth = Math.max(0, depth - 1); setDragDepth(depth); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragDepth(0);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) openWithFiles(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openWithFiles]);

  const ctx = useMemo(() => ({ openPicker, openWithFiles }), [openPicker, openWithFiles]);

  return (
    <QuickAttachContext.Provider value={ctx}>
      {children}

      {/* Hidden multi-file picker behind the topbar ＋ */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) openWithFiles(files);
          e.target.value = "";
        }}
      />

      {/* Full-screen drop overlay */}
      {dragDepth > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-brand/10 backdrop-blur-[2px]">
          <div className="rounded-xl border-2 border-dashed border-brand bg-surface px-8 py-6 shadow-pop">
            <p className="text-[15px] font-bold text-ink">Drop to attach</p>
            <p className="mt-1 text-[12px] text-ink-3">
              PDF, images or Office files · up to 10 MB each
            </p>
          </div>
        </div>
      )}

      {staged.length > 0 && (
        <QuickAttachDialog claims={claims} staged={staged} onClose={() => setStaged([])} />
      )}
    </QuickAttachContext.Provider>
  );
}
```

- [ ] **Step 2: Create a temporary dialog stub so the tree compiles**

The real dialog lands in Task 4. For this task's commit to compile, create `app/src/components/shell/QuickAttachDialog.tsx` as a minimal placeholder that will be **fully replaced** in Task 4 (do not ship features in it yet):

```tsx
"use client";

import type { AppClaims } from "@/lib/auth/claims";
import type { StagedFile } from "./QuickAttachProvider";

// Placeholder — replaced wholesale by Task 4 (stage → type → decide machine).
export function QuickAttachDialog({ staged, onClose }: { claims: AppClaims; staged: StagedFile[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/40" onClick={onClose}>
      <div className="rounded-lg border border-line bg-surface p-4 text-[13px] text-ink">
        {staged.length} file(s) staged — dialog pending
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in AppShell**

Modify `app/src/components/shell/AppShell.tsx`:

1. Add imports:

```tsx
import { ToastProvider } from "@/components/ui";
import { QuickAttachProvider } from "./QuickAttachProvider";
```

(`ToastProvider` import already exists at line 10 — keep it, just relocate usage.)

2. Restructure the return so `ToastProvider` wraps the whole grid and `QuickAttachProvider` sits inside it:

```tsx
return (
  <ToastProvider>
    <QuickAttachProvider claims={claims}>
      <div
        className="grid h-[100dvh] overflow-hidden bg-bg"
        style={{
          gridTemplateColumns: "240px 1fr",
          gridTemplateRows: "60px minmax(0, 1fr) 28px",
        }}
      >
        {/* ...existing children unchanged: TokenVersionWatcher, Topbar cell,
            Sidebar aside, main (now WITHOUT its own ToastProvider wrapper),
            StatusBar cell... */}
      </div>
    </QuickAttachProvider>
  </ToastProvider>
);
```

Specifically: line 74 `<ToastProvider>{children}</ToastProvider>` becomes just `{children}`; the providers go around the outermost div as shown. Keep the grid styles and all cells byte-identical otherwise.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` — baseline.
Run: `npm run dev`, sign in, drag a `.txt` over any page → overlay appears; dropping it opens the stub dialog showing "1 file(s) staged"; pressing Esc/clicking backdrop closes. Dragging selected text does **not** trigger the overlay.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/QuickAttachProvider.tsx src/components/shell/QuickAttachDialog.tsx src/components/shell/AppShell.tsx
git commit -m "feat(quick-attach): global drop overlay + staged-file provider"
```

---

### Task 4: QuickAttachDialog — step machine (stage → type tiles)

**Files:**
- Rewrite: `app/src/components/shell/QuickAttachDialog.tsx` (replace Task 3 stub entirely)

**Interfaces:**
- Consumes: `StagedFile`, from `./QuickAttachProvider`; `can(claims, perm)` from `@/lib/auth/claims`; UI kit `Dialog`, `Button`, `Input`, `Select`, `Badge`, `useToast`.
- Produces: the dialog shell + decision state consumed by Task 5's link/create panels:

```ts
type Decision =
  | { kind: "link"; typeKey: QuickTypeKey; targetId: string; targetLabel: string }
  | { kind: "create"; typeKey: QuickTypeKey }
  | { kind: "plain"; typeKey: "plain" };
```

The dialog owns: `activeIdx` (which staged file is being decided), `applyAll` toggle, per-file `decisions: Record<number, Decision>`, and passes `claims` down. Task 5 replaces the `DecidePanel` placeholder inside this file's structure.

**Registry:** create `app/src/lib/quick-attach/registry.ts` in this task (types + perms + labels only; Task 5 adds the panels):

- [ ] **Step 1: Create the registry**

Create `app/src/lib/quick-attach/registry.ts`:

```ts
// =====================================================================
// lib/quick-attach/registry.ts — the single source of truth for the
// "what is this file?" tile grid: keys, labels, glyphs, gating perms,
// and which decision modes each type supports. Client-safe (no server
// imports) — the tiles only FILTER the UI; every write is re-gated
// server-side by the modules' own RPCs.
// =====================================================================

import type { QuickTypeKey } from "@/lib/actions/quick-attach";

export interface QuickType {
  key: QuickTypeKey;
  label: string;
  glyph: string;              // short badge text, mirrors fileGlyph style
  /** Claim permission that gates the tile; null = any authenticated user. */
  perm: string | null;
  canLink: boolean;           // offers "Link to existing"
  canCreate: boolean;         // offers "Create new"
  hint: string;               // one-line description under the label
}

export const QUICK_TYPES: QuickType[] = [
  { key: "expense",           label: "Expense",           glyph: "EXP", perm: "expense.manage",                  canLink: true,  canCreate: true,  hint: "Petty cash / direct expense with this receipt attached" },
  { key: "supplier_bill",     label: "Supplier Bill",     glyph: "BILL", perm: "purchase.record_bill",           canLink: true,  canCreate: true,  hint: "Book an AP bill and keep the scan with it" },
  { key: "purchase_grn",      label: "Purchase / GRN",    glyph: "GRN", perm: "purchase.create",                 canLink: true,  canCreate: true,  hint: "Goods received note or its purchase order" },
  { key: "supplier_payment",  label: "Supplier Payment",  glyph: "PAY", perm: "purchase.pay",                    canLink: true,  canCreate: true,  hint: "Money out to a supplier — cheque/UPI proof" },
  { key: "customer_receipt",  label: "Customer Receipt",  glyph: "RCPT", perm: "receipt.record",                 canLink: true,  canCreate: true,  hint: "Collection from a customer store" },
  { key: "bank_document",     label: "Bank Document",     glyph: "BANK", perm: "bank.reconcile",                 canLink: true,  canCreate: false, hint: "Statement / cheque scan filed on a bank account" },
  { key: "plain",             label: "Plain Document",    glyph: "DOC", perm: null,                              canLink: false, canCreate: false, hint: "Just file it in the vault — no record linked" },
];

/** Tiles visible for these claims (UX only — server re-checks everything). */
export function visibleTypes(perms: { can: (p: string) => boolean }): QuickType[] {
  return QUICK_TYPES.filter((t) => t.perm === null || perms.can(t.perm));
}

/** bank.cheque holders may also see the bank tile even without bank.reconcile. */
export function visibleTypesForClaims(canFn: (perm: string) => boolean): QuickType[] {
  return QUICK_TYPES.filter(
    (t) =>
      t.perm === null ||
      canFn(t.perm) ||
      (t.key === "bank_document" && canFn("bank.cheque")),
  );
}
```

(Drop the unused first `visibleTypes` if you prefer — keep exactly one exported selector: `visibleTypesForClaims`. Delete the other to avoid dead code.)

- [ ] **Step 2: Write the dialog**

Rewrite `app/src/components/shell/QuickAttachDialog.tsx` completely:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import { can } from "@/lib/auth/claims";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { StagedFile } from "./QuickAttachProvider";
import { visibleTypesForClaims, type QuickType } from "@/lib/quick-attach/registry";
import type { QuickTypeKey } from "@/lib/actions/quick-attach";
import { LinkPanel } from "./panels/LinkPanel";
import { CreatePanel } from "./panels/CreatePanel";

// ---------------------------------------------------------------------
// QuickAttachDialog — the "what is this file?" step machine.
//
//   stage → per-file chips (rejects flagged, unsavable)
//   type  → permission-filtered tiles; multi-file shows "apply to all"
//   decide→ Link (search + pick) | Create (module form) | plain (no-op)
//
// Nothing uploads from here directly: Task 6 wires the save engine that
// runs module creates then uploadDocument() per file.
// ---------------------------------------------------------------------

export type Decision =
  | { kind: "link"; typeKey: QuickTypeKey; targetId: string; targetLabel: string }
  | { kind: "create"; typeKey: QuickTypeKey }
  | { kind: "plain"; typeKey: "plain" };

export function QuickAttachDialog({
  claims,
  staged,
  onClose,
}: {
  claims: AppClaims;
  staged: StagedFile[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [activeIdx, setActiveIdx] = useState(0);
  const [step, setStep] = useState<"type" | "decide">("type");
  const [chosenType, setChosenType] = useState<QuickType | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [confirmCancel, setConfirmCancel] = useState(false);

  const types = useMemo(() => visibleTypesForClaims((p) => can(claims, p)), [claims]);
  const active = staged[activeIdx];
  const doneCount = Object.keys(decisions).length;
  const allDecided = doneCount === staged.length;

  function chooseType(t: QuickType) {
    setChosenType(t);
    if (t.key === "plain") {
      // Plain documents skip the decide step entirely.
      record({ kind: "plain", typeKey: "plain" });
      advance();
      return;
    }
    setStep("decide");
  }

  function record(d: Decision) {
    setDecisions((prev) => ({ ...prev, [activeIdx]: d }));
  }

  function applyToRemaining(d: Decision) {
    setDecisions((prev) => {
      const next = { ...prev };
      for (let i = 0; i < staged.length; i++) if (!next[i]) next[i] = d;
      return next;
    });
    setActiveIdx(staged.length - 1);
  }

  function advance() {
    const nextUndecided = staged.findIndex((_, i) => !decisions[i] && i !== activeIdx);
    if (nextUndecided >= 0) {
      setActiveIdx(nextUndecided);
      setChosenType(null);
      setStep("type");
    } else {
      setActiveIdx(staged.length); // review position
    }
  }

  function finish() {
    // Task 6 replaces this with the real save engine.
    toast.success("Save engine lands in the next task");
    onClose();
  }

  const reviewing = activeIdx >= staged.length;

  return (
    <>
      <Dialog open onClose={() => setConfirmCancel(true)} title="Attach files" size="lg">
        <div className="flex flex-col gap-4">
          {/* Stage chips */}
          <div className="flex flex-wrap gap-2">
            {staged.map((s, i) => (
              <button
                key={`${s.file.name}-${i}`}
                type="button"
                onClick={() => { setActiveIdx(i); setChosenType(null); setStep("type"); }}
                className={`max-w-[240px] rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  i === activeIdx ? "border-brand bg-fill" : "border-line bg-white hover:border-line-strong"
                }`}
              >
                <span className="block truncate text-[12px] font-semibold text-ink">{s.file.name}</span>
                <span className="block text-[10px] text-ink-4">
                  {(s.file.size / 1024).toFixed(0)} KB
                  {decisions[i] ? " · decided" : s.rejection ? " · rejected" : ""}
                </span>
              </button>
            ))}
          </div>

          {/* Active file body */}
          {active && active.rejection && (
            <div className="rounded-lg border border-line bg-red-wash px-3 py-2 text-[12px] font-medium text-red">
              {active.rejection}
            </div>
          )}

          {!reviewing && active && !active.rejection && step === "type" && (
            <div>
              <p className="text-[13px] font-semibold text-ink">What is “{active.title}”?</p>
              {staged.length > 1 && (
                <label className="mt-2 flex w-fit items-center gap-2 text-[12px] text-ink-2">
                  <input type="checkbox" className="accent-[var(--brand)]" disabled />
                  Apply the same choice to all files
                </label>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {types.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => chooseType(t)}
                    className="flex items-start gap-2.5 rounded-lg border border-line bg-white p-3 text-left transition-colors hover:border-brand"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fill text-[10px] font-bold text-ink-3">
                      {t.glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{t.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">{t.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!reviewing && active && !active.rejection && step === "decide" && chosenType && (
            <div>
              <div className="flex items-center gap-2">
                <Badge size="sm" tone="blu">{chosenType.label}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setStep("type")}>← change type</Button>
              </div>
              <DecidePanel
                typeKey={chosenType.key}
                canLink={chosenType.canLink}
                canCreate={chosenType.canCreate}
                onLinked={(targetId, targetLabel) => {
                  const d: Decision = { kind: "link", typeKey: chosenType.key, targetId, targetLabel };
                  record(d);
                  advance();
                }}
                onCreate={() => {
                  record({ kind: "create", typeKey: chosenType.key });
                  advance();
                }}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[11px] text-ink-4">{doneCount}/{staged.length} decided</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel</Button>
              <Button variant="primary" disabled={!allDecided} onClick={finish}>Attach</Button>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={onClose}
        title="Discard these files?"
        description="Nothing has been uploaded yet."
        confirmLabel="Discard"
        danger
      />
    </>
  );
}

// DecidePanel — link/create choice. Task 5 fills the panels; until then the
// buttons render but the panels show their landing states.
function DecidePanel({
  typeKey, canLink, canCreate, onLinked, onCreate,
}: {
  typeKey: QuickTypeKey;
  canLink: boolean;
  canCreate: boolean;
  onLinked: (targetId: string, targetLabel: string) => void;
  onCreate: () => void;
}) {
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  if (!canLink && !canCreate) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2">
        {canLink && (
          <Button variant={mode === "link" ? "primary" : "secondary"} size="sm" onClick={() => setMode("link")}>
            Link to existing
          </Button>
        )}
        {canCreate && (
          <Button variant={mode === "create" ? "primary" : "secondary"} size="sm" onClick={() => setMode("create")}>
            Create new
          </Button>
        )}
      </div>
      {mode === "link" && <LinkPanel typeKey={typeKey} onPicked={onLinked} />}
      {mode === "create" && <CreatePanel typeKey={typeKey} onCreated={(_, __) => { onCreate(); }} />}
    </div>
  );
}
```

- [ ] **Step 3: Panel stubs so this compiles**

Create `app/src/components/shell/panels/LinkPanel.tsx`:

```tsx
"use client";

import type { QuickTypeKey } from "@/lib/actions/quick-attach";

// Stub — replaced in Task 5 with the search-and-pick implementation.
export function LinkPanel({ typeKey, onPicked }: {
  typeKey: QuickTypeKey;
  onPicked: (targetId: string, targetLabel: string) => void;
}) {
  return <p className="text-[12px] text-ink-4">Link panel for {typeKey} — Task 5.</p>;
}
```

Create `app/src/components/shell/panels/CreatePanel.tsx`:

```tsx
"use client";

import type { QuickTypeKey } from "@/lib/actions/quick-attach";

// Stub — replaced in Task 5 with per-type create forms.
export function CreatePanel({ typeKey, onCreated }: {
  typeKey: QuickTypeKey;
  onCreated: (entityType: string, entityId: string) => void;
}) {
  return <p className="text-[12px] text-ink-4">Create panel for {typeKey} — Task 5.</p>;
}
```

- [ ] **Step 4: Wire apply-to-all properly**

The checkbox rendered in Step 2 is `disabled` as scaffolding. Replace it with a real toggle: add `const [applyAll, setApplyAll] = useState(false);` near the other state; bind the checkbox `checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)}`; and in `chooseType`, when `applyAll` is set and `staged.length > 1`, behave like `plain` does — record the decision for all undecided files:

- for `plain`: `applyToRemaining({ kind: "plain", typeKey: "plain" })` instead of `record(...)` + `advance()`;
- for other types: remember the chosen type, and once the user completes link/create for THIS file, apply that same decision to the rest. Implement by storing the pending decision and calling `applyToRemaining(d)` right after `record(d)` inside `onLinked`/`onCreate` handlers when `applyAll` is true:

```tsx
const commit = (d: Decision) => {
  record(d);
  if (applyAll) applyToRemaining(d); else advance();
};
```

and route both `onLinked={(id, label) => commit({ kind: "link", typeKey: chosenType.key, targetId: id, targetLabel: label })}` and `onCreate={() => commit({ kind: "create", typeKey: chosenType.key })}` through it.

- [ ] **Step 5: Verify**

Run: `npm run typecheck` — baseline.
Manual: drop 2 valid PDFs → chips render; click chip 2 then chip 1 (active switches); pick Expense tile → decide step shows Link/Create tabs (stub panels); pick Plain Document → decision recorded instantly; cancel asks confirmation. Sign in as a user WITHOUT `expense.manage` → the Expense tile is absent.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quick-attach/registry.ts src/components/shell/QuickAttachDialog.tsx src/components/shell/panels/
git commit -m "feat(quick-attach): dialog step machine with permission-filtered type tiles"
```

---

### Task 5: Link search + create forms (real panels)

**Files:**
- Rewrite: `app/src/components/shell/panels/LinkPanel.tsx`
- Rewrite: `app/src/components/shell/panels/CreatePanel.tsx`
- Create: `app/src/components/shell/panels/MiniPicker.tsx`
- Create: `app/src/components/shell/panels/forms/ExpenseForm.tsx`
- Create: `app/src/components/shell/panels/forms/SupplierBillForm.tsx`
- Create: `app/src/components/shell/panels/forms/GrnForm.tsx`
- Create: `app/src/components/shell/panels/forms/SupplierPaymentForm.tsx`
- Create: `app/src/components/shell/panels/forms/CustomerReceiptForm.tsx`
- Modify: `app/src/components/shell/QuickAttachDialog.tsx` (pass `onCreated(entityType, entityId)` correctly)

**Interfaces:**
- Consumes: `searchLinkTargets`, `pickSuppliers`, `pickCustomerStores`, `pickItems`, `pickExpenseAccounts`, `pickPaymentMethods` (Task 2); `recordExpense` from `@/lib/actions/expenses`; `postSupplierBill`, `postGrn`, `paySupplier` from `@/lib/actions/purchases`; `recordReceipt` from `@/lib/actions/collections`.
- Produces: working `LinkPanel({typeKey, onPicked})` and `CreatePanel({typeKey, onCreated})` where `onCreated(entityType, entityId)` gives the binding Task 6's save engine stores alongside the file (`entityType` ∈ the `ENTITY_LABEL_LOOKUPS` keys: `expense`, `supplier_bill`, `purchase_receipt`, `supplier_payment`, `customer_receipt`).

**Before writing the forms**, read two things and mirror them exactly:
1. `app/src/lib/data/expenses.ts` — the exported `ExpenseCategory` / `ExpenseSource` types and any exported category lists (reuse them verbatim; do NOT hardcode new lists).
2. `app/src/app/(app)/expenses/*` and `/purchasing/*` pages — how they populate account/method selects, so the mini-forms match real field semantics (e.g. expense `source` default `petty_cash` vs `user_holding` requiring a user).

- [ ] **Step 1: MiniPicker combobox**

Create `app/src/components/shell/panels/MiniPicker.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { PickerOption } from "@/lib/actions/quick-attach";

// MiniPicker — tiny async combobox for the quick-attach forms. Loads
// options via a server action as the user types; picks one; clears on
// ✕. Deliberately minimal: no keyboard nav beyond Escape-close (forms
// are short; power users have the full module pages).
export function MiniPicker({
  label, load, value, onSelect, placeholder,
}: {
  label: string;
  load: (q: string) => Promise<{ ok: boolean; options?: PickerOption[]; error?: string }>;
  value: PickerOption | null;
  onSelect: (o: PickerOption | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<PickerOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const res = await load(q);
      if (alive) { setOpts(res.options ?? []); setBusy(false); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-4">{label}</span>
      {value ? (
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-white px-2.5">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">
            {value.label}{value.sub ? <span className="text-ink-4"> · {value.sub}</span> : null}
          </span>
          <button type="button" onClick={() => onSelect(null)} className="text-[12px] text-ink-4 hover:text-red">✕</button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            placeholder={placeholder ?? "Search…"}
            className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand"
          />
          {open && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface shadow-pop">
              {busy && <div className="px-3 py-2 text-[12px] text-ink-4">Searching…</div>}
              {!busy && opts.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-4">No matches.</div>}
              {opts.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onSelect(o); setOpen(false); setQ(""); }}
                  className="block w-full px-3 py-2 text-left hover:bg-fill"
                >
                  <span className="block truncate text-[13px] font-medium text-ink">{o.label}</span>
                  {o.sub && <span className="block truncate text-[11px] text-ink-4">{o.sub}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: LinkPanel — real search**

Rewrite `app/src/components/shell/panels/LinkPanel.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { searchLinkTargets, type LinkHit, type QuickTypeKey } from "@/lib/actions/quick-attach";

// LinkPanel — "Link to existing": debounced search by the type's natural
// key (bill no, receipt no, party…), tap a hit to bind the file to it.
export function LinkPanel({ typeKey, onPicked }: {
  typeKey: QuickTypeKey;
  onPicked: (targetId: string, targetLabel: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LinkHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (typeKey === "plain") return;
    if (q.trim().length < 2) { setHits([]); setError(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      startTransition(async () => {
        const res = await searchLinkTargets(typeKey, q);
        if (!alive) return;
        if (res.ok) { setHits(res.hits); setError(null); }
        else setError(res.error);
      });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, typeKey]);

  if (typeKey === "plain") return null;

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by number, reference or name…"
        className="h-9 text-[13px]"
      />
      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      {hits.length > 0 && (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPicked(h.id, h.title)}
                className="block w-full px-3 py-2 text-left transition-colors hover:bg-fill"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[13px] font-semibold text-ink">{h.title}</span>
                  {pending && <Badge size="sm">…</Badge>}
                </span>
                {h.subtitle && <span className="block truncate text-[11px] text-ink-4">{h.subtitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !pending && hits.length === 0 && !error && (
        <p className="text-[12px] text-ink-4">No matches — try another number/name, or switch to “Create new”.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: The five create forms**

Shared shape — each form is a client component with compact fields, calls its module action, and on success calls `props.onCreated(entityType, entityId)`. Common styling: `flex flex-col gap-3`, `Field`-wrapped inputs sized like LinkPanel's. Error handling identical everywhere:

```tsx
if (res.ok) onCreated("<entity_type>", res.<idField>);
else setError(res.error ?? "Could not save.");
```

**`forms/ExpenseForm.tsx`** — entity_type `"expense"`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { recordExpense } from "@/lib/actions/expenses";
import { pickExpenseAccounts } from "@/lib/actions/quick-attach";
import type { ExpenseCategory, ExpenseSource } from "@/lib/data/expenses";

// Minimal expense capture for quick-attach: date, category, account,
// source, amount, note. Mirrors the /expenses form semantics; approval
// stays a separate act on the register page.
export function ExpenseForm({ onCreated }: { onCreated: (entityType: string, entityId: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: "" as ExpenseCategory | "",
    account_code: "",
    source: "petty_cash" as ExpenseSource,
    amount: "",
    note: "",
  });

  function loadAccounts() {
    if (accounts.length) return;
    startTransition(async () => {
      const res = await pickExpenseAccounts();
      if (res.ok && res.options) setAccounts(res.options.map((o) => ({ id: o.id, label: o.label })));
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordExpense({
        expense_date: form.expense_date,
        category: form.category as ExpenseCategory,
        account_code: form.account_code,
        source: form.source,
        amount: Number(form.amount),
        note: form.note.trim() || undefined,
      });
      if (res.ok) onCreated("expense", res.expenseId);
      else setError(res.error ?? "Could not save the expense.");
    });
  }

  return (
    <div className="flex flex-col gap-3" onMouseDownCapture={loadAccounts}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
        <Field label="Amount"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
            {/* Populate from the EXPENSE_CATEGORIES-style constant you verified
                in lib/data/expenses.ts — map each value to an <option>. */}
          </Select>
        </Field>
        <Field label="Account">
          <Select value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })}>
            <option value="">Pick account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Paid from">
        <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as ExpenseSource })}>
          {/* Same rule: options from the verified source list in
              lib/data/expenses.ts (petty_cash / user_holding / …). */}
        </Select>
      </Field>
      <Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What was this for?" /></Field>
      {error && <p className="text-[11px] font-medium text-red">{error}</p>}
      <Button variant="primary" onClick={submit} loading={pending}>Create expense</Button>
    </div>
  );
}
```

Implementer notes (binding): the two `{/* Populate … */}` markers mean "map the actual exported arrays/types from `lib/data/expenses.ts` into `<option>` elements" — read that file FIRST and replace the comment with the real `.map()`. If that file exports no array (only union types), derive options from the union literal list in this file and keep them adjacent to a comment citing the type they mirror.

**`forms/SupplierBillForm.tsx`** — entity_type `"supplier_bill"`; fields: MiniPicker supplier (`pickSuppliers`), bill date, supplier's bill no, one default line (description optional, qty=1, unit_cost, gst_rate optional) with an "+ line" repeater; calls:

```tsx
const res = await postSupplierBill({
  supplier_id,
  bill_date,
  supplier_bill_no: billNo.trim() || undefined,
  lines: lines.map((l) => ({
    description: l.description || undefined,
    qty: Number(l.qty) || 1,
    unit_cost: Number(l.unit_cost),
    ...(l.gst_rate ? { gst_rate: Number(l.gst_rate) } : {}),
  })),
});
if (res.ok) onCreated("supplier_bill", res.billId);
```

**`forms/GrnForm.tsx`** — entity_type `"purchase_receipt"`; fields: MiniPicker supplier, GRN date, one-or-more lines each with MiniPicker item (`pickItems`) + qty + unit_cost; calls `postGrn({ supplier_id, grn_date, lines })` → `onCreated("purchase_receipt", res.grnId)`. Require ≥1 line with item + qty > 0 (the action enforces this too).

**`forms/SupplierPaymentForm.tsx`** — entity_type `"supplier_payment"`; fields: MiniPicker supplier, amount, mode Select (`cash|upi|bank|cheque|card` — mirror the mode vocabulary used by the /purchasing/pay page you read in the pre-step), reference, payment date; calls:

```tsx
const res = await paySupplier({
  supplier_id, mode, amount: Number(amount),
  payment_date, reference: reference.trim() || undefined,
  allocations: [],   // unallocated = advance against the supplier
});
if (res.ok) onCreated("supplier_payment", res.paymentId);
```

**`forms/CustomerReceiptForm.tsx`** — entity_type `"customer_receipt"`; fields: MiniPicker customer-store (**one** picker using `pickCustomerStores` — but `recordReceipt` needs BOTH `customer_id` AND `store_id`; resolve by having `pickCustomerStores` return `sub` = customer name and extend the option payload: in Task 2's `pickCustomerStores`, ALSO return the raw row ids via extra fields `customerId` — adjust `PickerOption` to `{ id; label; sub?; customerId?: string }` and set `customerId: r.customer?.id ?? null`, selecting `customer:customers(id,name)`); amount, method MiniPicker (`pickPaymentMethods`), reference, date; calls `recordReceipt({ customer_id, store_id, method_id, amount, reference, receipt_date })` → `onCreated("customer_receipt", res.receiptId)`.

- [ ] **Step 4: Route forms through CreatePanel**

Rewrite `app/src/components/shell/panels/CreatePanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { QuickTypeKey } from "@/lib/actions/quick-attach";
import { Button } from "@/components/ui/Button";
import { ExpenseForm } from "./forms/ExpenseForm";
import { SupplierBillForm } from "./forms/SupplierBillForm";
import { GrnForm } from "./forms/GrnForm";
import { SupplierPaymentForm } from "./forms/SupplierPaymentForm";
import { CustomerReceiptForm } from "./forms/CustomerReceiptForm";

// CreatePanel — routes to the per-type quick create form. Bank documents
// are link-only; plain never reaches here.
export function CreatePanel({ typeKey, onCreated }: {
  typeKey: QuickTypeKey;
  onCreated: (entityType: string, entityId: string) => void;
}) {
  const [creating, setCreating] = useState(true);

  if (!creating) {
    return (
      <div className="py-2 text-[12px] text-ink-4">
        Record created — finishing attachment…
      </div>
    );
  }

  switch (typeKey) {
    case "expense": return <ExpenseForm onCreated={onCreated} />;
    case "supplier_bill": return <SupplierBillForm onCreated={onCreated} />;
    case "purchase_grn": return <GrnForm onCreated={onCreated} />;
    case "supplier_payment": return <SupplierPaymentForm onCreated={onCreated} />;
    case "customer_receipt": return <CustomerReceiptForm onCreated={onCreated} />;
    default:
      return (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-[12px] text-ink-4">This type links to existing records only.</p>
          <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>OK</Button>
        </div>
      );
  }
}
```

Fix the Task-4 `DecidePanel` wiring: its `onCreate` currently discards the entity reference. Change `DecidePanel`'s `onCreate` prop signature to `onCreate: (entityType: string, entityId: string) => void` and in `QuickAttachDialog` pass:

```tsx
onCreate={(entityType, entityId) => commit({ kind: "create", typeKey: chosenType.key, entityType, entityId })}
```

which requires widening the create variant of `Decision`:

```ts
| { kind: "create"; typeKey: QuickTypeKey; entityType: string; entityId: string }
```

Update `applyToRemaining` usages accordingly (the SAME created record should NOT be applied to other files — when `applyAll` is on and the user creates a record, apply the *type + mode* to the rest, not the entity: in `commit`, if `applyAll && d.kind === "create"`, store `{kind:"create", typeKey:d.typeKey, entityType:d.entityType, entityId:d.entityId}` ONLY for the active file, and for the remaining files store a "create same type" marker that re-opens the form per file. Simplest correct behavior: when applyAll is on and mode=create, turn applyAll OFF for create decisions and toast "Create applies per file". Implement exactly that.)

- [ ] **Step 5: Verify**

Run: `npm run typecheck` — baseline.
Manual (dry-run safe: all these creates post real records — test on staging/local DB):
1. Drop a receipt image → Expense → Create new → fill → Create expense → footer shows decided; Attach enabled.
2. Drop a bill PDF → Supplier Bill → Link to existing → search a known bill no → pick → Attach.
3. Drop a file → Customer Receipt → Link → search receipt no.
4. Bank tile as a `bank.cheque`-only user: tile visible, Create tab absent (link-only).

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/panels/ src/components/shell/QuickAttachDialog.tsx
git commit -m "feat(quick-attach): link search + inline create forms for five record types"
```

---

### Task 6: Save engine — create/link → uploadDocument per file

**Files:**
- Modify: `app/src/components/shell/QuickAttachDialog.tsx` (implement `finish()`)
- Modify: `app/src/lib/actions/documents.ts` (accept optional tags param passthrough — verify it already does; it does: `tagsRaw` line 46. No change unless gaps.)

**Interfaces:**
- Consumes: `uploadDocument(formData)` → `Promise<{ok:true,id}|{ok:false,errors:{message}[]}>` from `@/lib/actions/documents`; `Decision` incl. create bindings from Task 5.
- Produces: completed flow — nothing left for later tasks except the topbar entry point (Task 7).

**Semantics:**
- For each staged file (sequential, newest decision order irrelevant): build FormData with `file`, `title`, `tags`, `visibility`, and when decision is link → `entityType=<typeKey mapped>`, `entityId=<targetId>`; create → `entityType=<decision.entityType>`, `entityId=<decision.entityId>`; plain → neither.
- entity-type mapping for LINK decisions (registry key → documents `entity_type` string): `expense→expense`, `supplier_bill→supplier_bill`, `purchase_grn→purchase_receipt` when the picked id is a GRN or `purchase_order` when a PO — **the link hit must carry which table it came from**: extend `LinkHit` in Task 2's file with `entity: string` (set `"purchase_receipt"` vs `"purchase_order"` in the `purchase_grn` case; `"expense"`, `"supplier_bill"`, `"supplier_payment"`, `"customer_receipt"`, `"bank_account"` elsewhere), thread it through `onPicked(hit)` so the dialog stores `targetEntity`. (Adjust `Decision.link` to `{ targetEntity: string; targetId: string; targetLabel: string }`.)
- Per-file status map `saveState: Record<number,"queued"|"working"|"done"|"error">` + `saveError: Record<number,string>`; chips reflect it; failed files get a Retry button that re-runs only that file's upload.
- While saving: Cancel/Attach disabled; success toast `"Attached N file(s)"`; close only when no errors remain (errors keep the dialog open).

- [ ] **Step 1: Thread `entity` through link hits**

In `lib/actions/quick-attach.ts`: add `entity: string` to `LinkHit`; set per case as listed above. In `QuickAttachDialog`, `LinkPanel.onPicked` becomes `(hit: LinkHit) => void`; update the decide-panel callback to build `{ kind:"link", targetEntity: hit.entity, targetId: hit.id, targetLabel: hit.title }`.

- [ ] **Step 2: Implement the save loop**

In `QuickAttachDialog`, add:

```tsx
const [saving, setSaving] = useState(false);
const [saveState, setSaveState] = useState<Record<number, "queued"|"working"|"done"|"error">>({});
const [saveError, setSaveError] = useState<Record<number, string>>({});

async function saveOne(i: number): Promise<boolean> {
  const s = staged[i];
  const d = decisions[i];
  if (!s || !d || s.rejection) return false;
  setSaveState((p) => ({ ...p, [i]: "working" }));
  const fd = new FormData();
  fd.set("file", s.file);
  fd.set("title", s.title.trim());
  fd.set("tags", s.tags);
  fd.set("visibility", s.visibility);
  if (d.kind === "link") { fd.set("entityType", d.targetEntity); fd.set("entityId", d.targetId); }
  if (d.kind === "create") { fd.set("entityType", d.entityType); fd.set("entityId", d.entityId); }
  const res = await uploadDocument(fd);
  if (!res.ok) {
    setSaveState((p) => ({ ...p, [i]: "error" }));
    setSaveError((p) => ({ ...p, [i]: res.errors.map((e) => e.message).join(" ") }));
    return false;
  }
  setSaveState((p) => ({ ...p, [i]: "done" }));
  return true;
}

async function finish() {
  setSaving(true);
  let okCount = 0;
  for (let i = 0; i < staged.length; i++) {
    if (await saveOne(i)) okCount++;
  }
  setSaving(false);
  if (okCount === staged.length) {
    toast.success(`Attached ${okCount} file${okCount === 1 ? "" : "s"}`);
    onClose();
  } else {
    toast.error(`${staged.length - okCount} file(s) failed — retry below.`);
  }
}
```

Import `uploadDocument` from `@/lib/actions/documents`. Render per-chip status (`done ✓` / `error !` with the message + a small Retry button calling `saveOne(i)`). Disable Cancel/Attach while `saving`.

- [ ] **Step 3: Revalidation breadth**

`uploadDocument` already `revalidatePath("/documents")`. Module creates already revalidate their own registers (verified in their sources). No additional revalidations needed — do not add any.

- [ ] **Step 4: Verify end-to-end (local/staging DB)**

1. ₹500 receipt photo → Expense → Create new → amount 500 → Create expense → Attach → toast; `/documents` lists it bound to `expense · EXP-xxxx`; opening the expense detail page (once a `DocumentAttachPanel` exists there — else verify via `/documents` filters) shows the file.
2. Bill PDF → Supplier Bill → Link to existing → pick → saved row shows `supplier_bill · <bill_no>`.
3. Two files, apply-to-all OFF: decide each separately; one succeeds, force-fail the other temporarily by renaming a staged file to exceed 10 MB BEFORE deciding (staging reject path) → confirm mixed states render and Retry works.
4. Esc after cancel: zero new rows in `documents` (check via `/documents` count before/after).
5. Plain doc → appears in `/documents` unbound.

Run: `npm run typecheck` — baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/QuickAttachDialog.tsx src/lib/actions/quick-attach.ts src/components/shell/panels/
git commit -m "feat(quick-attach): save engine binding uploads to linked or created records"
```

---

### Task 7: Topbar ＋ button + final verification

**Files:**
- Modify: `app/src/components/shell/Topbar.tsx`

**Interfaces:**
- Consumes: `useQuickAttach()` from `./QuickAttachProvider` (context is available because `Topbar` renders inside `QuickAttachProvider` after Task 3's AppShell change).

- [ ] **Step 1: Add the button**

In `Topbar.tsx`, add import `import { useQuickAttach } from "./QuickAttachProvider";` and insert immediately **before** `{/* Notifications */}` (line ~64):

```tsx
{/* Quick attach — ＋ opens the drop-to-attach popup (manual file pick). */}
<button
  type="button"
  onClick={() => quick.openPicker()}
  aria-label="Attach a file"
  title="Attach a file"
  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-[16px] font-semibold leading-none text-ink transition-colors hover:border-brand hover:text-brand"
>
  +
</button>
```

with `const quick = useQuickAttach();` at the top of the `Topbar` component body. Placement: between `FySelector` and `NotificationsBell` (spec: left of notifications bell).

- [ ] **Step 2: Full verification**

Run: `npm run typecheck` — baseline (zero new errors).
Run: `npm run build` — green.

Full manual pass (local/staging):
1. ＋ click → file picker → pick 2 PDFs → popup opens with both staged.
2. Drag anywhere → overlay → drop works on `/invoices`, `/stock`, `/documents` alike.
3. Permission matrix: salesperson-role test user sees only Customer Receipt (+ plain); accountant sees Expense/Bank/etc.; admin sees all.
4. Full happy paths from Task 6 Step 4 once more through the ＋ entry.
5. Mobile viewport sanity: overlay + dialog usable; ＋ reachable (selectors `hidden sm:block` on Warehouse/FY must NOT hide the ＋ — it has no such class).
6. Non-file drag (select this paragraph's text and drag) → no overlay.

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/Topbar.tsx
git commit -m "feat(shell): topbar quick-attach button (left of notifications)"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** overlay+global drop (T3), ＋ placement (T7), 7 types w/ exact perm codes (T4 registry), link-by-search (T2/T5), full create forms in-popup for the 5 creatable types (T5), apply-to-all + per-file metadata (T4), editable title/tags/visibility (T4/T6 FormData), upload-at-save with orphan-safe reuse of `uploadDocument` (T6), OCR/touch/zip excluded (nothing implements them).
- **Type consistency:** `Decision` evolved across tasks — final shape is the Task 5/6 version (`link` carries `targetEntity/targetId/targetLabel`; `create` carries `entityType/entityId`). Implementers must apply Task 5 Step 4's widening and Task 6 Step 1's link-hit threading together.
- **Known risk flagged:** Task 5's expense category/source option lists MUST come from `lib/data/expenses.ts` exports — the plan deliberately forces reading that file first rather than guessing enum values.

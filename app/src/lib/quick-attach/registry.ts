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
  { key: "expense",          label: "Expense",          glyph: "EXP",  perm: "expense.manage",      canLink: true,  canCreate: true,  hint: "Petty cash / direct expense with this receipt attached" },
  { key: "supplier_bill",    label: "Supplier Bill",    glyph: "BILL", perm: "purchase.record_bill", canLink: true,  canCreate: true,  hint: "Book an AP bill and keep the scan with it" },
  { key: "purchase_grn",     label: "Purchase / GRN",   glyph: "GRN",  perm: "purchase.create",     canLink: true,  canCreate: true,  hint: "Goods received note or its purchase order" },
  { key: "supplier_payment", label: "Supplier Payment", glyph: "PAY",  perm: "purchase.pay",        canLink: true,  canCreate: true,  hint: "Money out to a supplier — cheque/UPI proof" },
  { key: "customer_receipt", label: "Customer Receipt", glyph: "RCPT", perm: "receipt.record",      canLink: true,  canCreate: true,  hint: "Collection from a customer store" },
  { key: "bank_document",    label: "Bank Document",    glyph: "BANK", perm: "bank.reconcile",      canLink: true,  canCreate: false, hint: "Statement / cheque scan filed on a bank account" },
  { key: "plain",            label: "Plain Document",   glyph: "DOC",  perm: null,                  canLink: false, canCreate: false, hint: "Just file it in the vault — no record linked" },
];

/** Tiles visible for these claims (UX only — server re-checks everything). */
/** bank.cheque holders may also see the bank tile even without bank.reconcile. */
export function visibleTypesForClaims(canFn: (perm: string) => boolean): QuickType[] {
  return QUICK_TYPES.filter(
    (t) =>
      t.perm === null ||
      canFn(t.perm) ||
      (t.key === "bank_document" && canFn("bank.cheque")),
  );
}

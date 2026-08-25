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
  if (res.error) throw res.error;
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
        ].slice(0, LIMIT);
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
  /** Parent-customer id for customer_stores options — recordReceipt needs
   *  BOTH customer_id and store_id, so the store option carries both raw ids. */
  customerId?: string | null;
}

async function pick(table: string, columns: string[], query: string, select: string,
                    render: (row: any) => PickerOption): Promise<{ ok: boolean; options?: PickerOption[]; error?: string }> {
  try {
    const supabase = createClient();
    let q = (supabase as any).from(table).select(select).limit(10);
    const term = query.trim();
    if (term.length >= 1) {
      const n = likeNeedle(term);
      const orExpr = columns.map((c) => `${c}.ilike.${n}`).join(",");
      if (orExpr) q = q.or(orExpr);
    }
    const res = await q;
    if (res.error) throw res.error;
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
  return pick("customer_stores", ["code", "name"], query,
    "id, code, name, customer:customers(id, name)",
    (r) => ({
      id: r.id,
      label: r.name ?? r.code,
      sub: r.customer?.name ?? r.code,
      customerId: r.customer?.id ?? null,
    }));
}

export async function pickItems(query: string) {
  return pick("items", ["sku", "name"], query, "id, sku, name",
    (r) => ({ id: r.id, label: r.name ?? r.sku, sub: r.sku }));
}

export async function pickExpenseAccounts(): Promise<{
  ok: boolean;
  options?: PickerOption[];
  error?: string;
}> {
  // Mirrors the canonical expense-entry picker (listExpenseAccounts in
  // lib/data/expenses.ts, used by /expenses/new): postable expense-type
  // ledger accounts only, active, ordered by code — so a payable/equity/
  // asset account can never be booked as an expense charge.
  try {
    const supabase = createClient();
    const res = await supabase
      .from("chart_of_accounts")
      .select("code, name")
      .eq("type", "expense")
      .eq("is_postable", true)
      .eq("status", "active")
      .order("code")
      .limit(50);
    if (res.error) throw res.error;
    return { ok: true, options: ((res.data ?? []) as { code: string; name: string }[])
      .map((r) => ({ id: r.code, label: `${r.code} · ${r.name}` })) };
  } catch (e: any) {
    console.error("[action:pick:chart_of_accounts]", e?.message);
    return { ok: false, error: e?.message ?? "Lookup failed." };
  }
}

export async function pickPaymentMethods() {
  return pick("payment_methods", [], "", "id, name",
    (r) => ({ id: r.id, label: r.name }));
}

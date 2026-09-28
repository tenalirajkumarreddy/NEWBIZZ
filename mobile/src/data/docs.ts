import { supabase } from "@/lib/supabase";
import type { DocKind } from "@/lib/qrparse";

export type { DocKind } from "@/lib/qrparse";

export interface DocMeta {
  no: string | null;
  date: string | null;
  /** grand_total for invoices, total units for challans, line-sum for orders, amount for credit notes */
  total: number | null;
  status: string | null;
  /** customer name (invoice/order/credit note) or store name (challan) */
  counterparty: string | null;
}

export interface ResolvedDoc {
  kind: DocKind;
  id: string;
  /** null = not visible under RLS (or genuinely nonexistent) — the UI shows
   * one neutral "not found" state for both, per the "what you can't see
   * doesn't exist" rule. */
  meta: DocMeta | null;
}

interface RawRow {
  invoice_no?: string | null;
  invoice_date?: string | null;
  challan_no?: string | null;
  printed_at?: string | null;
  order_no?: string | null;
  order_date?: string | null;
  credit_note_no?: string | null;
  created_at?: string | null;
  grand_total?: number | string | null;
  amount?: number | string | null;
  status?: string | null;
  customer?: { full_name?: string | null; name?: string | null } | null;
  store?: { name?: string | null } | null;
  order?: { store?: { name?: string | null } | null } | null;
  lines?: { qty: number | string }[] | null;
}

/** Web print/app view for a document (same env base as challanPdfUrl). */
export function documentWebUrl(kind: DocKind, id: string): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL ?? "https://newbizz-kappa.vercel.app";
  if (kind === "challan") return `${base}/print/challan/${id}`;
  if (kind === "invoice") return `${base}/invoices/${id}`;
  if (kind === "creditnote") return `${base}/print/credit-note/${id}`;
  return `${base}/orders/${id}`;
}

function mapMeta(
  r: RawRow | null,
  noKey: "invoice_no" | "challan_no" | "order_no" | "credit_note_no",
  dateKey: keyof RawRow,
): DocMeta | null {
  if (!r) return null;
  const rawTotal = r.grand_total ?? r.amount;
  return {
    no: r[noKey] ?? null,
    date: (r[dateKey] as string | null | undefined) ?? null,
    total: rawTotal != null ? Number(rawTotal) : null,
    status: r.status ?? null,
    counterparty: r.customer?.name ?? r.store?.name ?? r.order?.store?.name ?? null,
  };
}

function sumUnits(lines: { qty: number | string }[] | null | undefined): number {
  return (lines ?? []).reduce((s, l) => s + Number(l.qty ?? 0), 0);
}

/** Resolve a scanned document id. Each lookup is a plain RLS-scoped read —
 * what the scanner's user can't see resolves as not-found, never an error. */
export async function resolveDocument(kind: DocKind, id: string): Promise<ResolvedDoc> {
  if (kind === "invoice") {
    // customers.name is the display name (full_name lives on users/workers).
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_no, invoice_date, grand_total, status, customer:customers(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return { kind, id, meta: mapMeta(data as RawRow | null, "invoice_no", "invoice_date") };
  }

  if (kind === "challan") {
    // delivery_challans has no store_id — the counterparty store comes through
    // the challan's sales order (challan → order → store). Total units = the
    // sum of the challan line quantities (quantities only, never prices).
    const { data, error } = await supabase
      .from("delivery_challans")
      .select(
        "challan_no, printed_at, status, " +
          "order:sales_orders(store:customer_stores(name)), " +
          "lines:delivery_challan_lines(qty)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const row = data as RawRow | null;
    const meta = mapMeta(row, "challan_no", "printed_at");
    if (meta) {
      meta.total = sumUnits(row?.lines);
      // flatten the nested relation for mapMeta's counterparty fallback
      const storeName = row?.order?.store?.name ?? null;
      if (storeName) meta.counterparty = storeName;
    }
    return { kind, id, meta };
  }

  if (kind === "order") {
    // sales_orders carries no total column — derive from its line sums so the
    // card can show something meaningful without a per-line pricing fetch.
    const { data, error } = await supabase
      .from("sales_orders")
      .select(
        "order_no, order_date, status, customer:customers(name), " +
          "lines:sales_order_lines(qty, unit_price)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const row = data as (RawRow & { lines?: { qty: number | string; unit_price: number | string }[] | null }) | null;
    const meta = mapMeta(row, "order_no", "order_date");
    if (meta) meta.total = sumLineValue(row?.lines);
    return { kind, id, meta };
  }

  // creditnote
  const { data, error } = await supabase
    .from("credit_notes")
    .select("credit_note_no, created_at, amount, status, customer:customers(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return { kind, id, meta: mapMeta(data as RawRow | null, "credit_note_no", "created_at") };
}

function sumLineValue(lines: { qty: number | string; unit_price: number | string }[] | null | undefined): number {
  return (lines ?? []).reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unit_price ?? 0), 0);
}

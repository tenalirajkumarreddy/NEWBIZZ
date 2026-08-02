import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";

// =====================================================================
// lib/data/search.ts - global search across the core entities (F7).
//
// Cross-entity search: customers & stores, orders, invoices, receipts,
// items, suppliers, challans. Every lookup is an ILIKE on the display
// fields; each entity is limited to a handful of hits so a fuzzy query
// never floods the palette. Reads run through the authenticated client,
// so RLS keeps each user scoped to what their perms allow (a salesperson
// only ever sees entities their role can read).
// =====================================================================

export type SearchEntity =
  | "customer" | "store" | "order" | "invoice" | "receipt"
  | "item" | "supplier" | "challan";

export interface SearchHit {
  entity: SearchEntity;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const PER_ENTITY = 6;
const MAX_TOTAL = 40;

/** Escape % and _ so a literal query can't turn into a wildcard. */
function like(s: string): string {
  return `%${s.replace(/[%_]/g, "\\$&")}%`;
}

/** ILIKE helper that appends a safety limit. `select` lets a caller pull an
 *  embedded relation (e.g. `customer:customers(name)`) for richer subtitles. */
async function search(table: string, columns: string[], q: string, select = "*"): Promise<any[]> {
  const supabase = createClient();
  const likeCols = columns.map((c) => `${c}.ilike.${q}`);
  const res = await (supabase as any)
    .from(table)
    .select(select)
    .or(likeCols.join(","))
    .limit(PER_ENTITY);
  return unwrap(res, [] as any[], `search:${table}`);
}

export async function globalSearch(raw: string): Promise<SearchHit[]> {
  const term = raw.trim();
  if (term.length < 2) return [];

  const esc = like(term);
  const needle = esc; // escaped %term% for ILIKE values

  const [customers, stores, orders, invoices, receipts, items, suppliers, challans] = await Promise.all([
    search("customers", ["code", "name", "phone", "gstin"], needle),
    search("customer_stores", ["code", "name", "phone"], needle),
    search("sales_orders", ["order_no"], needle, "id, order_no, order_date, customer:customers(name)"),
    search("invoices", ["invoice_no"], needle, "id, invoice_no, invoice_date, customer:customers(name)"),
    search("customer_receipts", ["receipt_no", "reference"], needle),
    search("items", ["sku", "name", "hsn_code"], needle),
    search("suppliers", ["code", "name", "phone", "gstin"], needle),
    search("delivery_challans", ["challan_no"], needle),
  ]);

  const hits: SearchHit[] = [];

  for (const c of customers) {
    hits.push({
      entity: "customer",
      id: c.id,
      title: c.name ?? c.code,
      subtitle: `Customer · ${c.code}${c.phone ? ` · ${c.phone}` : ""}`,
      href: `/customers/${c.id}`,
    });
  }
  for (const s of stores) {
    hits.push({
      entity: "store",
      id: s.id,
      title: s.name ?? s.code,
      subtitle: `Store · ${s.code}${s.city ? ` · ${s.city}` : ""}`,
      href: `/crm/stores/${s.id}`,
    });
  }
  for (const o of orders) {
    hits.push({
      entity: "order",
      id: o.id,
      title: o.order_no,
      subtitle: `Order · ${o.order_date ?? ""} · ${o.customer?.name ?? ""}`,
      href: `/orders/${o.id}`,
    });
  }
  for (const v of invoices) {
    hits.push({
      entity: "invoice",
      id: v.id,
      title: v.invoice_no,
      subtitle: `Invoice · ${v.invoice_date ?? ""} · ${v.customer?.name ?? ""}`,
      href: `/invoices/${v.id}`,
    });
  }
  for (const r of receipts) {
    hits.push({
      entity: "receipt",
      id: r.id,
      title: r.receipt_no,
      subtitle: `Receipt · ${r.receipt_date ?? ""}${r.reference ? ` · ${r.reference}` : ""}`,
      href: `/receipts`,
    });
  }
  for (const i of items) {
    hits.push({
      entity: "item",
      id: i.id,
      title: i.name ?? i.sku,
      subtitle: `Item · ${i.sku ?? ""}${i.hsn_code ? ` · HSN ${i.hsn_code}` : ""}`,
      href: `/items/${i.id}`,
    });
  }
  for (const s of suppliers) {
    hits.push({
      entity: "supplier",
      id: s.id,
      title: s.name ?? s.code,
      subtitle: `Supplier · ${s.code}${s.phone ? ` · ${s.phone}` : ""}`,
      href: `/suppliers/${s.id}`,
    });
  }
  for (const ch of challans) {
    hits.push({
      entity: "challan",
      id: ch.id,
      title: ch.challan_no,
      subtitle: `Challan · ${ch.status ?? ""}`,
      href: `/challans/${ch.id}`,
    });
  }

  return hits.slice(0, MAX_TOTAL);
}

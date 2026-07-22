// =====================================================================
// lib/data/challans.ts — server-only readers for Delivery Challans (§4.4).
//
// A challan is the physical-fulfilment note over a sales order: it records
// which ordered units left, tracks transit (printed→in_transit→delivered),
// and — via set_challan_status/close_partial_order — rolls the order up to
// fulfilled / partially_fulfilled. It moves NO money and NO stock; the value
// event stays in post_invoice (Invariant 3). These are reads only; writes go
// through the SECURITY DEFINER RPCs in lib/actions/challans.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type ChallanStatus = Database["public"]["Enums"]["challan_status"];

// ---- list + detail shapes ----

export interface ChallanListRow {
  id: string;
  challan_no: string;
  status: ChallanStatus;
  orderId: string;
  orderNo: string | null;
  customerName: string | null;
  storeName: string | null;
  ewayBillNo: string | null;
  printedAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  /** Total units on this challan (Σ line qty). */
  totalQty: number;
  lineCount: number;
}

export interface ChallanLine {
  id: string;
  order_line_id: string;
  item_id: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  line_no: number;
}

export interface ChallanDetail {
  id: string;
  challan_no: string;
  status: ChallanStatus;
  orderId: string;
  orderNo: string | null;
  customerName: string | null;
  storeName: string | null;
  storeCode: string | null;
  agentName: string | null;
  ewayBillNo: string | null;
  notes: string | null;
  printedAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  lines: ChallanLine[];
  totalQty: number;
}

const CHALLAN_SELECT =
  "id, challan_no, status, order_id, eway_bill_no, notes, " +
  "printed_at, dispatched_at, delivered_at, " +
  "order:sales_orders(order_no, customer:customers(name), store:customer_stores(name, code)), " +
  "agent:users!delivery_challans_agent_id_fkey(full_name), " +
  "lines:delivery_challan_lines(id, order_line_id, item_id, qty, line_no, item:items(name, sku))";

type RawChallanLine = {
  id: string;
  order_line_id: string;
  item_id: string;
  qty: number;
  line_no: number;
  item: { name: string; sku: string } | null;
};

type RawChallan = Pick<
  Tables["delivery_challans"]["Row"],
  "id" | "challan_no" | "status" | "order_id" | "eway_bill_no" | "notes"
  | "printed_at" | "dispatched_at" | "delivered_at"
> & {
  order: {
    order_no: string;
    customer: { name: string } | null;
    store: { name: string; code: string } | null;
  } | null;
  agent: { full_name: string } | null;
  lines: RawChallanLine[] | null;
};

function totalOf(lines: RawChallanLine[] | null): number {
  if (!lines) return 0;
  return lines.reduce((s, l) => s + Number(l.qty), 0);
}

/** Recent challans, newest first. Optionally filter by transit status. */
export async function listChallans(opts: {
  status?: ChallanStatus;
  orderId?: string;
  limit?: number;
} = {}): Promise<ChallanListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("delivery_challans")
    .select(CHALLAN_SELECT)
    .order("printed_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.orderId) q = q.eq("order_id", opts.orderId);

  const rows = unwrap(await q.returns<RawChallan[]>(), [] as RawChallan[], "listChallans");
  return rows.map((r) => ({
    id: r.id,
    challan_no: r.challan_no,
    status: r.status,
    orderId: r.order_id,
    orderNo: r.order?.order_no ?? null,
    customerName: r.order?.customer?.name ?? null,
    storeName: r.order?.store?.name ?? null,
    ewayBillNo: r.eway_bill_no,
    printedAt: r.printed_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    totalQty: totalOf(r.lines),
    lineCount: r.lines?.length ?? 0,
  }));
}

/** One challan with its lines, or null if not found / not visible. */
export async function getChallan(id: string): Promise<ChallanDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("delivery_challans")
    .select(CHALLAN_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<RawChallan | null>();
  const r = unwrap(res, null as RawChallan | null, "getChallan");
  if (!r) return null;

  const lines: ChallanLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      order_line_id: l.order_line_id,
      item_id: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      line_no: l.line_no,
    }));

  return {
    id: r.id,
    challan_no: r.challan_no,
    status: r.status,
    orderId: r.order_id,
    orderNo: r.order?.order_no ?? null,
    customerName: r.order?.customer?.name ?? null,
    storeName: r.order?.store?.name ?? null,
    storeCode: r.order?.store?.code ?? null,
    agentName: r.agent?.full_name ?? null,
    ewayBillNo: r.eway_bill_no,
    notes: r.notes,
    printedAt: r.printed_at,
    dispatchedAt: r.dispatched_at,
    deliveredAt: r.delivered_at,
    lines,
    totalQty: totalOf(r.lines),
  };
}

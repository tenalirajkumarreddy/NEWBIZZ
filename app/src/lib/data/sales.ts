// =====================================================================
// lib/data/sales.ts — server-only readers for the Sell & Collect module.
//
// Reads only (Invariant 3): orders, invoices, receipts, and the master
// pickers the create forms need (stores, sellable items). Every money/stock
// change goes through a SECURITY DEFINER RPC via a Server Action, never here.
// RLS runs under the caller's JWT, so these only return rows the user may see.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

// ---- list-row shapes (with embedded names + lines for value roll-up) ----

export interface OrderListRow {
  id: string;
  order_no: string;
  order_date: string;
  status: OrderStatus;
  notes: string | null;
  storeName: string | null;
  storeCode: string | null;
  customerName: string | null;
  customerId: string | null;
  /** GST-exclusive value of the order lines (qty × unit_price). */
  netValue: number;
  lineCount: number;
}

export interface OrderLine {
  id: string;
  item_id: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  /** Units delivered so far (Σ delivered challans, §4.4). */
  qtyFulfilled: number;
  unit_price: number;
  gst_rate: number;
  line_no: number;
}

export interface OrderDetail {
  id: string;
  order_no: string;
  order_date: string;
  status: OrderStatus;
  notes: string | null;
  storeName: string | null;
  storeCode: string | null;
  customerName: string | null;
  customerId: string;
  branchId: string;
  lines: OrderLine[];
  netValue: number;
}

// The embedded PostgREST select shared by list + detail. `customer` and `store`
// are single embedded rows; `sales_order_lines` is the child collection.
const ORDER_SELECT =
  "id, order_no, order_date, status, notes, customer_id, branch_id, " +
  "customer:customers(name), store:customer_stores(name, code), " +
  "lines:sales_order_lines(id, item_id, qty, qty_fulfilled, unit_price, gst_rate, line_no, item:items(name, sku))";

type RawLine = {
  id: string;
  item_id: string;
  qty: number;
  qty_fulfilled: number;
  unit_price: number;
  gst_rate: number;
  line_no: number;
  item: { name: string; sku: string } | null;
};

type RawOrder = Pick<
  Tables["sales_orders"]["Row"],
  "id" | "order_no" | "order_date" | "status" | "notes" | "customer_id" | "branch_id"
> & {
  customer: { name: string } | null;
  store: { name: string; code: string } | null;
  lines: RawLine[] | null;
};

function netOf(lines: RawLine[] | null): number {
  if (!lines) return 0;
  return lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.unit_price), 0);
}

/**
 * Recent sales orders, newest first. Optionally filter by status (e.g. the
 * "confirmed" awaiting-invoice queue). Returns [] on a blocked/failed read.
 */
export async function listOrders(opts: {
  status?: OrderStatus;
  limit?: number;
} = {}): Promise<OrderListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("sales_orders")
    .select(ORDER_SELECT)
    .order("order_date", { ascending: false })
    .order("order_no", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);

  const rows = unwrap(await q.returns<RawOrder[]>(), [] as RawOrder[], "listOrders");
  return rows.map((r) => ({
    id: r.id,
    order_no: r.order_no,
    order_date: r.order_date,
    status: r.status,
    notes: r.notes,
    storeName: r.store?.name ?? null,
    storeCode: r.store?.code ?? null,
    customerName: r.customer?.name ?? null,
    customerId: r.customer_id,
    netValue: netOf(r.lines),
    lineCount: r.lines?.length ?? 0,
  }));
}

/** One order with its lines, or null if not found / not visible. */
export async function getOrder(id: string): Promise<OrderDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("sales_orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<RawOrder | null>();
  const r = unwrap(res, null as RawOrder | null, "getOrder");
  if (!r) return null;

  const lines: OrderLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      item_id: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      qtyFulfilled: Number(l.qty_fulfilled ?? 0),
      unit_price: Number(l.unit_price),
      gst_rate: Number(l.gst_rate),
      line_no: l.line_no,
    }));

  return {
    id: r.id,
    order_no: r.order_no,
    order_date: r.order_date,
    status: r.status,
    notes: r.notes,
    storeName: r.store?.name ?? null,
    storeCode: r.store?.code ?? null,
    customerName: r.customer?.name ?? null,
    customerId: r.customer_id,
    branchId: r.branch_id,
    lines,
    netValue: netOf(r.lines),
  };
}

// ---- master pickers for the create form ----

/**
 * Our home state code (2-digit), the pivot for GST: a store in the same state
 * gets CGST+SGST, a different state gets IGST (Invariant / §1.9). Read from
 * company_settings; the RPC is authoritative — this only drives the UI preview.
 */
export async function getHomeStateCode(): Promise<string | null> {
  const supabase = createClient();
  const res = await supabase.from("company_settings").select("state_code").limit(1).maybeSingle();
  const r = unwrap(res, null as { state_code: string } | null, "getHomeStateCode");
  return r?.state_code ?? null;
}

export interface StoreOption {
  id: string;
  name: string;
  code: string;
  customerName: string | null;
  customerId: string | null;
  stateCode: string;
}

/** Active customer stores for the order form's store picker. */
export async function listStores(): Promise<StoreOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("customer_stores")
    .select("id, name, code, customer_id, state_code, status, customer:customers(name)")
    .eq("status", "active")
    .order("name");
  type Raw = {
    id: string;
    name: string;
    code: string;
    customer_id: string | null;
    state_code: string;
    customer: { name: string } | null;
  };
  const rows = unwrap(res, [] as Raw[], "listStores");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    customerName: r.customer?.name ?? null,
    customerId: r.customer_id,
    stateCode: r.state_code,
  }));
}

export interface ItemOption {
  id: string;
  name: string;
  sku: string;
  defaultPrice: number;
  gstRate: number;
}

/** Active, sellable items for the order line editor. */
export async function listSellableItems(): Promise<ItemOption[]> {
  const supabase = createClient();
  const res = await supabase
    .from("items")
    .select("id, name, sku, default_price, gst_rate, is_sellable, status")
    .eq("is_sellable", true)
    .eq("status", "active")
    .order("name");
  type Raw = Pick<
    Tables["items"]["Row"],
    "id" | "name" | "sku" | "default_price" | "gst_rate"
  >;
  const rows = unwrap(res, [] as Raw[], "listSellableItems");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    defaultPrice: Number(r.default_price),
    gstRate: Number(r.gst_rate),
  }));
}

export interface CustomerCreditInfo {
  creditLimit: number;
  outstanding: number;
}

export async function getCustomerCreditInfo(customerId: string): Promise<CustomerCreditInfo | null> {
  if (!customerId) return null;
  const supabase = createClient();
  const [custRes, invRes] = await Promise.all([
    supabase.from("customers").select("credit_limit").eq("id", customerId).maybeSingle(),
    supabase
      .from("invoices")
      .select("grand_total, amount_paid")
      .eq("customer_id", customerId)
      .in("status", ["posted", "part_paid"]),
  ]);
  const cust = unwrap(custRes, null as { credit_limit: number } | null, "getCustomerCreditInfo:customer");
  const invs = unwrap(invRes, [] as { grand_total: number; amount_paid: number }[], "getCustomerCreditInfo:invoices");
  if (!cust) return null;
  const outstanding = invs.reduce((s, r) => s + Number(r.grand_total) - Number(r.amount_paid), 0);
  return { creditLimit: Number(cust.credit_limit), outstanding };
}

// ---- invoices (the value document) ----

export interface InvoiceListRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceStatus;
  storeName: string | null;
  storeCode: string | null;
  customerName: string | null;
  orderNo: string | null;
  isInterstate: boolean;
  taxableAmount: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  isOfficial: boolean;
}

export interface InvoiceLine {
  id: string;
  item_id: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  unit_price: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  line_total: number;
  line_no: number;
  unitCogs: number;
}

export interface InvoiceDetail {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceStatus;
  storeName: string | null;
  storeCode: string | null;
  storeState: string | null;
  customerName: string | null;
  customerGstin: string | null;
  orderId: string | null;
  orderNo: string | null;
  placeOfSupply: string;
  isInterstate: boolean;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  isOfficial: boolean;
  cogsEntryId: string | null;
  lines: InvoiceLine[];
}

// Shared embedded select. `order` is nullable (direct Sales-Desk sales carry no
// order); `store`/`customer` are single rows; `invoice_lines` the child set.
const INVOICE_SELECT =
  "id, invoice_no, invoice_date, status, order_id, place_of_supply, is_interstate, is_official, " +
  "taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, round_off, " +
  "grand_total, amount_paid, cogs_entry_id, " +
  "customer:customers(name, gstin), store:customer_stores(name, code, state_code), " +
  "order:sales_orders(order_no), " +
  "lines:invoice_lines(id, item_id, qty, unit_price, taxable_amount, gst_rate, " +
  "cgst_amount, sgst_amount, igst_amount, cess_amount, line_total, line_no, unit_cogs, item:items(name, sku))";

type RawInvoiceLine = {
  id: string;
  item_id: string;
  qty: number;
  unit_price: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  line_total: number;
  line_no: number;
  unit_cogs: number;
  item: { name: string; sku: string } | null;
};

type RawInvoice = Pick<
  Tables["invoices"]["Row"],
  | "id"
  | "invoice_no"
  | "invoice_date"
  | "status"
  | "order_id"
  | "place_of_supply"
  | "is_interstate"
  | "is_official"
  | "taxable_amount"
  | "cgst_amount"
  | "sgst_amount"
  | "igst_amount"
  | "cess_amount"
  | "round_off"
  | "grand_total"
  | "amount_paid"
  | "cogs_entry_id"
> & {
  customer: { name: string; gstin: string | null } | null;
  store: { name: string; code: string; state_code: string } | null;
  order: { order_no: string } | null;
  lines: RawInvoiceLine[] | null;
};

// ---- day KPIs (Sales Desk strip + dashboard, §4.8: journal-fed documents,
// not divergent caches — invoices/receipts carry their posted journal ids) ----

export interface SalesTodayKpis {
  /** Sum of grand_total for today's non-void invoices. */
  salesTotal: number;
  invoiceCount: number;
  /** Output tax charged today (CGST+SGST+IGST+cess). */
  taxTotal: number;
  /** Sum of posted receipts dated today. */
  collectionsTotal: number;
  receiptCount: number;
}

type InvKpiRow = {
  grand_total: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  status: InvoiceStatus;
};
type RcptKpiRow = { amount: number; status: string };

/** Today's sales + collections figures (business date = IST). */
export async function getSalesTodayKpis(): Promise<SalesTodayKpis> {
  const supabase = createClient();
  // en-CA formats as YYYY-MM-DD; pin to IST so the "day" matches invoice_date.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const [invRes, rcptRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("grand_total, cgst_amount, sgst_amount, igst_amount, cess_amount, status")
      .eq("invoice_date", today)
      .neq("status", "void")
      .returns<InvKpiRow[]>(),
    supabase
      .from("customer_receipts")
      .select("amount, status")
      .eq("receipt_date", today)
      .eq("status", "posted")
      .returns<RcptKpiRow[]>(),
  ]);

  const invs = unwrap(invRes, [] as InvKpiRow[], "getSalesTodayKpis:invoices");
  const rcpts = unwrap(rcptRes, [] as RcptKpiRow[], "getSalesTodayKpis:receipts");

  return {
    salesTotal: invs.reduce((s, r) => s + Number(r.grand_total), 0),
    invoiceCount: invs.length,
    taxTotal: invs.reduce(
      (s, r) =>
        s + Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount) + Number(r.cess_amount),
      0,
    ),
    collectionsTotal: rcpts.reduce((s, r) => s + Number(r.amount), 0),
    receiptCount: rcpts.length,
  };
}

/** Recent invoices, newest first. Optionally filter by status. [] on failure. */
export async function listInvoices(opts: {
  status?: InvoiceStatus;
  isOfficial?: boolean;
  limit?: number;
} = {}): Promise<InvoiceListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .order("invoice_date", { ascending: false })
    .order("invoice_no", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.isOfficial !== undefined) q = q.eq("is_official", opts.isOfficial);

  const rows = unwrap(await q.returns<RawInvoice[]>(), [] as RawInvoice[], "listInvoices");
  return rows.map((r) => ({
    id: r.id,
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    status: r.status,
    storeName: r.store?.name ?? null,
    storeCode: r.store?.code ?? null,
    customerName: r.customer?.name ?? null,
    orderNo: r.order?.order_no ?? null,
    isInterstate: r.is_interstate,
    taxableAmount: Number(r.taxable_amount),
    taxTotal:
      Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount) + Number(r.cess_amount),
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
    isOfficial: r.is_official,
  }));
}

/** One invoice with its GST-broken-out lines, or null if not found / not visible. */
// ---- customer ledger (read-model, §4.6) ----

export interface CustomerLedgerEntry {
  id: string;
  txnType: string;
  referenceId: string;
  referenceType: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  invoiceNo: string | null;
  receiptNo: string | null;
}

export interface LedgerSummary {
  outstanding: number;
  entries: CustomerLedgerEntry[];
}

export async function getCustomerLedger(
  customerId: string,
  limit = 50,
  offset = 0,
): Promise<LedgerSummary | null> {
  if (!customerId) return null;
  const supabase = createClient();
  const [ledgerRes, balRes] = await Promise.all([
    supabase.rpc("get_customer_ledger", {
      p_customer_id: customerId,
      p_limit: limit,
      p_offset: offset,
    }),
    supabase.rpc("customer_outstanding_via_ledger", { p_customer_id: customerId }),
  ]);
  const rows = unwrap(ledgerRes, [], "getCustomerLedger");
  const outstanding = unwrap(balRes, 0, "getCustomerLedger:outstanding");
  return {
    outstanding: Number(outstanding),
    entries: rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      txnType: r.txn_type as string,
      referenceId: r.reference_id as string,
      referenceType: r.reference_type as string,
      amount: Number(r.amount),
      balanceAfter: Number(r.balance_after),
      createdAt: r.created_at as string,
      invoiceNo: (r.invoice_no as string) ?? null,
      receiptNo: (r.receipt_no as string) ?? null,
    })),
  };
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<RawInvoice | null>();
  const r = unwrap(res, null as RawInvoice | null, "getInvoice");
  if (!r) return null;

  const lines: InvoiceLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      item_id: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      unit_price: Number(l.unit_price),
      taxable_amount: Number(l.taxable_amount),
      gst_rate: Number(l.gst_rate),
      cgst_amount: Number(l.cgst_amount),
      sgst_amount: Number(l.sgst_amount),
      igst_amount: Number(l.igst_amount),
      cess_amount: Number(l.cess_amount),
      line_total: Number(l.line_total),
      line_no: l.line_no,
      unitCogs: Number(l.unit_cogs),
    }));

  return {
    id: r.id,
    invoice_no: r.invoice_no,
    invoice_date: r.invoice_date,
    status: r.status,
    storeName: r.store?.name ?? null,
    storeCode: r.store?.code ?? null,
    storeState: r.store?.state_code ?? null,
    customerName: r.customer?.name ?? null,
    customerGstin: r.customer?.gstin ?? null,
    orderId: r.order_id,
    orderNo: r.order?.order_no ?? null,
    placeOfSupply: r.place_of_supply,
    isInterstate: r.is_interstate,
    taxableAmount: Number(r.taxable_amount),
    cgstAmount: Number(r.cgst_amount),
    sgstAmount: Number(r.sgst_amount),
    igstAmount: Number(r.igst_amount),
    cessAmount: Number(r.cess_amount),
    roundOff: Number(r.round_off),
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
    isOfficial: r.is_official,
    cogsEntryId: r.cogs_entry_id,
    lines,
  };
}

// =====================================================================
// lib/data/gst.ts — server-only readers for GST reports & GSTR-2B (§5.9).
//
// All the filing summaries are pure reads over invoices/invoice_lines (output
// side) and supplier_bills (input side), aggregated by period (YYYY-MM over the
// document date). B2B vs B2C is decided by whether the customer carries a GSTIN.
// The 2B reconciliation reads the imported gstr2b_rows + their match status.
// Writes (import/reconcile) go through lib/actions/gst.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

export type GstMatchStatus = Database["public"]["Enums"]["gst_match_status"];

// period 'YYYY-MM' -> [firstDay, lastDay] ISO dates
function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day
  const to = `${period}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** Default reporting period = current IST month as YYYY-MM. */
export function currentPeriod(): string {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return d.slice(0, 7);
}

// ---- shared raw shapes ----

interface RawSaleInvoice {
  id: string;
  invoice_no: string;
  invoice_date: string;
  is_interstate: boolean;
  place_of_supply: string;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  grand_total: number;
  status: string;
  customer: { name: string; gstin: string | null } | null;
}

async function fetchSaleInvoices(period: string): Promise<RawSaleInvoice[]> {
  const supabase = createClient();
  const { from, to } = periodRange(period);
  const res = await supabase
    .from("invoices")
    .select(
      "id, invoice_no, invoice_date, is_interstate, place_of_supply, taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, grand_total, status, customer:customers(name, gstin)",
    )
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .neq("status", "void")
    .order("invoice_date")
    .order("invoice_no")
    .returns<RawSaleInvoice[]>();
  return unwrap(res, [] as RawSaleInvoice[], "fetchSaleInvoices");
}

// ---- Sales / GST Sales register ----

export interface SalesRegisterRow {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string | null;
  customerGstin: string | null;
  placeOfSupply: string;
  isInterstate: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}

export async function getSalesRegister(period: string): Promise<SalesRegisterRow[]> {
  const rows = await fetchSaleInvoices(period);
  return rows.map((r) => ({
    id: r.id,
    invoiceNo: r.invoice_no,
    invoiceDate: r.invoice_date,
    customerName: r.customer?.name ?? null,
    customerGstin: r.customer?.gstin ?? null,
    placeOfSupply: r.place_of_supply,
    isInterstate: r.is_interstate,
    taxable: Number(r.taxable_amount),
    cgst: Number(r.cgst_amount),
    sgst: Number(r.sgst_amount),
    igst: Number(r.igst_amount),
    cess: Number(r.cess_amount),
    total: Number(r.grand_total),
  }));
}

// ---- GSTR-1 summary (B2B vs B2C, rate-wise) ----

export interface Gstr1Bucket {
  label: string;
  invoiceCount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface Gstr1Summary {
  b2b: Gstr1Bucket;
  b2c: Gstr1Bucket;
  total: Gstr1Bucket;
}

function emptyBucket(label: string): Gstr1Bucket {
  return { label, invoiceCount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
}
function addToBucket(b: Gstr1Bucket, r: RawSaleInvoice) {
  b.invoiceCount += 1;
  b.taxable += Number(r.taxable_amount);
  b.cgst += Number(r.cgst_amount);
  b.sgst += Number(r.sgst_amount);
  b.igst += Number(r.igst_amount);
  b.cess += Number(r.cess_amount);
}

export async function getGstr1Summary(period: string): Promise<Gstr1Summary> {
  const rows = await fetchSaleInvoices(period);
  const b2b = emptyBucket("B2B (registered)");
  const b2c = emptyBucket("B2C (unregistered)");
  const total = emptyBucket("Total");
  for (const r of rows) {
    const bucket = r.customer?.gstin ? b2b : b2c;
    addToBucket(bucket, r);
    addToBucket(total, r);
  }
  return { b2b, b2c, total };
}

// ---- HSN summary (from invoice lines) ----

export interface HsnRow {
  hsn: string;
  itemName: string | null;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

interface RawInvLine {
  qty: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  item: { name: string; hsn_code: string | null } | null;
  invoice: { invoice_date: string; status: string } | null;
}

export async function getHsnSummary(period: string): Promise<HsnRow[]> {
  const supabase = createClient();
  const { from, to } = periodRange(period);
  const res = await supabase
    .from("invoice_lines")
    .select(
      "qty, taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, " +
        "item:items(name, hsn_code), invoice:invoices!inner(invoice_date, status)",
    )
    .gte("invoice.invoice_date", from)
    .lte("invoice.invoice_date", to)
    .neq("invoice.status", "void")
    .returns<RawInvLine[]>();
  const rows = unwrap(res, [] as RawInvLine[], "getHsnSummary");

  const map = new Map<string, HsnRow>();
  for (const l of rows) {
    const hsn = l.item?.hsn_code ?? "—";
    const key = hsn;
    const cur =
      map.get(key) ??
      { hsn, itemName: l.item?.name ?? null, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    cur.qty += Number(l.qty);
    cur.taxable += Number(l.taxable_amount);
    cur.cgst += Number(l.cgst_amount);
    cur.sgst += Number(l.sgst_amount);
    cur.igst += Number(l.igst_amount);
    cur.cess += Number(l.cess_amount);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.taxable - a.taxable);
}

// ---- Purchase register + ITC ----

export interface PurchaseRegisterRow {
  id: string;
  billNo: string;
  supplierBillNo: string | null;
  billDate: string;
  supplierName: string | null;
  supplierGstin: string | null;
  isInterstate: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}

interface RawBill {
  id: string;
  bill_no: string;
  supplier_bill_no: string | null;
  bill_date: string;
  is_interstate: boolean;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  grand_total: number;
  status: string;
  supplier: { name: string; gstin: string | null } | null;
}

async function fetchBills(period: string): Promise<RawBill[]> {
  const supabase = createClient();
  const { from, to } = periodRange(period);
  const res = await supabase
    .from("supplier_bills")
    .select(
      "id, bill_no, supplier_bill_no, bill_date, is_interstate, taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, grand_total, status, supplier:suppliers(name, gstin)",
    )
    .gte("bill_date", from)
    .lte("bill_date", to)
    .neq("status", "void")
    .order("bill_date")
    .returns<RawBill[]>();
  return unwrap(res, [] as RawBill[], "fetchBills");
}

export async function getPurchaseRegister(period: string): Promise<PurchaseRegisterRow[]> {
  const rows = await fetchBills(period);
  return rows.map((r) => ({
    id: r.id,
    billNo: r.bill_no,
    supplierBillNo: r.supplier_bill_no,
    billDate: r.bill_date,
    supplierName: r.supplier?.name ?? null,
    supplierGstin: r.supplier?.gstin ?? null,
    isInterstate: r.is_interstate,
    taxable: Number(r.taxable_amount),
    cgst: Number(r.cgst_amount),
    sgst: Number(r.sgst_amount),
    igst: Number(r.igst_amount),
    cess: Number(r.cess_amount),
    total: Number(r.grand_total),
  }));
}

// ---- GSTR-3B summary (output tax − ITC = net payable) ----

export interface Gstr3bSummary {
  outputTaxable: number;
  outputCgst: number;
  outputSgst: number;
  outputIgst: number;
  outputCess: number;
  outputTotal: number;
  itcCgst: number;
  itcSgst: number;
  itcIgst: number;
  itcCess: number;
  itcTotal: number;
  netPayable: number;
}

export async function getGstr3bSummary(period: string): Promise<Gstr3bSummary> {
  const [invoices, bills] = await Promise.all([fetchSaleInvoices(period), fetchBills(period)]);
  const outputCgst = invoices.reduce((s, r) => s + Number(r.cgst_amount), 0);
  const outputSgst = invoices.reduce((s, r) => s + Number(r.sgst_amount), 0);
  const outputIgst = invoices.reduce((s, r) => s + Number(r.igst_amount), 0);
  const outputCess = invoices.reduce((s, r) => s + Number(r.cess_amount), 0);
  const itcCgst = bills.reduce((s, r) => s + Number(r.cgst_amount), 0);
  const itcSgst = bills.reduce((s, r) => s + Number(r.sgst_amount), 0);
  const itcIgst = bills.reduce((s, r) => s + Number(r.igst_amount), 0);
  const itcCess = bills.reduce((s, r) => s + Number(r.cess_amount), 0);
  const outputTotal = outputCgst + outputSgst + outputIgst + outputCess;
  const itcTotal = itcCgst + itcSgst + itcIgst + itcCess;
  return {
    outputTaxable: invoices.reduce((s, r) => s + Number(r.taxable_amount), 0),
    outputCgst,
    outputSgst,
    outputIgst,
    outputCess,
    outputTotal,
    itcCgst,
    itcSgst,
    itcIgst,
    itcCess,
    itcTotal,
    netPayable: outputTotal - itcTotal,
  };
}

// ---- GSTR-2B imports + reconciliation report ----

export interface Gstr2bImportRow {
  id: string;
  period: string;
  filename: string | null;
  rowCount: number;
  importedAt: string;
  matched: number;
  mismatch: number;
  missingInBooks: number;
}

export async function list2bImports(): Promise<Gstr2bImportRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("gstr2b_imports")
    .select("id, period, filename, row_count, imported_at, rows:gstr2b_rows(match_status)")
    .order("imported_at", { ascending: false })
    .returns<
      {
        id: string;
        period: string;
        filename: string | null;
        row_count: number;
        imported_at: string;
        rows: { match_status: GstMatchStatus }[] | null;
      }[]
    >();
  const rows = unwrap(res, [] as never[], "list2bImports");
  return rows.map((r) => {
    const rr = r.rows ?? [];
    return {
      id: r.id,
      period: r.period,
      filename: r.filename,
      rowCount: r.row_count,
      importedAt: r.imported_at,
      matched: rr.filter((x) => x.match_status === "matched").length,
      mismatch: rr.filter((x) => x.match_status === "mismatch").length,
      missingInBooks: rr.filter((x) => x.match_status === "missing_in_books").length,
    };
  });
}

export interface Gstr2bDetailRow {
  id: string;
  supplierGstin: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  taxable: number;
  tax: number;
  matchStatus: GstMatchStatus;
  matchedBillId: string | null;
  matchedBillNo: string | null;
}

export interface Gstr2bReport {
  import: { id: string; period: string; filename: string | null; rowCount: number; importedAt: string } | null;
  rows: Gstr2bDetailRow[];
  /** Bills recorded in the period that had no matching 2B row (ITC to defer). */
  missingIn2b: { id: string; billNo: string; supplierBillNo: string | null; supplierName: string | null; taxable: number; tax: number }[];
}

export async function get2bReport(importId: string): Promise<Gstr2bReport> {
  const supabase = createClient();
  const impRes = await supabase
    .from("gstr2b_imports")
    .select("id, period, filename, row_count, imported_at")
    .eq("id", importId)
    .maybeSingle()
    .returns<{ id: string; period: string; filename: string | null; row_count: number; imported_at: string } | null>();
  const imp = unwrap(impRes, null, "get2bReport.import");
  if (!imp) return { import: null, rows: [], missingIn2b: [] };

  const rowsRes = await supabase
    .from("gstr2b_rows")
    .select(
      "id, supplier_gstin, invoice_no, invoice_date, taxable, cgst, sgst, igst, cess, match_status, matched_bill_id, " +
        "bill:supplier_bills(bill_no)",
    )
    .eq("import_id", importId)
    .order("match_status")
    .returns<
      {
        id: string;
        supplier_gstin: string | null;
        invoice_no: string | null;
        invoice_date: string | null;
        taxable: number;
        cgst: number;
        sgst: number;
        igst: number;
        cess: number;
        match_status: GstMatchStatus;
        matched_bill_id: string | null;
        bill: { bill_no: string } | null;
      }[]
    >();
  const rawRows = unwrap(rowsRes, [] as never[], "get2bReport.rows");
  const rows: Gstr2bDetailRow[] = rawRows.map((r) => ({
    id: r.id,
    supplierGstin: r.supplier_gstin,
    invoiceNo: r.invoice_no,
    invoiceDate: r.invoice_date,
    taxable: Number(r.taxable),
    tax: Number(r.cgst) + Number(r.sgst) + Number(r.igst) + Number(r.cess),
    matchStatus: r.match_status,
    matchedBillId: r.matched_bill_id,
    matchedBillNo: r.bill?.bill_no ?? null,
  }));

  // Books-side: bills in the 2B period not linked to any 2B row (missing_in_2b).
  const matchedBillIds = new Set(rows.map((r) => r.matchedBillId).filter(Boolean) as string[]);
  const bills = await fetchBills(imp.period);
  const missingIn2b = bills
    .filter((b) => (b.supplier?.gstin ?? null) !== null && !matchedBillIds.has(b.id))
    .map((b) => ({
      id: b.id,
      billNo: b.bill_no,
      supplierBillNo: b.supplier_bill_no,
      supplierName: b.supplier?.name ?? null,
      taxable: Number(b.taxable_amount),
      tax: Number(b.cgst_amount) + Number(b.sgst_amount) + Number(b.igst_amount) + Number(b.cess_amount),
    }));

  return {
    import: { id: imp.id, period: imp.period, filename: imp.filename, rowCount: imp.row_count, importedAt: imp.imported_at },
    rows,
    missingIn2b,
  };
}

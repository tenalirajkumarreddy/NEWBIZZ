// =====================================================================
// lib/data/purchases.ts — server-only readers for Purchasing (§5.4/§5.5):
// purchase orders, goods receipts (GRN), supplier bills, payments, and
// purchase-return debit notes.
//
// The buy-side value/stock flow: PO (intent, no ledger) → GRN (stock IN at
// cost, Dr inventory / Cr 2115 clearing) → Bill (clears 2115, books Input GST +
// AP) → Payment (Dr AP / Cr bank/cash). Debit notes reverse a purchase. Reads
// only; writes go through lib/actions/purchases.ts.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "./types";
import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];
export type GrnStatus = Database["public"]["Enums"]["grn_status"];
export type BillStatus = Database["public"]["Enums"]["bill_status"];

// ---- purchase orders ----

export interface PoListRow {
  id: string;
  poNo: string;
  poDate: string;
  status: PurchaseStatus;
  supplierName: string | null;
  expectedDate: string | null;
  netValue: number;
  lineCount: number;
}

export interface PoLine {
  id: string;
  itemId: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  unitCost: number;
  gstRate: number;
  line_no: number;
}

export interface PoDetail extends Omit<PoListRow, "netValue" | "lineCount"> {
  supplierId: string;
  branchId: string;
  notes: string | null;
  lines: PoLine[];
  netValue: number;
}

const PO_SELECT =
  "id, po_no, po_date, status, expected_date, notes, supplier_id, branch_id, " +
  "supplier:suppliers(name), " +
  "lines:purchase_order_lines(id, item_id, qty, unit_cost, gst_rate, line_no, item:items(name, sku))";

type RawPoLine = {
  id: string;
  item_id: string;
  qty: number;
  unit_cost: number;
  gst_rate: number;
  line_no: number;
  item: { name: string; sku: string } | null;
};

type RawPo = Pick<
  Tables["purchase_orders"]["Row"],
  "id" | "po_no" | "po_date" | "status" | "expected_date" | "notes" | "supplier_id" | "branch_id"
> & {
  supplier: { name: string } | null;
  lines: RawPoLine[] | null;
};

function poNet(lines: RawPoLine[] | null): number {
  return (lines ?? []).reduce((s, l) => s + Number(l.qty) * Number(l.unit_cost), 0);
}

export async function listPurchaseOrders(opts: { status?: PurchaseStatus; limit?: number } = {}): Promise<PoListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("purchase_orders")
    .select(PO_SELECT)
    .order("po_date", { ascending: false })
    .order("po_no", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawPo[]>(), [] as RawPo[], "listPurchaseOrders");
  return rows.map((r) => ({
    id: r.id,
    poNo: r.po_no,
    poDate: r.po_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    expectedDate: r.expected_date,
    netValue: poNet(r.lines),
    lineCount: r.lines?.length ?? 0,
  }));
}

export async function getPurchaseOrder(id: string): Promise<PoDetail | null> {
  const supabase = createClient();
  const res = await supabase.from("purchase_orders").select(PO_SELECT).eq("id", id).maybeSingle().returns<RawPo | null>();
  const r = unwrap(res, null as RawPo | null, "getPurchaseOrder");
  if (!r) return null;
  const lines: PoLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      itemId: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      gstRate: Number(l.gst_rate),
      line_no: l.line_no,
    }));
  return {
    id: r.id,
    poNo: r.po_no,
    poDate: r.po_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    expectedDate: r.expected_date,
    supplierId: r.supplier_id,
    branchId: r.branch_id,
    notes: r.notes,
    lines,
    netValue: poNet(r.lines),
  };
}

// ---- goods receipts (GRN) ----

export interface GrnListRow {
  id: string;
  grnNo: string;
  grnDate: string;
  status: GrnStatus;
  supplierName: string | null;
  poNo: string | null;
  goodsValue: number;
  billedBillId: string | null;
}

export interface GrnLine {
  id: string;
  itemId: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  unitCost: number;
  lineValue: number;
  gstRate: number;
  line_no: number;
}

export interface GrnDetail extends GrnListRow {
  supplierId: string;
  branchId: string;
  poId: string | null;
  supplierDcNo: string | null;
  notes: string | null;
  lines: GrnLine[];
}

const GRN_SELECT =
  "id, grn_no, grn_date, status, goods_value, billed_bill_id, supplier_id, branch_id, po_id, supplier_dc_no, notes, " +
  "supplier:suppliers(name), po:purchase_orders(po_no), " +
  "lines:purchase_receipt_lines(id, item_id, qty, unit_cost, line_value, gst_rate, line_no, item:items(name, sku))";

type RawGrnLine = {
  id: string;
  item_id: string;
  qty: number;
  unit_cost: number;
  line_value: number;
  gst_rate: number;
  line_no: number;
  item: { name: string; sku: string } | null;
};

type RawGrn = Pick<
  Tables["purchase_receipts"]["Row"],
  "id" | "grn_no" | "grn_date" | "status" | "goods_value" | "billed_bill_id" | "supplier_id" | "branch_id" | "po_id" | "supplier_dc_no" | "notes"
> & {
  supplier: { name: string } | null;
  po: { po_no: string } | null;
  lines: RawGrnLine[] | null;
};

export async function listGrns(opts: { status?: GrnStatus; limit?: number } = {}): Promise<GrnListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("purchase_receipts")
    .select(GRN_SELECT)
    .order("grn_date", { ascending: false })
    .order("grn_no", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawGrn[]>(), [] as RawGrn[], "listGrns");
  return rows.map((r) => ({
    id: r.id,
    grnNo: r.grn_no,
    grnDate: r.grn_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    poNo: r.po?.po_no ?? null,
    goodsValue: Number(r.goods_value ?? 0),
    billedBillId: r.billed_bill_id,
  }));
}

export async function getGrn(id: string): Promise<GrnDetail | null> {
  const supabase = createClient();
  const res = await supabase.from("purchase_receipts").select(GRN_SELECT).eq("id", id).maybeSingle().returns<RawGrn | null>();
  const r = unwrap(res, null as RawGrn | null, "getGrn");
  if (!r) return null;
  const lines: GrnLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      itemId: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      lineValue: Number(l.line_value),
      gstRate: Number(l.gst_rate),
      line_no: l.line_no,
    }));
  return {
    id: r.id,
    grnNo: r.grn_no,
    grnDate: r.grn_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    poNo: r.po?.po_no ?? null,
    goodsValue: Number(r.goods_value ?? 0),
    billedBillId: r.billed_bill_id,
    supplierId: r.supplier_id,
    branchId: r.branch_id,
    poId: r.po_id,
    supplierDcNo: r.supplier_dc_no,
    notes: r.notes,
    lines,
  };
}

/** GRNs not yet billed — the queue for "create bill from GRN". */
export async function listUnbilledGrns(): Promise<GrnListRow[]> {
  const all = await listGrns({ status: "received", limit: 200 });
  return all.filter((g) => !g.billedBillId);
}

// ---- supplier bills ----

export interface BillListRow {
  id: string;
  billNo: string;
  supplierBillNo: string | null;
  billDate: string;
  status: BillStatus;
  supplierName: string | null;
  taxableAmount: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
}

export interface BillLine {
  id: string;
  itemId: string | null;
  itemName: string | null;
  sku: string | null;
  expenseAccount: string | null;
  description: string | null;
  qty: number;
  unitCost: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
  line_no: number;
}

export interface BillDetail extends BillListRow {
  supplierId: string;
  isInterstate: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  roundOff: number;
  dueDate: string | null;
  notes: string | null;
  lines: BillLine[];
}

const BILL_SELECT =
  "id, bill_no, supplier_bill_no, bill_date, due_date, status, is_interstate, " +
  "taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, round_off, grand_total, amount_paid, notes, supplier_id, " +
  "supplier:suppliers(name), " +
  "lines:supplier_bill_lines(id, item_id, expense_account, description, qty, unit_cost, taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, line_total, line_no, item:items(name, sku))";

type RawBillLine = {
  id: string;
  item_id: string | null;
  expense_account: string | null;
  description: string | null;
  qty: number;
  unit_cost: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
  line_no: number;
  item: { name: string; sku: string } | null;
};

type RawBill = Pick<
  Tables["supplier_bills"]["Row"],
  "id" | "bill_no" | "supplier_bill_no" | "bill_date" | "due_date" | "status" | "is_interstate" | "taxable_amount" | "cgst_amount" | "sgst_amount" | "igst_amount" | "cess_amount" | "round_off" | "grand_total" | "amount_paid" | "notes" | "supplier_id"
> & {
  supplier: { name: string } | null;
  lines: RawBillLine[] | null;
};

function billTax(r: RawBill): number {
  return Number(r.cgst_amount) + Number(r.sgst_amount) + Number(r.igst_amount) + Number(r.cess_amount);
}

export async function listBills(opts: { status?: BillStatus; limit?: number } = {}): Promise<BillListRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("supplier_bills")
    .select(BILL_SELECT)
    .order("bill_date", { ascending: false })
    .order("bill_no", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const rows = unwrap(await q.returns<RawBill[]>(), [] as RawBill[], "listBills");
  return rows.map((r) => ({
    id: r.id,
    billNo: r.bill_no,
    supplierBillNo: r.supplier_bill_no,
    billDate: r.bill_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    taxableAmount: Number(r.taxable_amount),
    taxTotal: billTax(r),
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
  }));
}

export async function getBill(id: string): Promise<BillDetail | null> {
  const supabase = createClient();
  const res = await supabase.from("supplier_bills").select(BILL_SELECT).eq("id", id).maybeSingle().returns<RawBill | null>();
  const r = unwrap(res, null as RawBill | null, "getBill");
  if (!r) return null;
  const lines: BillLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      itemId: l.item_id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      expenseAccount: l.expense_account,
      description: l.description,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      taxableAmount: Number(l.taxable_amount),
      gstRate: Number(l.gst_rate),
      cgstAmount: Number(l.cgst_amount),
      sgstAmount: Number(l.sgst_amount),
      igstAmount: Number(l.igst_amount),
      lineTotal: Number(l.line_total),
      line_no: l.line_no,
    }));
  return {
    id: r.id,
    billNo: r.bill_no,
    supplierBillNo: r.supplier_bill_no,
    billDate: r.bill_date,
    status: r.status,
    supplierName: r.supplier?.name ?? null,
    taxableAmount: Number(r.taxable_amount),
    taxTotal: billTax(r),
    grandTotal: Number(r.grand_total),
    amountPaid: Number(r.amount_paid),
    supplierId: r.supplier_id,
    isInterstate: r.is_interstate,
    cgstAmount: Number(r.cgst_amount),
    sgstAmount: Number(r.sgst_amount),
    igstAmount: Number(r.igst_amount),
    cessAmount: Number(r.cess_amount),
    roundOff: Number(r.round_off),
    dueDate: r.due_date,
    notes: r.notes,
    lines,
  };
}

export interface OpenBillRow {
  id: string;
  billNo: string;
  supplierBillNo: string | null;
  billDate: string;
  grandTotal: number;
  amountPaid: number;
  outstanding: number;
}

/** Unpaid / part-paid bills for a supplier — the payment allocation picker. */
export async function listOpenBills(supplierId: string): Promise<OpenBillRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("supplier_bills")
    .select("id, bill_no, supplier_bill_no, bill_date, grand_total, amount_paid, status")
    .eq("supplier_id", supplierId)
    .in("status", ["posted", "part_paid"])
    .order("bill_date")
    .returns<
      { id: string; bill_no: string; supplier_bill_no: string | null; bill_date: string; grand_total: number; amount_paid: number }[]
    >();
  const rows = unwrap(res, [] as { id: string; bill_no: string; supplier_bill_no: string | null; bill_date: string; grand_total: number; amount_paid: number }[], "listOpenBills");
  return rows
    .map((r) => ({
      id: r.id,
      billNo: r.bill_no,
      supplierBillNo: r.supplier_bill_no,
      billDate: r.bill_date,
      grandTotal: Number(r.grand_total),
      amountPaid: Number(r.amount_paid),
      outstanding: Number(r.grand_total) - Number(r.amount_paid),
    }))
    .filter((r) => r.outstanding > 0.005);
}

// ---- supplier payments ----

export interface PaymentListRow {
  id: string;
  paymentNo: string;
  paymentDate: string;
  mode: string;
  supplierName: string | null;
  amount: number;
  allocatedAmount: number;
  reference: string | null;
}

type RawPayment = Pick<
  Tables["supplier_payments"]["Row"],
  "id" | "payment_no" | "payment_date" | "mode" | "amount" | "allocated_amount" | "reference"
> & { supplier: { name: string } | null };

export async function listSupplierPayments(opts: { limit?: number } = {}): Promise<PaymentListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("supplier_payments")
    .select("id, payment_no, payment_date, mode, amount, allocated_amount, reference, supplier:suppliers(name)")
    .order("payment_date", { ascending: false })
    .order("payment_no", { ascending: false })
    .limit(opts.limit ?? 100)
    .returns<RawPayment[]>();
  const rows = unwrap(res, [] as RawPayment[], "listSupplierPayments");
  return rows.map((r) => ({
    id: r.id,
    paymentNo: r.payment_no,
    paymentDate: r.payment_date,
    mode: r.mode,
    supplierName: r.supplier?.name ?? null,
    amount: Number(r.amount),
    allocatedAmount: Number(r.allocated_amount),
    reference: r.reference,
  }));
}

// ---- debit notes (purchase returns) ----

export interface DebitNoteListRow {
  id: string;
  debitNoteNo: string;
  createdAt: string;
  status: string;
  reason: string;
  supplierName: string | null;
  amount: number;
  baseAmount: number;
  taxAmount: number;
}

export interface DebitNoteLine {
  id: string;
  itemName: string | null;
  sku: string | null;
  qty: number;
  unitCost: number;
  taxableAmount: number;
  taxAmount: number;
  line_no: number;
}

export interface DebitNoteDetail extends DebitNoteListRow {
  narration: string | null;
  journalEntryId: string | null;
  lines: DebitNoteLine[];
}

const DN_SELECT =
  "id, debit_note_no, created_at, status, reason, amount, base_amount, tax_amount, narration, journal_entry_id, " +
  "supplier:suppliers(name)";

type RawDn = Pick<
  Tables["debit_notes"]["Row"],
  "id" | "debit_note_no" | "created_at" | "status" | "reason" | "amount" | "base_amount" | "tax_amount" | "narration" | "journal_entry_id"
> & { supplier: { name: string } | null };

function dnToList(r: RawDn): DebitNoteListRow {
  return {
    id: r.id,
    debitNoteNo: r.debit_note_no,
    createdAt: r.created_at,
    status: r.status,
    reason: r.reason,
    supplierName: r.supplier?.name ?? null,
    amount: Number(r.amount),
    baseAmount: Number(r.base_amount),
    taxAmount: Number(r.tax_amount),
  };
}

export async function listDebitNotes(opts: { limit?: number } = {}): Promise<DebitNoteListRow[]> {
  const supabase = createClient();
  const res = await supabase
    .from("debit_notes")
    .select(DN_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100)
    .returns<RawDn[]>();
  const rows = unwrap(res, [] as RawDn[], "listDebitNotes");
  return rows.map(dnToList);
}

export async function getDebitNote(id: string): Promise<DebitNoteDetail | null> {
  const supabase = createClient();
  const res = await supabase
    .from("debit_notes")
    .select(DN_SELECT + ", lines:debit_note_lines(id, qty, unit_cost, taxable_amount, tax_amount, line_no, item:items(name, sku))")
    .eq("id", id)
    .maybeSingle()
    .returns<
      | (RawDn & {
          lines:
            | { id: string; qty: number; unit_cost: number; taxable_amount: number; tax_amount: number; line_no: number; item: { name: string; sku: string } | null }[]
            | null;
        })
      | null
    >();
  const r = unwrap(res, null, "getDebitNote");
  if (!r) return null;
  const lines: DebitNoteLine[] = (r.lines ?? [])
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      id: l.id,
      itemName: l.item?.name ?? null,
      sku: l.item?.sku ?? null,
      qty: Number(l.qty),
      unitCost: Number(l.unit_cost),
      taxableAmount: Number(l.taxable_amount),
      taxAmount: Number(l.tax_amount),
      line_no: l.line_no,
    }));
  return { ...dnToList(r), narration: r.narration, journalEntryId: r.journal_entry_id, lines };
}

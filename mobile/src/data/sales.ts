import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { todayIST } from "@/lib/format";
import { rpc } from "@/lib/rpc";
import type { Enums } from "@/lib/db-types";
import { isoDaysAgo } from "./transfers";
import { qk } from "./keys";

export type JsonHeader = Record<string, unknown>;
export type JsonLine = Record<string, unknown>;

export interface TodayKpis {
  salesTotal: number;
  collectedTotal: number;
  invoiceCount: number;
  receiptCount: number;
}

export interface OrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  status: string;
  storeId: string;
  storeName: string | null;
  notes: string | null;
  lines: { itemId: string; qty: number; unitPrice: number; itemName: string | null }[];
}

export function useTodayKpis() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.today(),
    enabled: !!user?.id,
    queryFn: async (): Promise<TodayKpis> => {
      const today = todayIST();
      const [inv, rcpt] = await Promise.all([
        supabase.from("invoices").select("grand_total, status, created_by, invoice_date").eq("invoice_date", today).neq("status", "void"),
        supabase.from("customer_receipts").select("amount, status, collected_by, receipt_date").eq("receipt_date", today).eq("status", "posted"),
      ]);
      if (inv.error) throw inv.error;
      if (rcpt.error) throw rcpt.error;
      const uid = user!.id;
      const salesTotal = (inv.data ?? []).reduce((s: number, r: any) => s + Number(r.grand_total ?? 0), 0);
      const collectedTotal = (rcpt.data ?? [])
        .filter((r: any) => r.collected_by === uid)
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
      return {
        salesTotal,
        collectedTotal,
        invoiceCount: (inv.data ?? []).length,
        receiptCount: (rcpt.data ?? []).filter((r: any) => r.collected_by === uid).length,
      };
    },
  });
}

export interface AgingRow {
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  outstanding: number;
  ageDays: number;
  bucket: string | null;
}

export function useArAging() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.aging(),
    enabled: !!user?.id,
    queryFn: async (): Promise<AgingRow[]> => {
      const rows = await rpc<
        {
          customer_id: string | null;
          invoice_id: string | null;
          invoice_no: string | null;
          invoice_date: string | null;
          outstanding: number | null;
          age_days: number | null;
          bucket: string | null;
        }[]
      >("get_ar_aging", {});
      const open = (rows ?? [])
        .filter((r) => !!r.customer_id && !!r.invoice_id)
        .map((r) => ({
          customerId: r.customer_id!,
          customerName: "Unknown",
          invoiceId: r.invoice_id!,
          invoiceNo: r.invoice_no,
          invoiceDate: r.invoice_date,
          outstanding: Number(r.outstanding ?? 0),
          ageDays: Number(r.age_days ?? 0),
          bucket: r.bucket,
        }))
        .filter((r) => r.outstanding > 0.005);
      const ids = [...new Set(open.map((r) => r.customerId))];
      if (ids.length > 0) {
        const { data, error } = await supabase.from("customers").select("id, name").in("id", ids);
        if (error) throw error;
        const names = new Map<string, string>((data ?? []).map((c) => [c.id, c.name]));
        for (const r of open) r.customerName = names.get(r.customerId) ?? "Unknown";
      }
      return open.sort((a, b) => b.ageDays - a.ageDays || b.outstanding - a.outstanding);
    },
    staleTime: 60_000,
  });
}

export interface WeeklyDay {
  date: string;
  label: string;
  total: number;
  isToday: boolean;
}

export function useWeeklySales() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.weekly(),
    enabled: !!user?.id,
    queryFn: async (): Promise<WeeklyDay[]> => {
      const today = todayIST();
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_date, grand_total")
        .neq("status", "void")
        .gte("invoice_date", isoDaysAgo(6));
      if (error) throw error;
      const byDay = new Map<string, number>();
      const daysTmp: WeeklyDay[] = [];
      const labels = ["S", "M", "T", "W", "T", "F", "S"];
      for (let i = 6; i >= 0; i--) {
        const date = isoDaysAgo(i);
        const dow = new Date(`${date}T00:00:00`).getDay();
        byDay.set(date, 0);
        daysTmp.push({ date, label: labels[dow], total: 0, isToday: date === today });
      }
      for (const r of data ?? []) {
        const key = String(r.invoice_date ?? "").slice(0, 10);
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + Number(r.grand_total ?? 0));
      }
      return daysTmp.map((d) => ({ ...d, total: byDay.get(d.date) ?? 0 }));
    },
    staleTime: 60_000,
  });
}

export function useTodayCollectionsTotal() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.todayCollections(),
    enabled: !!user?.id,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("customer_receipts")
        .select("amount")
        .eq("receipt_date", todayIST())
        .eq("status", "posted");
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    },
  });
}

export interface TodaySplit {
  cash: number;
  upi: number;
}

export function useTodaySplit() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.todaySplit(),
    enabled: !!user?.id,
    queryFn: async (): Promise<TodaySplit> => {
      const { data, error } = await supabase
        .from("customer_receipts")
        .select("mode, amount")
        .eq("receipt_date", todayIST())
        .eq("status", "posted")
        .eq("collected_by", user!.id);
      if (error) throw error;
      const split: TodaySplit = { cash: 0, upi: 0 };
      for (const r of data ?? []) {
        const mode = r.mode as Enums<"receipt_mode">;
        const amt = Number((r as any).amount ?? 0);
        if (mode === "cash") split.cash += amt;
        else if (mode === "upi") split.upi += amt;
      }
      return split;
    },
  });
}

export function useOrders(status?: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.orders(status),
    enabled: !!user?.id,
    queryFn: async (): Promise<OrderRow[]> => {
      const base = supabase
        .from("sales_orders")
        .select(`id, order_no, order_date, status, store_id, notes, created_at,
                 store:customer_stores(name),
                 lines:sales_order_lines(item_id, qty, unit_price, item:items(name))`)
        .order("created_at", { ascending: false })
        .limit(200);
      // status filter: explicit status = exact match; no arg = open statuses
      const q = status
        ? base.eq("status", status as Enums<"order_status">)
        : base.in("status", ["draft", "confirmed", "approved"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        orderNo: r.order_no,
        orderDate: r.order_date,
        status: r.status,
        storeId: r.store_id,
        storeName: r.store?.name ?? null,
        notes: r.notes,
        lines: (r.lines ?? []).map((l: any) => ({
          itemId: l.item_id,
          qty: Number(l.qty ?? 0),
          unitPrice: Number(l.unit_price ?? 0),
          itemName: l.item?.name ?? null,
        })),
      }));
    },
  });
}

export async function placeOrder(header: JsonHeader, lines: JsonLine[]): Promise<string> {
  return rpc<string>("place_order", { p_header: header, p_lines: lines });
}

/**
 * Post a sale. official=true -> GST invoice (SL, invoice.create);
 * official=false -> cash memo (CM, cashmemo.create, no GST). Agents always
 * create cash memos; managers may choose official.
 */
export async function postInvoice(
  header: JsonHeader,
  lines: JsonLine[],
  official = true,
): Promise<string> {
  const fullHeader = { ...header, is_official: String(official) };
  return rpc<string>("post_invoice", { p_header: fullHeader, p_lines: lines });
}

export async function postInvoiceFromOrder(orderId: string, isOfficial: boolean): Promise<string> {
  return rpc<string>("post_invoice_from_order", { p_order: orderId, p_is_official: isOfficial });
}

export async function recordReceipt(header: JsonHeader, allocations: JsonLine[] = []): Promise<string> {
  return rpc<string>("record_receipt", { p_header: header, p_allocations: allocations });
}

export interface OpenInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: number;
  amountPaid: number;
  balance: number;
}

export function useOpenInvoices(customerId: string | null | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.openInvoices(customerId ?? ""),
    enabled: !!user?.id && !!customerId,
    queryFn: async (): Promise<OpenInvoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, grand_total, amount_paid")
        .eq("customer_id", customerId!)
        .in("status", ["posted", "part_paid"])
        .order("invoice_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const grandTotal = Number(r.grand_total ?? 0);
          const amountPaid = Number(r.amount_paid ?? 0);
          return {
            id: r.id,
            invoiceNo: r.invoice_no,
            invoiceDate: r.invoice_date,
            grandTotal,
            amountPaid,
            balance: Math.max(0, grandTotal - amountPaid),
          };
        })
        .filter((r) => r.balance > 0.005);
    },
  });
}

export function useOrder(orderId: string | null | undefined) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.order(orderId ?? ""),
    enabled: !!user?.id && !!orderId,
    queryFn: async (): Promise<OrderRow | null> => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select(`id, order_no, order_date, status, store_id, notes, created_at,
                 store:customer_stores(name),
                 lines:sales_order_lines(item_id, qty, unit_price, item:items(name))`)
        .eq("id", orderId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        orderNo: data.order_no,
        orderDate: data.order_date,
        status: data.status,
        storeId: data.store_id,
        storeName: data.store?.name ?? null,
        notes: data.notes,
        lines: (data.lines ?? []).map((l: any) => ({
          itemId: l.item_id,
          qty: Number(l.qty ?? 0),
          unitPrice: Number(l.unit_price ?? 0),
          itemName: l.item?.name ?? null,
        })),
      };
    },
    staleTime: 0,
  });
}

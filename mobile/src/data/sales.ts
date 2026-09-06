import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { todayIST } from "@/lib/format";
import { rpc } from "@/lib/rpc";
import type { Enums } from "@/lib/db-types";
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
      let q = supabase
        .from("sales_orders")
        .select(`id, order_no, order_date, status, store_id, notes, created_at,
                 store:customer_stores(name),
                 lines:sales_order_lines(item_id, qty, unit_price, item:items(name))`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (status) q = q.eq("status", status as Enums<"order_status">);
      else q = q.in("status", ["draft", "confirmed", "approved"]);
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

export async function postInvoice(header: JsonHeader, lines: JsonLine[]): Promise<string> {
  return rpc<string>("post_invoice", { p_header: header, p_lines: lines });
}

export async function postInvoiceFromOrder(orderId: string, isOfficial: boolean): Promise<string> {
  return rpc<string>("post_invoice_from_order", { p_order: orderId, p_is_official: isOfficial });
}

export async function recordReceipt(header: JsonHeader, allocations: JsonLine[] = []): Promise<string> {
  return rpc<string>("record_receipt", { p_header: header, p_allocations: allocations });
}

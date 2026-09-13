import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpc } from "@/lib/rpc";
import { useSession } from "@/lib/session";
import { qk } from "./keys";
import { remainingOrderLines } from "@/lib/opBuilders";
import type { OrderRow } from "./sales";

export interface ChallanRow {
  id: string;
  challanNo: string;
  challanDate: string;
  status: string;
  orderNo: string | null;
  orderId: string | null;
}

/** Delivery challans visible to this user (RLS: released-only for operators). */
export function useChallans() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.opChallans(),
    enabled: !!user?.id,
    queryFn: async (): Promise<ChallanRow[]> => {
      const { data, error } = await supabase
        .from("delivery_challans")
        .select("id, challan_no, printed_at, status, order_id, order:sales_orders(order_no)")
        .order("printed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        challanNo: r.challan_no,
        challanDate: r.printed_at,
        status: r.status as string,
        orderId: r.order_id as string | null,
        orderNo: (r.order?.order_no as string) ?? null,
      }));
    },
  });
}

export async function setChallanStatus(id: string, status: string): Promise<void> {
  await rpc("set_challan_status", { p_id: id, p_status: status });
}

export async function createChallanForOrder(order: OrderRow): Promise<string> {
  const lines = remainingOrderLines(
    order.lines.map((l) => ({ id: l.lineId, qty: l.qty, qty_fulfilled: l.qtyFulfilled })),
  );
  if (lines.length === 0) throw new Error("Nothing left to deliver on this order");
  return rpc<string>("create_challan", {
    p_header: { order_id: order.id },
    p_lines: lines,
  });
}

/** Fulfil-all & deliver shortcut (RPC creates + delivers, rolls up order). */
export async function postDelivery(orderId: string): Promise<string> {
  return rpc<string>("post_delivery", { p_order: orderId });
}

/** Challan PDF: opens the web print view. */
export function challanPdfUrl(challanId: string): string {
  const base = process.env.EXPO_PUBLIC_WEB_URL ?? "https://newbizz-kappa.vercel.app";
  return `${base}/challans/${challanId}/print`;
}

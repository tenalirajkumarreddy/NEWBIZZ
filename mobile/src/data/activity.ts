import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { isoDaysAgo } from "./transfers";
import { qk } from "./keys";

export interface ActivityRow {
  id: string;
  kind: "sale" | "payment";
  docNo: string;
  name: string | null;
  amount: number;
  createdAt: string;
}

export function useMyActivity() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.activity(),
    enabled: !!user?.id,
    queryFn: async (): Promise<ActivityRow[]> => {
      const uid = user!.id;
      const since = isoDaysAgo(7);
      const [inv, rcpt] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_no, invoice_date, grand_total, created_at, store_id, store:customer_stores(name)")
          .eq("created_by", uid)
          .gte("created_at", since),
        supabase
          .from("customer_receipts")
          .select("id, receipt_no, receipt_date, amount, mode, created_at, store:customer_stores(name), customer:customers(name)")
          .eq("collected_by", uid)
          .gte("created_at", since),
      ]);
      if (inv.error) throw inv.error;
      if (rcpt.error) throw rcpt.error;
      const rows: ActivityRow[] = [
        ...(inv.data ?? []).map((r: any) => ({
          id: r.id,
          kind: "sale" as const,
          docNo: r.invoice_no,
          name: (r.store?.name as string | undefined) ?? null,
          amount: Number(r.grand_total ?? 0),
          createdAt: r.created_at as string,
        })),
        ...(rcpt.data ?? []).map((r: any) => ({
          id: r.id,
          kind: "payment" as const,
          docNo: r.receipt_no,
          name: ((r.customer?.name ?? r.store?.name) as string | undefined) ?? null,
          amount: Number(r.amount ?? 0),
          createdAt: r.created_at as string,
        })),
      ];
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return rows;
    },
  });
}

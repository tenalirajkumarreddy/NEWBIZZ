import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";

export interface StockHoldingRow {
  itemId: string;
  qty: number;
  avgCost: number;
  itemName: string | null;
  sku: string | null;
}

export function useStockHoldings() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.holdings(),
    enabled: !!user?.id,
    queryFn: async (): Promise<StockHoldingRow[]> => {
      const { data, error } = await supabase
        .from("user_stock_holdings")
        .select("item_id, qty, avg_cost, item:items(name, sku)")
        .eq("user_id", user!.id)
        .gt("qty", 0)
        .order("item_id");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        itemId: r.item_id,
        qty: Number(r.qty ?? 0),
        avgCost: Number(r.avg_cost ?? 0),
        itemName: r.item?.name ?? null,
        sku: r.item?.sku ?? null,
      }));
    },
  });
}

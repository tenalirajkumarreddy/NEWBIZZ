import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";

/** The branch-wide fallback price list (server: price_lists where is_default). */
export function useDefaultPriceListId() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["defaultPriceList"],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("price_lists")
        .select("id")
        .eq("is_default", true)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface SellableItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  defaultPrice: number;
  gstRate: number;
  priceLists: { priceListId: string; price: number; minQty: number }[];
}

export function useSellableItems() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.items(),
    enabled: !!user?.id,
    queryFn: async (): Promise<SellableItem[]> => {
      const { data, error } = await supabase
        .from("items")
        .select(`id, name, sku, gst_rate, default_price,
                 unit:units!items_base_unit_id_fkey(code),
                 price_list_items(price_list_id, unit_price, min_qty)`)
        .eq("is_sellable", true)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        sku: r.sku,
        unit: r.unit?.code ?? "",
        defaultPrice: Number(r.default_price ?? 0),
        gstRate: Number(r.gst_rate ?? 0),
        priceLists: (r.price_list_items ?? []).map((p: any) => ({
          priceListId: p.price_list_id,
          price: Number(p.unit_price ?? 0),
          minQty: Number(p.min_qty ?? 0),
        })),
      }));
    },
  });
}

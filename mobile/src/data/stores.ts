import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";

export interface StoreRow {
  id: string; name: string; code: string | null; area: string | null;
  phone: string | null; routeId: string | null; routeName: string | null;
  customerName: string | null; outstanding: number; lat: number | null; lng: number | null;
}

export function useStores(routeId?: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.stores(routeId),
    enabled: !!user?.id,
    queryFn: async (): Promise<StoreRow[]> => {
      let q = supabase
        .from("customer_stores")
        .select(`id, name, code, area, phone, lat, lng, route_id, status,
                 route:routes(name),
                 customer:customers(name)`)
        .eq("status", "active")
        .order("name");
      if (routeId) q = q.eq("route_id", routeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, name: r.name, code: r.code, area: r.area, phone: r.phone,
        routeId: r.route_id, routeName: r.route?.name ?? null,
        customerName: r.customer?.name ?? null, outstanding: 0, // filled lazily per store via store_outstanding in detail
        lat: r.lat, lng: r.lng,
      }));
    },
  });
}

export function useStoreDetail(id: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.store(id),
    enabled: !!user?.id && !!id,
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("customer_stores")
        .select(`*, route:routes(name), customer:customers(id, name, phone, credit_limit)`)
        .eq("id", id).single();
      if (error) throw error;
      const { data: outstanding } = await supabase.rpc("store_outstanding", { p_store: id });
      return { store, outstanding: Number(outstanding ?? 0) };
    },
    staleTime: 0,
  });
}

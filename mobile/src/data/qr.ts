import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { rpc } from "@/lib/rpc";
import { qk } from "./keys";

export interface ResolvedStore {
  found: boolean;
  code: string;
  store_id?: string;
  customer_id?: string;
  store_name?: string;
  customer_name?: string;
  area?: string;
  lat?: number | null;
  lng?: number | null;
  outstanding?: number;
  open_challans?: number;
  can_manage?: boolean;
  can_sell?: boolean;
  can_collect?: boolean;
  can_visit?: boolean;
}

export function useResolveQr(code: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.qr(code),
    enabled: !!user?.id && !!code,
    queryFn: () => rpc<ResolvedStore>("resolve_store_qr", { p_code: code }),
    staleTime: 0,
  });
}

export async function resolveStoreQr(code: string): Promise<ResolvedStore> {
  return rpc<ResolvedStore>("resolve_store_qr", { p_code: code });
}

export async function linkStoreQr(storeId: string, code: string, label?: string): Promise<string> {
  return rpc<string>("link_store_qr", { p_store_id: storeId, p_code: code, p_label: label ?? null });
}

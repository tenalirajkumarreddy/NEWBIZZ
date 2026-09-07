import { useQuery } from "@tanstack/react-query";
import { rpc, RpcError } from "@/lib/rpc";
import { todayIST } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { qk } from "./keys";

export interface CustodyRow {
  transfer_id: string;
  transfer_no: string;
  type: string;
  status: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  responded_at: string | null;
  cash_in_hand: number | null;
}

export function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function myCustody(from?: string, to?: string): Promise<CustodyRow[]> {
  return rpc<CustodyRow[]>("my_transfers_and_custody", {
    p_from: from ?? isoDaysAgo(30),
    p_to: to ?? todayIST(),
  });
}

/**
 * Transfer rows plus the live custody balance (cash_in_hand is repeated on
 * every row by the RPC — it is the current balance, so the most recent row
 * carries it).
 */
export function useMyCustody() {
  const { user } = useSession();
  return useQuery({
    queryKey: qk.custody(),
    enabled: !!user?.id,
    queryFn: () => myCustody(),
  });
}

export async function createCashTransfer(
  toUserId: string | null,
  amount: number,
  note: string | null,
): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new RpcError("You must be signed in");
  return rpc<string>("create_transfer", {
    p_header: {
      type: "cash",
      from_user_id: uid,
      to_user_id: toUserId ?? null,
      amount,
      deposit_account: toUserId ? null : "1120",
      note,
    },
    p_lines: [],
  });
}

export async function respondTransfer(id: string, accept: boolean): Promise<string> {
  return rpc<string>("respond_transfer", { p_id: id, p_accept: accept });
}

export async function cancelTransfer(id: string): Promise<string> {
  return rpc<string>("cancel_transfer", { p_id: id });
}

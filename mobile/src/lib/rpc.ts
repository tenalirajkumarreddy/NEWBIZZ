// mobile/src/lib/rpc.ts
import { supabase } from "./supabase";

export class RpcError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new RpcError(error.message, error.code);
  return data as T;
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/credit limit/i.test(msg)) return "Credit limit exceeded for this customer";
  if (/insufficient|stock/i.test(msg)) return msg; // stock errors are already descriptive
  if (/not authorized|permission|required/i.test(msg)) return "You do not have permission for this action";
  if (/Failed to fetch|Network|fetch/i.test(msg)) return "Network error — check your connection";
  return msg;
}

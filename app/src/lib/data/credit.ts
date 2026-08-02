// =====================================================================
// lib/data/credit.ts — typed reader for the Credit Management register.
//
// Combines the customer master (credit limit / credit days) with the AR aging
// read-model to produce one row per customer: outstanding, utilisation,
// available headroom, over-limit flag, and the per-bucket aging split.
// =====================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrap, type ArAgingRow } from "./types";
import { listCustomers } from "./customers";

export interface CreditRegisterRow {
  id: string;
  code: string;
  name: string;
  kind: string | null;
  phone: string | null;
  status: string;
  creditLimit: number;
  creditDays: number;
  outstanding: number;
  utilisationPct: number;
  available: number;
  overLimit: boolean;
  cashOnly: boolean;
  aging: { bucket: string; amount: number }[];
}

const BUCKET_ORDER = ["current", "0-30", "31-60", "61-90", "90+"];

export async function getCreditRegister(opts: {
  status?: string;
  kind?: string;
  query?: string;
  onlyOverLimit?: boolean;
} = {}): Promise<CreditRegisterRow[]> {
  const supabase = createClient();

  const [customers, agingRes] = await Promise.all([
    listCustomers({
      status: opts.status,
      kind: opts.kind as any,
      query: opts.query,
      limit: 1000,
    }),
    supabase.rpc("get_ar_aging").returns<ArAgingRow[]>(),
  ]);

  const aging = unwrap(agingRes, [] as ArAgingRow[], "getCreditRegister");
  const agingByCustomer = new Map<string, Map<string, number>>();
  for (const r of aging) {
    if (!r.customer_id) continue;
    if (!agingByCustomer.has(r.customer_id)) agingByCustomer.set(r.customer_id, new Map());
    const m = agingByCustomer.get(r.customer_id)!;
    m.set(r.bucket ?? "unknown", (m.get(r.bucket ?? "unknown") ?? 0) + Number(r.outstanding ?? 0));
  }

  const rows: CreditRegisterRow[] = customers.map((c) => {
    const limit = c.creditLimit;
    const outstanding = c.outstanding;
    const util = limit > 0 ? outstanding / limit : 0;
    const buckets = agingByCustomer.get(c.id);
    const agingArr = [...(buckets?.entries() ?? [])]
      .map(([bucket, amount]) => ({ bucket, amount }))
      .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      kind: c.primaryStoreKind,
      phone: c.phone,
      status: c.status,
      creditLimit: limit,
      creditDays: c.creditDays,
      outstanding,
      utilisationPct: Math.round(util * 100),
      available: Math.max(limit - outstanding, 0),
      overLimit: limit > 0 && outstanding > limit,
      cashOnly: limit <= 0,
      aging: agingArr,
    };
  });

  const filtered = opts.onlyOverLimit ? rows.filter((r) => r.overLimit) : rows;
  return filtered.sort((a, b) => b.outstanding - a.outstanding);
}

export interface CreditRegisterSummary {
  totalOutstanding: number;
  totalLimit: number;
  overLimitCount: number;
  cashOnlyCount: number;
  utilisationPct: number;
  buckets: Record<string, number>;
}

export function summariseCredit(rows: CreditRegisterRow[]): CreditRegisterSummary {
  let totalOutstanding = 0;
  let totalLimit = 0;
  let overLimitCount = 0;
  let cashOnlyCount = 0;
  const buckets: Record<string, number> = {};

  for (const r of rows) {
    totalOutstanding += r.outstanding;
    totalLimit += r.creditLimit;
    if (r.overLimit) overLimitCount++;
    if (r.cashOnly) cashOnlyCount++;
    for (const a of r.aging) {
      buckets[a.bucket] = (buckets[a.bucket] ?? 0) + a.amount;
    }
  }

  return {
    totalOutstanding,
    totalLimit,
    overLimitCount,
    cashOnlyCount,
    utilisationPct: totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 100) : 0,
    buckets,
  };
}

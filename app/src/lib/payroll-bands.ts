// =====================================================================
// lib/payroll-bands.ts — client-safe pay-band types + pure lookup.
//
// Lives outside lib/data (every data module is server-only) so client
// components can compute a live ₹ preview from pay_mappings bands.
// The RPC still owns money truth — this is UI preview only.
// =====================================================================

export interface PayMapping {
  id: string;
  hoursMin: number;
  hoursMax: number;
  amount: number;
}

/** First pay_mappings band with hoursMin <= h < hoursMax, else 0. Pure, UI-preview only — the RPC owns money truth. */
export function payForHours(mappings: PayMapping[], hours: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const sorted = [...mappings].sort((a, b) => a.hoursMin - b.hoursMin);
  for (const m of sorted) if (h >= m.hoursMin && h < m.hoursMax) return Number(m.amount);
  return 0;
}

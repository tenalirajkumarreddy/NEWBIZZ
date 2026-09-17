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

/**
 * USER daily-wage preview, mirroring 0121 save_attendance_day's user-credit
 * expression exactly: rounded daily rate (round(monthly_salary/30, 2)) ×
 * factor (present 1.0 | half_day 0.5 | else 0.0) + OT on OT-HOURS
 * (round(ot_rate × ot_hours, 2)). The SQL's paid-leave branch
 * for 'leave' (full daily rate within the allowance) needs the month's leave
 * count, which this signature doesn't carry, so 'leave' previews the
 * conservative else-branch (0 daily) — the ledger remains money truth. Pure,
 * UI-preview only.
 */
export function previewDailyWage(
  person: { monthlySalary: number | null; otRate: number | null },
  hours: number,
  otHours: number,
  status: string,
): number {
  const salary = Number(person.monthlySalary ?? 0) || 0;
  const otRate = Number(person.otRate ?? 0) || 0;
  const otH = Number.isFinite(Number(otHours)) ? Number(otHours) : 0;
  const daily = Math.round((salary / 30.0) * 100) / 100;
  const factor = status === "present" ? 1.0 : status === "half_day" ? 0.5 : 0.0;
  const ot = Math.round(otRate * otH * 100) / 100;
  return Math.round((daily * factor + ot) * 100) / 100;
}

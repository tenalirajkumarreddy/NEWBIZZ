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
 * USER day preview, mirroring 0127 save_attendance_day's user-credit
 * expression exactly:
 *   day rate = round(monthlySalary / days-in-month, 2)
 *   present  → day rate + round(ot_rate × ot_hours, 2)
 *   absent   → day rate while the paid-leave allowance lasts
 *              (existing absences < paidLeaves), 0 beyond it — plus OT.
 * Daily-type users preview their configured dailyRate instead of the salary
 * split (present only — the SQL credits nothing on an absent day for them).
 * Pure, UI-preview only — the RPC owns money truth.
 */
export function previewUserDay(
  person: {
    monthlySalary: number | null;
    dailyRate: number | null;
    otRate: number | null;
    payType: string | null;
    paidLeaves: number | null;
  },
  status: string,
  usedAbsences: number,
  daysInMonth: number,
  otHours: number,
): number {
  const otRate = Number(person.otRate ?? 0) || 0;
  const otH = Number.isFinite(Number(otHours)) ? Number(otHours) : 0;
  const ot = Math.round(otRate * otH * 100) / 100;

  if ((person.payType ?? "monthly") === "daily") {
    if (status !== "present") return ot;
    const daily = Math.round((Number(person.dailyRate ?? 0) || 0) * 100) / 100;
    return Math.round((daily + ot) * 100) / 100;
  }

  const dim = Math.max(28, Math.min(31, Math.round(Number(daysInMonth) || 30)));
  const dayRate = Math.round(((Number(person.monthlySalary ?? 0) || 0) / dim) * 100) / 100;
  const allowed =
    status === "present" || usedAbsences < Math.max(0, Math.round(Number(person.paidLeaves ?? 0) || 0));
  return Math.round((allowed ? dayRate : 0) + ot);
}

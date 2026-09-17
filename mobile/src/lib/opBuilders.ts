export interface StageProgress {
  stage: number;
  targetQty: number;
  producedQty: number;
  jobs: number;
}

export interface JobCountInput {
  stage: number | string;
  target_qty: number | string | null;
  status: string;
}

export interface RunCountInput {
  stage: number | string;
  output_qty: number | string | null;
  abnormal_wastage_value?: number | string | null;
  run_no: string;
  item_name: string | null;
}

/** Today's open-job targets vs posted-run output per stage (1 = Blowing, 2 = Filling). */
export function aggregateTodayProduction(
  jobs: JobCountInput[], runs: RunCountInput[],
): { stages: StageProgress[]; wastage: number } {
  const stages = new Map<number, StageProgress>();
  for (const stage of [1, 2]) {
    stages.set(stage, { stage, targetQty: 0, producedQty: 0, jobs: 0 });
  }
  let wastage = 0;
  for (const j of jobs) {
    const s = stages.get(Number(j.stage));
    if (s && j.status !== "cancelled") {
      s.targetQty += Number(j.target_qty ?? 0);
      s.jobs++;
    }
  }
  for (const r of runs) {
    const s = stages.get(Number(r.stage));
    if (s) s.producedQty += Number(r.output_qty ?? 0);
    wastage += Number(r.abnormal_wastage_value ?? 0);
  }
  return { stages: [...stages.values()], wastage };
}

export function remainingOrderLines(
  lines: { id: string; qty: number; qty_fulfilled: number }[],
): { order_line_id: string; qty: number }[] {
  return lines
    .map((l) => ({ order_line_id: l.id, qty: Number(l.qty) - Number(l.qty_fulfilled ?? 0) }))
    .filter((l) => l.qty > 0);
}

export function buildStockTransferHeader(
  fromBranchId: string, toUserId: string, note?: string | null,
): Record<string, string> {
  const header: Record<string, string> = {
    type: "stock", from_branch_id: fromBranchId, to_user_id: toUserId,
  };
  if (note?.trim()) header.note = note.trim();
  return header;
}

export type CountCheck = "incomplete" | "post" | "zero" | "short";

/**
 * Closing-stock mode: classify counted physical stock against the current
 * book balance. "post" means a positive production delta exists
 * (counted - book); "zero" means nothing to post; "short" means the count
 * is BELOW the book (likely unposted sales/issues - reconcile, never post
 * a negative run).
 */
export function checkCountPost(
  counted: number | null, book: number | null,
): CountCheck {
  if (book == null || !Number.isFinite(book)) return "incomplete";
  if (counted == null || !Number.isFinite(counted) || counted < 0) return "incomplete";
  if (counted === 0 && book === 0) return "incomplete";
  const delta = counted - book;
  if (delta > 1e-9) return "post";
  if (delta > -1e-9) return "zero";
  return "short";
}

export interface PayMapping { id: string; hoursMin: number; hoursMax: number; amount: number }

/** First band with hoursMin <= h < hoursMax, else 0. Pure display helper — the RPC owns money. */
export function payForHours(mappings: PayMapping[], hours: number): number {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const sorted = [...mappings].sort((a, b) => a.hoursMin - b.hoursMin);
  for (const m of sorted) if (h >= m.hoursMin && h < m.hoursMax) return Number(m.amount);
  return 0;
}

/** User daily wage preview. Mirrors the SQL user branch exactly
 * (round(salary/30,2)×factor + round(ot×otHours,2)); leave is display-0
 * (server's paid-leave branch needs month context). */
export function previewDailyWage(
  person: { monthlySalary: number | null; otRate: number | null },
  hours: number, otHours: number, status: string,
): number {
  const salary = Number(person.monthlySalary ?? 0) || 0;
  const otRate = Number(person.otRate ?? 0) || 0;
  const h = Number.isFinite(Number(hours)) ? Number(hours) : 0;
  const otH = Number.isFinite(Number(otHours)) ? Number(otHours) : 0;
  const daily = Math.round((salary / 30.0) * 100) / 100;
  const factor = status === "present" ? 1.0 : status === "half_day" ? 0.5 : 0.0;
  return Math.round((daily * factor + Math.round(otRate * otH * 100) / 100) * 100) / 100;
}

/** 6×7 Monday-first grid of ISO date strings for year/month0, null = pad. */
export function buildMonthGrid(year: number, month0: number): (string | null)[][] {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDow = (new Date(year, month0, 1).getDay() + 6) % 7; // 0 = Monday
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month0 + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}

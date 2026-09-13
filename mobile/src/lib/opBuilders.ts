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

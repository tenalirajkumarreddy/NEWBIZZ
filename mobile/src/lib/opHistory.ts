import type { ActivityRow } from "@/data/activity";
import type { RunHistoryRow } from "@/data/operator";

export type OpActivityRow = ActivityRow | {
  id: string; kind: "run"; docNo: string; name: string | null; amount: number; createdAt: string;
};

export function mergeOperatorActivity(
  activity: ActivityRow[], runs: RunHistoryRow[],
): OpActivityRow[] {
  const runRows: OpActivityRow[] = runs.map((r) => ({
    id: r.id, kind: "run" as const, docNo: r.runNo, name: r.itemName, amount: r.outputQty, createdAt: r.createdAt,
  }));
  return [...activity, ...runRows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

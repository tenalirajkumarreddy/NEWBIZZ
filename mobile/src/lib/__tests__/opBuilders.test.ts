import {
  aggregateTodayProduction, remainingOrderLines, buildStockTransferHeader,
} from "../opBuilders";

describe("aggregateTodayProduction", () => {
  const jobs = [
    { stage: 1, target_qty: 100, status: "pending" },
    { stage: 1, target_qty: 50, status: "in_progress" },
    { stage: 1, target_qty: 999, status: "cancelled" },
    { stage: 2, target_qty: null, status: "pending" },
    { stage: 3, target_qty: 10, status: "pending" },
  ];
  const runs = [
    { stage: 1, output_qty: 80, abnormal_wastage_value: 12.5, run_no: "R1", item_name: "Preform" },
    { stage: 1, output_qty: null, abnormal_wastage_value: null, run_no: "R2", item_name: null },
    { stage: 2, output_qty: 300, abnormal_wastage_value: 7.5, run_no: "R3", item_name: "Bottle" },
  ];
  it("sums non-cancelled targets per stage, ignores unknown stages", () => {
    const { stages } = aggregateTodayProduction(jobs, runs);
    const s1 = stages.find((x) => x.stage === 1)!;
    const s2 = stages.find((x) => x.stage === 2)!;
    expect(s1.targetQty).toBe(150);
    expect(s1.jobs).toBe(2);
    expect(s2.targetQty).toBe(0);
    expect(stages.every((x) => x.stage === 1 || x.stage === 2)).toBe(true);
  });
  it("sums produced qty per stage with nulls as 0", () => {
    const { stages } = aggregateTodayProduction(jobs, runs);
    expect(stages.find((x) => x.stage === 1)!.producedQty).toBe(80);
    expect(stages.find((x) => x.stage === 2)!.producedQty).toBe(300);
  });
  it("sums abnormal wastage across all runs", () => {
    expect(aggregateTodayProduction(jobs, runs).wastage).toBe(20);
  });
});

describe("remainingOrderLines", () => {
  it("drops fully-fulfilled and zero-remaining lines", () => {
    const lines = [
      { id: "a", qty: 10, qty_fulfilled: 4 },
      { id: "b", qty: 6, qty_fulfilled: 6 },
      { id: "c", qty: 0, qty_fulfilled: 0 },
    ];
    expect(remainingOrderLines(lines)).toEqual([
      { order_line_id: "a", qty: 6 },
    ]);
  });
});

describe("buildStockTransferHeader", () => {
  it("matches the web wh2user create_transfer shape", () => {
    expect(buildStockTransferHeader("br-1", "u-2", "note x")).toEqual({
      type: "stock", from_branch_id: "br-1", to_user_id: "u-2", note: "note x",
    });
    expect(buildStockTransferHeader("br-1", "u-2")).toEqual({
      type: "stock", from_branch_id: "br-1", to_user_id: "u-2",
    });
  });
});

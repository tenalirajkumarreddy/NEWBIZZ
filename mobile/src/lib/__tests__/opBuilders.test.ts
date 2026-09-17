import {
  aggregateTodayProduction, remainingOrderLines, buildStockTransferHeader, checkCountPost,
  payForHours, previewDailyWage, buildMonthGrid, runningBalances,
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

describe("checkCountPost", () => {
  it("posts a positive delta above book", () => {
    expect(checkCountPost(150, 50)).toBe("post");
    expect(checkCountPost(50.5, 50)).toBe("post");
  });
  it("zero delta is nothing-to-post", () => {
    expect(checkCountPost(50, 50)).toBe("zero");
  });
  it("count below book is short - never a negative run", () => {
    expect(checkCountPost(40, 50)).toBe("short");
    expect(checkCountPost(0, 50)).toBe("short");
  });
  it("empty or unusable inputs are incomplete", () => {
    expect(checkCountPost(null, 50)).toBe("incomplete");
    expect(checkCountPost(150, null)).toBe("incomplete");
    expect(checkCountPost(0, 0)).toBe("incomplete");
    expect(checkCountPost(Number.NaN, 50)).toBe("incomplete");
  });
});

describe("payForHours", () => {
  const bands = [
    { id: "a", hoursMin: 0, hoursMax: 4, amount: 300 },
    { id: "b", hoursMin: 4, hoursMax: 8, amount: 600 },
    { id: "c", hoursMin: 8, hoursMax: 10, amount: 750 },
  ];
  it("matches min-inclusive/max-exclusive first band", () => {
    expect(payForHours(bands, 9)).toBe(750);
    expect(payForHours(bands, 8)).toBe(750);
    expect(payForHours(bands, 7.99)).toBe(600);
    expect(payForHours(bands, 0)).toBe(0);
    expect(payForHours(bands, -1)).toBe(0);
    expect(payForHours([], 9)).toBe(0);
  });
  it("ignores input order", () => {
    expect(payForHours([...bands].reverse(), 3)).toBe(300);
  });
});

describe("previewDailyWage", () => {
  const p = { monthlySalary: 18000, otRate: 75 };
  it("salary/30 factor + ot term", () => {
    expect(previewDailyWage(p, 9, 0, "present")).toBe(600);
    expect(previewDailyWage(p, 9, 2, "present")).toBe(750);
    expect(previewDailyWage(p, 9, 0, "half_day")).toBe(300);
    expect(previewDailyWage(p, 9, 0, "leave")).toBe(0);
    expect(previewDailyWage(p, 0, 2, "holiday")).toBe(150);
    expect(previewDailyWage({ monthlySalary: null, otRate: null }, 9, 0, "present")).toBe(0);
  });
});

describe("runningBalances", () => {
  it("accumulates a running total over ascending ledger amounts", () => {
    expect(runningBalances([100, -40, 0])).toEqual([100, 60, 60]);
  });
  it("empty stays empty", () => {
    expect(runningBalances([])).toEqual([]);
  });
});

describe("buildMonthGrid", () => {
  it("pads Monday-first with nulls and covers every day once", () => {
    const g = buildMonthGrid(2026, 8); // September 2026
    expect(g).toHaveLength(6);
    expect(g.every((r) => r.length === 7)).toBe(true);
    const days = g.flat().filter(Boolean) as string[];
    expect(days).toHaveLength(30);
    expect(new Set(days).size).toBe(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[29]).toBe("2026-09-30");
  });
  it("starts Monday: 2026-02-01 was a Sunday, so first cell is null", () => {
    const g = buildMonthGrid(2026, 1);
    expect(g[0][6]).toBe("2026-02-01");
    expect(g[0][0]).toBe(null);
  });
});

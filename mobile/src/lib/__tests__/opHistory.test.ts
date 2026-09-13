import { mergeOperatorActivity } from "../opHistory";

it("merges sales, payments and runs newest-first with distinct kinds", () => {
  const out = mergeOperatorActivity(
    [
      { id: "i1", kind: "sale", docNo: "CM-1", name: "Store A", amount: 100, createdAt: "2026-09-13T09:00:00Z" },
      { id: "p1", kind: "payment", docNo: "RC-1", name: "Store B", amount: 50, createdAt: "2026-09-13T10:00:00Z" },
    ],
    [
      { id: "r1", runNo: "PR-9", runDate: "2026-09-13", stage: 1, outputQty: 200, unitCost: 1, wastage: 0, status: "posted", notes: null, createdAt: "2026-09-13T11:00:00Z", itemName: "Preform", posterName: "Me" },
    ],
  );
  expect(out.map((r) => r.kind)).toEqual(["run", "payment", "sale"]);
  expect(out[0].docNo).toBe("PR-9");
  expect(out[0].name).toBe("Preform");
});

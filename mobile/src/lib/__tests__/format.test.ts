import { moneyINR, moneyCompact, todayIST } from "../format";

describe("moneyINR", () => {
  it("groups Indian style", () => {
    expect(moneyINR(123456.5)).toBe("₹1,23,456.50");
    expect(moneyINR(0)).toBe("₹0.00");
  });
});

describe("moneyCompact", () => {
  it("uses lakh and crore", () => {
    expect(moneyCompact(184000)).toBe("₹1.84L");
    expect(moneyCompact(64300000)).toBe("₹6.43Cr");
    expect(moneyCompact(9900)).toBe("₹9,900");
  });
});

describe("todayIST", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { AGENT_TABS, MANAGER_TABS, OPERATOR_TABS, tabsForRole, HOME_TAB } from "../tabs";

describe("operator tabs", () => {
  it("has 7 tabs with scan as the single center FAB", () => {
    expect(OPERATOR_TABS).toHaveLength(7);
    expect(OPERATOR_TABS.map((t) => t.id)).toEqual(
      ["dash-op", "orders", "inventory", "scan", "production", "workers", "history"]);
    expect(OPERATOR_TABS.filter((t) => t.center).map((t) => t.id)).toEqual(["scan"]);
  });
  it("has no duplicate icons", () => {
    const icons = OPERATOR_TABS.map((t) => t.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("tabsForRole", () => {
  it("operator wins over agent", () => {
    expect(tabsForRole(["operator", "agent"])).toBe(OPERATOR_TABS);
  });
  it("agent wins over manager-only", () => {
    expect(tabsForRole(["agent"])).toBe(AGENT_TABS);
    expect(tabsForRole(["manager"])).toBe(MANAGER_TABS);
    expect(tabsForRole([])).toBe(MANAGER_TABS);
  });
});

it("HOME_TAB lands operators on the dashboard", () => {
  expect(HOME_TAB).toEqual({ operator: "dash-op", agent: "home", manager: "dash" });
});

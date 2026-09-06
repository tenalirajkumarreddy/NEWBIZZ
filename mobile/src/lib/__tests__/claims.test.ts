import { parseClaims, can, roleLabel } from "../claims";

const user = (claims: object) => ({
  app_metadata: claims,
}) as any;

describe("parseClaims", () => {
  it("reads roles/perms/status from custom claims", () => {
    const c = parseClaims(user({ roles: ["agent"], perms: ["cashmemo.create", "receipt.record"], user_status: "active" }));
    expect(c.roles).toEqual(["agent"]);
    expect(c.perms).toContain("cashmemo.create");
    expect(c.status).toBe("active");
  });
  it("admin role implies all perms", () => {
    expect(can(parseClaims(user({ roles: ["admin"], perms: [] })), "order.approve")).toBe(true);
  });
  it("missing perm denies", () => {
    expect(can(parseClaims(user({ roles: ["agent"], perms: ["order.view"] })), "order.approve")).toBe(false);
  });
  it("role label reflects agent role", () => {
    expect(roleLabel(parseClaims(user({ roles: ["agent"] })))).toBe("Field agent");
    expect(roleLabel(parseClaims(user({ roles: ["manager"] })))).toBe("Manager");
    expect(roleLabel(parseClaims(user({})))).toBe("Manager");
  });
});

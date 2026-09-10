import { readClaimsFromMetadata, parseAccessToken, can, roleLabel, isGatedStatus } from "../claims";

const b64url = (obj: object) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const tokenFor = (appMetadata: object) =>
  `header.${b64url({ app_metadata: appMetadata })}.signature`;

describe("readClaimsFromMetadata", () => {
  it("reads roles/perms/status from custom claims", () => {
    const c = readClaimsFromMetadata({
      roles: ["agent"],
      perms: ["cashmemo.create", "receipt.record"],
      user_status: "active",
    });
    expect(c.roles).toEqual(["agent"]);
    expect(c.perms).toContain("cashmemo.create");
    expect(c.status).toBe("active");
  });
  it("yields safe empties for missing/legacy metadata", () => {
    expect(readClaimsFromMetadata(undefined)).toEqual({ roles: [], perms: [], status: "" });
    expect(readClaimsFromMetadata({})).toEqual({ roles: [], perms: [], status: "" });
  });
});

describe("parseAccessToken (JWT path — the real source)", () => {
  it("decodes claims from the token payload", () => {
    const c = parseAccessToken(tokenFor({ roles: ["agent"], perms: ["order.view"], user_status: "active" }));
    expect(c.roles).toEqual(["agent"]);
    expect(c.perms).toEqual(["order.view"]);
    expect(c.status).toBe("active");
  });
  it("ignores the persisted user record shape (no roles there)", () => {
    expect(parseAccessToken(tokenFor({ provider: "phone" })).roles).toEqual([]);
  });
  it("returns empty claims for malformed input", () => {
    expect(parseAccessToken(null)).toEqual({ roles: [], perms: [], status: "" });
    expect(parseAccessToken("not-a-jwt")).toEqual({ roles: [], perms: [], status: "" });
    expect(parseAccessToken("a.b.c!")).toEqual({ roles: [], perms: [], status: "" });
  });
});

describe("can", () => {
  it("admin role implies all perms", () => {
    expect(can(readClaimsFromMetadata({ roles: ["admin"], perms: [], user_status: "active" }), "order.approve")).toBe(true);
  });
  it("missing perm denies", () => {
    expect(can(readClaimsFromMetadata({ roles: ["agent"], perms: ["order.view"], user_status: "active" }), "order.approve")).toBe(false);
  });
  it("non-active status denies everything", () => {
    expect(can(readClaimsFromMetadata({ roles: ["admin"], perms: [], user_status: "suspended" }), "order.approve")).toBe(false);
    expect(can(readClaimsFromMetadata({ roles: ["agent"], perms: ["order.view"], user_status: "" }), "order.view")).toBe(false);
  });
});

describe("isGatedStatus", () => {
  it("gates review/activation/pending/suspended/disabled, allows active", () => {
    expect(isGatedStatus("pending_review")).toBe(true);
    expect(isGatedStatus("pending_activation")).toBe(true);
    expect(isGatedStatus("pending")).toBe(true);
    expect(isGatedStatus("suspended")).toBe(true);
    expect(isGatedStatus("disabled")).toBe(true);
    expect(isGatedStatus("active")).toBe(false);
  });
});

describe("roleLabel", () => {
  it("reflects agent role", () => {
    expect(roleLabel(readClaimsFromMetadata({ roles: ["agent"] }))).toBe("Field agent");
  });
  it("manager and admin are Manager", () => {
    expect(roleLabel(readClaimsFromMetadata({ roles: ["manager"] }))).toBe("Manager");
    expect(roleLabel(readClaimsFromMetadata({ roles: ["admin"] }))).toBe("Manager");
  });
  it("empty roles are Staff, not Manager", () => {
    expect(roleLabel(readClaimsFromMetadata({}))).toBe("Staff");
  });
});

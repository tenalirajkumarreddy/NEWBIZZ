import { haversineKm } from "../geo";

describe("haversineKm", () => {
  it("zero distance", () => {
    const p = { lat: 11.6643, lng: 78.146 };
    expect(haversineKm(p, p)).toBe(0);
  });
  it("salem to coimbatore ~160km", () => {
    const salem = { lat: 11.6643, lng: 78.146 };
    const cbe = { lat: 11.0168, lng: 76.9558 };
    const d = haversineKm(salem, cbe);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(180);
  });
});

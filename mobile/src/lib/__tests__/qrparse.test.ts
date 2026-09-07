import { parseQrPayload } from "../qrparse";

describe("parseQrPayload", () => {
  it("parses scheme url", () => {
    expect(parseQrPayload("newbizz://s/NB-0142")).toBe("NB-0142");
  });

  it("parses https link", () => {
    expect(parseQrPayload("https://newbizz.in/s/NB-0142?x=1")).toBe("NB-0142");
  });

  it("accepts bare code", () => {
    expect(parseQrPayload("NB-0142")).toBe("NB-0142");
  });

  it("rejects junk", () => {
    expect(parseQrPayload("hello world")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(parseQrPayload("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(parseQrPayload("   ")).toBeNull();
  });

  it("rejects scheme url with space in code", () => {
    expect(parseQrPayload("newbizz://s/NB-01 with space")).toBeNull();
  });

  it("trims surrounding whitespace on bare codes", () => {
    expect(parseQrPayload("  NB-0142  ")).toBe("NB-0142");
  });

  it("rejects https link without /s/ path", () => {
    expect(parseQrPayload("https://newbizz.in/other/NB-0142")).toBeNull();
  });

  it("rejects scheme url with empty code", () => {
    expect(parseQrPayload("newbizz://s/")).toBeNull();
  });

  it("rejects too-short bare codes", () => {
    expect(parseQrPayload("ab")).toBeNull();
  });

  it("rejects bare code with internal whitespace", () => {
    expect(parseQrPayload("NB-0142\textra")).toBeNull();
  });
});

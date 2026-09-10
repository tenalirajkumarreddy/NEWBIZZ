import { parseQrPayload } from "../qrparse";

describe("parseQrPayload - NEWBIZZ native codes", () => {
  it("parses scheme url", () => {
    expect(parseQrPayload("newbizz://s/NB-0142")?.code).toBe("NB-0142");
    expect(parseQrPayload("newbizz://s/NB-0142")?.kind).toBe("newbizz");
  });

  it("parses https link", () => {
    expect(parseQrPayload("https://newbizz.in/s/NB-0142?x=1")?.code).toBe("NB-0142");
  });

  it("accepts bare code", () => {
    expect(parseQrPayload("NB-0142")?.code).toBe("NB-0142");
    expect(parseQrPayload("NB-0142")?.kind).toBe("text");
  });

  it("scheme url with space falls back to a stable hash code", () => {
    const r = parseQrPayload("newbizz://s/NB-01 with space");
    expect(r?.code).toMatch(/^QR-[0-9a-f]{12}$/);
  });

  it("rejects https link without /s/ path but yields a hash code", () => {
    const a = parseQrPayload("https://newbizz.in/other/NB-0142");
    const b = parseQrPayload("https://newbizz.in/other/NB-0142");
    expect(a?.code).toBe(b?.code);
    expect(a?.code).toMatch(/^QR-/);
  });

  it("scheme url with empty code falls back to a hash code", () => {
    const r = parseQrPayload("newbizz://s/");
    expect(r?.code).toMatch(/^QR-[0-9a-f]{12}$/);
  });

  it("too-short bare codes fall back to a hash code", () => {
    const r = parseQrPayload("ab");
    expect(r?.code).toMatch(/^QR-[0-9a-f]{12}$/);
  });
});

describe("parseQrPayload - shop payment QRs (the convention)", () => {
  it("extracts VPA from a upi:// payload", () => {
    const r = parseQrPayload("upi://pay?pa=newbizz@ybl&pn=Sri%20Balaji&cu=INR");
    expect(r?.code).toBe("newbizz@ybl");
    expect(r?.kind).toBe("upi");
    expect(r?.payee).toBe("Sri Balaji");
  });

  it("extracts VPA from a PhonePe-style deep link", () => {
    const r = parseQrPayload("phonepe://pay?pa=9876543210@ybl&pn=Store&tr=123");
    expect(r?.code).toBe("9876543210@ybl");
  });

  it("extracts pa from Bharat-QR JSON", () => {
    const r = parseQrPayload('{"v":"1","pa":"shop@paytm","pn":"Guntur Traders","mc":"5411"}');
    expect(r?.code).toBe("shop@paytm");
    expect(r?.kind).toBe("json");
    expect(r?.payee).toBe("Guntur Traders");
  });

  it("same physical QR always yields the same code (stability)", () => {
    const payload = "upi://pay?pa=stable@ibl&pn=X&cu=INR";
    expect(parseQrPayload(payload)?.code).toBe(parseQrPayload(payload)?.code);
  });

  it("hashes generic https URLs deterministically", () => {
    const a = parseQrPayload("https://phone.pe/abc123");
    const b = parseQrPayload("https://phone.pe/abc123");
    expect(a?.code).toBe(b?.code);
    expect(a?.code).toMatch(/^QR-[0-9a-f]{12}$/);
    expect(a?.payee).toBe("phone.pe");
  });

  it("folds whitespace in legacy bare codes", () => {
    expect(parseQrPayload("NB-STORE 2")?.code).toBe("NB-STORE-2");
  });

  it("multi-line payloads fold to a single code-shaped token", () => {
    const a = parseQrPayload("Sri Balaji\nTraders\nMain Road");
    const b = parseQrPayload("Sri Balaji\nTraders\nMain Road");
    expect(a?.code).toBe(b?.code);
    expect(a?.code).toMatch(/^[A-Za-z0-9._@-]+$/);
  });
});

describe("parseQrPayload - junk handling", () => {
  it("rejects empty string", () => {
    expect(parseQrPayload("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(parseQrPayload("   ")).toBeNull();
  });

  it("trims surrounding whitespace on bare codes", () => {
    expect(parseQrPayload("  NB-0142  ")?.code).toBe("NB-0142");
  });

  it("malformed JSON with no pa falls back to a hash code", () => {
    const r = parseQrPayload('{"broken": true');
    expect(r?.code).toMatch(/^QR-[0-9a-f]{12}$/);
  });
});

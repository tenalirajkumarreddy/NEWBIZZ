import QRCode from "qrcode";

export type DocQrKind = "inv" | "chl" | "ord" | "cn";

/**
 * Inline SVG string for NEWBIZZ document QRs (universal document scan):
 * `newbizz://d/{kind}/{id}`. Every generated document/report embeds this so
 * scanning the paper opens the document in the APK (mobile parseDocQr).
 *
 * Server-side helper (the qrcode lib must never reach the client bundle);
 * async because the encoder is promise-based. `id` is a uuid produced by the
 * DB and `kind` is a closed union, so no untrusted text enters the payload.
 */
export async function docQrSvg(kind: DocQrKind, id: string, size = 96): Promise<string> {
  return QRCode.toString(`newbizz://d/${kind}/${id}`, {
    type: "svg",
    margin: 1,
    width: size,
    color: { dark: "#0f172a", light: "#00000000" },
  });
}

/**
 * UPI payment QR (the `upi://` intent every Indian payer app scans):
 *   upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>
 * Printed on the invoice template so the shop can pay by scanning the paper.
 * `name`/`note` are entity-derived (company trade name, invoice no) — still
 * encodeURIComponent-guarded since they render into a URI. `amount` must be
 * > 0 (a ₹0 payment intent is rejected by payer apps).
 */
export async function upiQrSvg(opts: {
  upiId: string;
  name: string;
  amount: number;
  note?: string;
  size?: number;
}): Promise<string> {
  const params = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.name,
    am: opts.amount.toFixed(2),
    cu: "INR",
  });
  if (opts.note) params.set("tn", opts.note);
  return QRCode.toString(`upi://pay?${params.toString()}`, {
    type: "svg",
    margin: 1,
    width: opts.size ?? 96,
    color: { dark: "#0f172a", light: "#00000000" },
  });
}

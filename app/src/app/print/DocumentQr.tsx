import { docQrSvg } from "@/lib/qr";

export type { DocQrKind } from "@/lib/qr";

/**
 * Inline SVG QR for NEWBIZZ document codes (universal document scan).
 * Renders `newbizz://d/{kind}/{id}` so scanning a printed document opens it
 * in the APK; unknown codes fall through to the store-code path and the
 * store flow handles them.
 *
 * Server component: zero client JS in the print surface. `size` is px.
 */
export async function DocumentQr({ kind, id, size = 96 }: { kind: "inv" | "chl" | "ord"; id: string; size?: number }) {
  const svg = await docQrSvg(kind, id, size);
  return (
    <div
      style={{ width: size, height: size }}
      // svg from the qrcode lib is trusted markup (no user input reaches it
      // beyond the uuid in the payload, which is regex-validated uuid chars)
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Document QR code"
    />
  );
}

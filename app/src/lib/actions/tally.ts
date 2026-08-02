"use server";

import { buildTallyXml } from "@/lib/data/tally";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =====================================================================
// Tally export action (F8). Wraps the XML builder so the Day Book page can
// download an importable Tally file. Validation is light here - the builder
// throws a friendly message when the range is empty.
// =====================================================================

export async function exportTallyXml(opts: { from: string; to: string }): Promise<
  ActionResult<{ xml: string; fileName: string; voucherCount: number; ledgerCount: number }>
> {
  if (!opts.from || !opts.to) return { ok: false, error: "Pick a date range to export." };
  if (opts.from > opts.to) return { ok: false, error: "From date is after the to date." };
  try {
    const res = await buildTallyXml({ from: opts.from, to: opts.to });
    return {
      ok: true,
      xml: res.xml,
      fileName: res.fileName,
      voucherCount: res.voucherCount,
      ledgerCount: res.ledgerCount,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tally export failed." };
  }
}

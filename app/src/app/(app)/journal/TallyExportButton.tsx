"use client";

// =====================================================================
// journal/TallyExportButton.tsx - "Export Tally" header action (F8).
//
// Opens a small dialog to pick a date range, calls the server action that
// builds the importable Tally XML, then downloads it as a .xml file. The
// range defaults to the current financial year passed from the server page.
// =====================================================================

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, controlBase } from "@/components/ui/Field";
import { exportTallyXml } from "@/lib/actions/tally";

export function TallyExportButton({ from, to }: { from: string; to: string }) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onExport() {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await exportTallyXml({ from: fromDate, to: toDate });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const blob = new Blob([res.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.fileName;
    a.click();
    URL.revokeObjectURL(url);
    setDone(`${res.voucherCount} vouchers · ${res.ledgerCount} ledgers`);
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Export Tally XML
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export to Tally"
        description="Downloads an importable Tally XML: chart-of-accounts ledgers + posted journal vouchers in the date range."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onExport} loading={busy}>
              {busy ? "Building…" : "Download XML"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="tally-from">
              <input
                id="tally-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={controlBase + " h-9 px-3"}
              />
            </Field>
            <Field label="To" htmlFor="tally-to">
              <input
                id="tally-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={controlBase + " h-9 px-3"}
              />
            </Field>
          </div>

          {error && <p className="text-[12px] font-medium text-red">{error}</p>}
          {done && <p className="text-[12px] font-medium text-green-700">{done} — file downloaded.</p>}
        </div>
      </Dialog>
    </>
  );
}

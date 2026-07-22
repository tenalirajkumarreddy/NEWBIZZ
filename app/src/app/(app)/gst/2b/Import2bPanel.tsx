"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { count as fmtCount } from "@/lib/format";
import { importGstr2b, type Gstr2bInputRow } from "@/lib/actions/gst";

// Parse pasted GSTR-2B rows. Accepts CSV or TSV, one invoice per line, columns:
//   GSTIN, invoice_no, invoice_date, taxable, cgst, sgst, igst, [cess]
// A header line containing "gstin" is skipped.
function parseRows(text: string): Gstr2bInputRow[] {
  const out: Gstr2bInputRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/gstin/i.test(line) && /invoice/i.test(line)) continue; // header
    const c = line.split(/[\t,]/).map((x) => x.trim());
    if (c.length < 4) continue;
    const num = (v: string | undefined) => {
      const n = Number((v ?? "").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    out.push({
      supplier_gstin: c[0] || undefined,
      invoice_no: c[1] || undefined,
      invoice_date: c[2] || undefined,
      taxable: num(c[3]),
      cgst: num(c[4]),
      sgst: num(c[5]),
      igst: num(c[6]),
      cess: num(c[7]),
    });
  }
  return out;
}

const todayPeriod = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);

export function Import2bPanel({ defaultPeriod }: { defaultPeriod: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState(defaultPeriod || todayPeriod());
  const [text, setText] = useState("");

  const parsed = parseRows(text);

  function onImport() {
    if (parsed.length === 0) {
      toast.error("Nothing to import", "Paste at least one GSTR-2B row.");
      return;
    }
    startTransition(async () => {
      const res = await importGstr2b(period, parsed);
      if (res.ok) {
        toast.success("2B imported", `${parsed.length} rows for ${period}.`);
        setText("");
        setOpen(false);
        router.push(`/gst/2b/${res.importId}`);
        router.refresh();
      } else {
        toast.error("Could not import", res.error);
      }
    });
  }

  if (!open) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">Import GSTR-2B</div>
          <p className="mt-0.5 text-[12px] text-ink-3">Paste rows from the portal&rsquo;s downloaded 2B, then reconcile.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Import 2B</Button>
      </Card>
    );
  }

  return (
    <Panel title="Import GSTR-2B" flush>
      <div className="flex flex-col gap-3 p-4">
        <Field label="Period" required hint="The month the 2B statement covers">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48" />
        </Field>
        <Field
          label="Rows"
          hint="One invoice per line — GSTIN, invoice no, date (YYYY-MM-DD), taxable, cgst, sgst, igst[, cess]. CSV or tab-separated; a header row is ignored."
        >
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"29ABCDE1234F1Z5, INV-101, 2026-07-04, 10000, 900, 900, 0\n27PQRSX9876G1Z2, B-88, 2026-07-11, 50000, 0, 0, 9000"}
            className="font-mono text-[12px]"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12px] text-ink-4">{fmtCount(parsed.length)} rows detected</span>
          <Button variant="ghost" size="sm" onClick={() => { setText(""); setOpen(false); }} disabled={pending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onImport} loading={pending} disabled={parsed.length === 0}>
            Import {parsed.length > 0 ? `${parsed.length} rows` : ""}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Textarea, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { importBankStatement } from "@/lib/actions/bank";
import type { AccountType } from "@/lib/data/bank";

interface Props {
  accountId: string;
  accountType: AccountType;
}

function parseCsv(text: string): { txnDate: string; amount: number; description?: string; refNo?: string }[] {
  const lines = text.trim().split("\n").filter(Boolean);
  return lines.map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const txnDate = cols[0];
    const amount = parseFloat(cols[1]);
    const description = cols[2] || undefined;
    const refNo = cols[3] || undefined;
    return { txnDate, amount, description, refNo };
  }).filter((r) => !isNaN(r.amount) && r.txnDate);
}

export function ImportStatement({ accountId, accountType }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    if (!raw.trim()) { toast.error("Paste statement data first"); return; }
    setImporting(true);
    try {
      const rows = parseCsv(raw);
      if (rows.length === 0) { toast.error("No valid rows found"); setImporting(false); return; }

      const result = await importBankStatement(accountId, rows, {
        fileName: `manual-${new Date().toISOString().split("T")[0]}.csv`,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        closingBalance: closingBalance ? parseFloat(closingBalance) : undefined,
      });

      toast.success(`Imported ${result.inserted} rows (${result.duplicates} duplicates)`);
      setRaw("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const preview = raw.trim() ? parseCsv(raw) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Period Start">
          <Input type="date" value={periodStart} onChange={(e: any) => setPeriodStart(e.target.value)} />
        </Field>
        <Field label="Period End">
          <Input type="date" value={periodEnd} onChange={(e: any) => setPeriodEnd(e.target.value)} />
        </Field>
        <Field label={`Closing ${accountType === "credit_card" ? "Outstanding" : "Balance"}`}>
          <Input type="number" step="0.01" value={closingBalance} onChange={(e: any) => setClosingBalance(e.target.value)} placeholder="e.g. 125000.00" />
        </Field>
      </div>

      <Field label="Statement Data (CSV: date, amount, description, ref)">
        <Textarea
          rows={10}
          value={raw}
          onChange={(e: any) => setRaw(e.target.value)}
          placeholder={`2026-07-01,15000.00,Sale payment,INV-001\n2026-07-02,-2500.00,Electricity bill,UTIL-101`}
          className="font-mono text-[13px]"
        />
      </Field>

      {preview.length > 0 && (
        <div className="rounded-lg border border-line">
          <div className="border-b border-line bg-fill px-3 py-1.5 text-[12px] font-medium text-ink-3">
            Preview: {preview.length} rows
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-3">
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5 text-right">Amount</th>
                  <th className="px-3 py-1.5">Description</th>
                  <th className="px-3 py-1.5">Ref</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-1 text-ink">{r.txnDate}</td>
                    <td className={`px-3 py-1 text-right tabular-nums font-medium ${r.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ₹{Math.abs(r.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      <span className="ml-1 text-[11px] text-ink-3">{r.amount >= 0 ? "Cr" : "Dr"}</span>
                    </td>
                    <td className="px-3 py-1 text-ink-3">{r.description ?? "—"}</td>
                    <td className="px-3 py-1 text-ink-3">{r.refNo ?? "—"}</td>
                  </tr>
                ))}
                {preview.length > 20 && (
                  <tr><td colSpan={4} className="px-3 py-1 text-center text-[12px] text-ink-3">...and {preview.length - 20} more rows</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleImport} variant="primary" disabled={importing || preview.length === 0}>
          {importing ? "Importing..." : `Import ${preview.length > 0 ? `(${preview.length} rows)` : ""}`}
        </Button>
        <Button onClick={() => { setRaw(""); setPeriodStart(""); setPeriodEnd(""); setClosingBalance(""); }} variant="secondary">
          Clear
        </Button>
      </div>
    </div>
  );
}

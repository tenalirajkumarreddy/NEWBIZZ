"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Table, THead, TBody, TR, TH, TD, Field, Dialog, Kpi, EmptyState, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Money } from "@/components/ui/Money";
import { money } from "@/lib/format";
import { updateCreditTerms } from "@/lib/actions/credit";
import type { CreditRegisterRow, CreditRegisterSummary } from "@/lib/data/credit";

interface Props {
  rows: CreditRegisterRow[];
  summary: CreditRegisterSummary;
}

const BUCKET_LABEL: Record<string, string> = {
  current: "Not due",
  "0-30": "0–30d",
  "31-60": "31–60d",
  "61-90": "61–90d",
  "90+": "90d+",
};

type EditorState = { row: CreditRegisterRow } | null;

export function CreditManagementPage({ rows, summary }: Props) {
  const toast = useToast();
  const [editor, setEditor] = useState<EditorState>(null);
  const [filter, setFilter] = useState<"all" | "overLimit" | "cashOnly" | "credit">("all");
  const [kind, setKind] = useState<string>("");
  const [q, setQ] = useState("");

  const shown = rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q.toLowerCase()) && !r.code.toLowerCase().includes(q.toLowerCase())) return false;
    if (kind && r.kind !== kind) return false;
    if (filter === "overLimit") return r.overLimit;
    if (filter === "cashOnly") return r.cashOnly;
    if (filter === "credit") return !r.cashOnly;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total outstanding" value={<Money value={summary.totalOutstanding} />} sub={`${summary.totalLimit > 0 ? "against " + money(summary.totalLimit) + " credit" : "no credit limits set"}`} tone={summary.totalOutstanding > 0 ? "amb" : "grn"} />
        <Kpi label="Utilisation" value={`${summary.utilisationPct}%`} sub="Outstanding ÷ total limit" tone={summary.utilisationPct > 100 ? "amb" : "grn"} />
        <Kpi label="Over limit" value={summary.overLimitCount} sub="Action required" tone={summary.overLimitCount > 0 ? "amb" : "grn"} />
        <Kpi label="Cash only" value={summary.cashOnlyCount} sub="Zero limit — no credit sales" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-line p-0.5">
          {(["all", "overLimit", "credit", "cashOnly"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                filter === f ? "bg-fill text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {f === "all" ? "All" : f === "overLimit" ? "Over limit" : f === "cashOnly" ? "Cash only" : "On credit"}
            </button>
          ))}
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36">
          <option value="">All kinds</option>
          {["retail", "wholesale", "distributor", "institution"].map((k) => (
            <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code…" className="w-56" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR>
              <TH>Customer</TH>
              <TH className="text-right">Limit</TH>
              <TH className="text-right">Days</TH>
              <TH className="text-right">Outstanding</TH>
              <TH>Utilisation</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {shown.length === 0 && (
              <TR>
                <TD colSpan={7} className="px-0 py-0">
                  <EmptyState
                    title="No customers match"
                    description="Adjust the filters, or set credit terms on a customer to see them here."
                  />
                </TD>
              </TR>
            )}
            {shown.map((r) => (
              <TR key={r.id} className={r.overLimit ? "bg-red/[0.04]" : undefined}>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <Link href={`/customers/${r.id}`} className="block text-[13px] font-semibold text-ink hover:text-brand">
                        {r.name}
                      </Link>
                      <p className="font-mono text-[11px] text-ink-4">{r.code} · {r.kind ?? "—"}</p>
                    </div>
                  </div>
                </TD>
                <TD className="text-right font-mono text-[13px] text-ink">
                  {r.cashOnly ? <span className="text-ink-4">Cash only</span> : <Money value={r.creditLimit} />}
                </TD>
                <TD className="text-right font-mono text-[13px] text-ink">{r.creditDays > 0 ? `${r.creditDays}d` : "—"}</TD>
                <TD className={`text-right font-mono text-[13px] ${r.overLimit ? "font-semibold text-red" : "text-ink"}`}>
                  <Money value={r.outstanding} />
                </TD>
                <TD>
                  {r.cashOnly ? (
                    <span className="text-[12px] text-ink-4">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-fill">
                        <div
                          className={`h-full rounded-full ${r.overLimit ? "bg-red" : r.utilisationPct > 80 ? "bg-amb" : "bg-grn"}`}
                          style={{ width: `${Math.min(r.utilisationPct, 100)}%` }}
                        />
                      </div>
                      <span className={`font-mono text-[12px] ${r.overLimit ? "text-red" : "text-ink-3"}`}>{r.utilisationPct}%</span>
                    </div>
                  )}
                </TD>
                <TD>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={r.status === "active" ? "grn" : "slate"}>{r.status}</Badge>
                    {r.overLimit && <Badge tone="red">Over limit</Badge>}
                  </div>
                </TD>
                <TD className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditor({ row: r })}>
                    Terms
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {editor && (
        <CreditTermsDialog
          row={editor.row}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Credit terms editor
// =====================================================================
function CreditTermsDialog({ row, onClose }: { row: CreditRegisterRow; onClose: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = new FormData(e.currentTarget);
      const limit = Number(d.get("creditLimit"));
      const days = Number(d.get("creditDays"));
      const result = await updateCreditTerms(row.id, {
        creditLimit: Number.isFinite(limit) ? limit : 0,
        creditDays: Number.isFinite(days) ? days : 0,
      });
      if (result.ok) {
        toast.success("Credit terms updated");
        onClose();
      } else {
        toast.error(result.error);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Credit terms — ${row.name}`}
      description="0 limit means cash only. Days sets the payment term (due date = invoice date + days)."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="credit-terms-form" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save Terms"}
          </Button>
        </>
      }
    >
      <form id="credit-terms-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Credit limit (₹)" required>
          <input
            name="creditLimit"
            type="number"
            min={0}
            step="0.01"
            defaultValue={row.creditLimit}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[13px] text-ink"
          />
        </Field>
        <Field label="Credit days" required>
          <input
            name="creditDays"
            type="number"
            min={0}
            max={365}
            defaultValue={row.creditDays}
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[13px] text-ink"
          />
        </Field>
        <div className="rounded-lg bg-fill p-3 text-[12px] leading-relaxed text-ink-3">
          Current outstanding: <span className="font-mono font-semibold text-ink"><Money value={row.outstanding} /></span>
          {row.cashOnly ? (
            <> — customer is cash-only.</>
          ) : row.overLimit ? (
            <> — already over limit; raising it will restore normal sales.</>
          ) : (
            <> — {(row.creditLimit - row.outstanding).toLocaleString("en-IN")} available before the next block.</>
          )}
        </div>
      </form>
    </Dialog>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { postVoucher } from "@/lib/actions/accounting";
import type { PostableAccount } from "@/lib/data/accounting";

type DraftLine = { key: string; account_id: string; debit: string; credit: string; memo: string };

const VOUCHER_TYPES = ["journal", "payment", "receipt", "contra"] as const;

let seq = 0;
function newLine(): DraftLine {
  seq += 1;
  return { key: `l${seq}`, account_id: "", debit: "", credit: "", memo: "" };
}

export function VoucherForm({ accounts, today }: { accounts: PostableAccount[]; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [entryDate, setEntryDate] = useState(today);
  const [voucherType, setVoucherType] = useState<string>("journal");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine(), newLine()]);

  function setLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLine()]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length <= 2 ? ls : ls.filter((l) => l.key !== key)));
  }

  const drTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines]);
  const crTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines]);
  const diff = drTotal - crTotal;
  const balanced = Math.abs(diff) < 0.005 && drTotal > 0;

  function onSubmit() {
    const filled = lines.filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));
    if (filled.length < 2) {
      toast.error("Need two lines", "A voucher needs at least two lines with an account and an amount.");
      return;
    }
    const bothSides = filled.find((l) => (Number(l.debit) || 0) > 0 && (Number(l.credit) || 0) > 0);
    if (bothSides) {
      toast.error("One side per line", "Each line is either a debit or a credit, not both.");
      return;
    }
    if (!balanced) {
      toast.error("Unbalanced", `Debits ${money(drTotal)} must equal credits ${money(crTotal)}.`);
      return;
    }

    startTransition(async () => {
      const res = await postVoucher({
        entry_date: entryDate,
        voucher_type: voucherType,
        narration: narration.trim() || undefined,
        lines: filled.map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          memo: l.memo.trim() || undefined,
        })),
      });
      if (res.ok) {
        toast.success("Voucher posted", "The journal entry is on the ledger.");
        router.push(`/journal/${res.entryId}`);
        router.refresh();
      } else {
        toast.error("Could not post voucher", res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <Field label="Date">
          <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
            {VOUCHER_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Narration">
          <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="What is this voucher for?" />
        </Field>
      </Card>

      <Panel title="Lines" flush>
        <Table>
          <THead>
            <TR>
              <TH>Account</TH>
              <TH numeric className="w-36">Debit</TH>
              <TH numeric className="w-36">Credit</TH>
              <TH>Memo</TH>
              <TH className="w-10" />
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => (
              <TR key={l.key}>
                <TD>
                  <Select value={l.account_id} onChange={(e) => setLine(l.key, { account_id: e.target.value })} aria-label="Account">
                    <option value="">Select account…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </Select>
                </TD>
                <TD numeric>
                  <Input
                    type="number" min={0} step="any" inputMode="decimal"
                    value={l.debit}
                    onChange={(e) => setLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                    className="w-32 text-right"
                    aria-label="Debit"
                  />
                </TD>
                <TD numeric>
                  <Input
                    type="number" min={0} step="any" inputMode="decimal"
                    value={l.credit}
                    onChange={(e) => setLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                    className="w-32 text-right"
                    aria-label="Credit"
                  />
                </TD>
                <TD>
                  <Input value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} placeholder="Optional" />
                </TD>
                <TD>
                  <button
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length <= 2}
                    className="text-[12px] text-ink-4 hover:text-red disabled:opacity-40"
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TR>
              <TD className="text-right text-[12px] font-semibold text-ink-2">Totals</TD>
              <TD numeric className="tnum font-bold text-ink">{money(drTotal)}</TD>
              <TD numeric className="tnum font-bold text-ink">{money(crTotal)}</TD>
              <TD colSpan={2} className={"text-[12px] font-medium " + (balanced ? "text-grn" : "text-amb")}>
                {balanced ? "Balanced" : drTotal === 0 ? "Enter amounts" : `Off by ${money(Math.abs(diff))}`}
              </TD>
            </TR>
          </tfoot>
        </Table>
        <div className="border-t border-line px-4 py-3">
          <Button variant="ghost" size="sm" onClick={addLine}>+ Add line</Button>
        </div>
      </Panel>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/vouchers")} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={onSubmit} loading={pending} disabled={!balanced}>Post voucher</Button>
      </div>
    </div>
  );
}

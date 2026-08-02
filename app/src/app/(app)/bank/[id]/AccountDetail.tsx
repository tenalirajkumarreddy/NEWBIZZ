"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Badge, Button, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { updateBankAccount } from "@/lib/actions/bank";
import { useToast } from "@/components/ui/Toast";
import type { BankAccountRow, BankTransactionRow, ReconReport, ImportRow, AdjRow } from "@/lib/data/bank";

interface Props {
  account: BankAccountRow;
  transactions: BankTransactionRow[];
  recon: ReconReport | null;
  imports: ImportRow[];
  adjustments: AdjRow[];
}

type Tab = "transactions" | "reconciliation" | "imports" | "adjustments" | "settings";

function fmtr(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function AccountDetail({ account, transactions, recon, imports, adjustments }: Props) {
  const [tab, setTab] = useState<Tab>("transactions");
  const [filter, setFilter] = useState<string>("all");

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "transactions", label: "Transactions", count: transactions.length },
    { key: "reconciliation", label: "Reconciliation" },
    { key: "imports", label: "Imports", count: imports.length },
    { key: "adjustments", label: "Adjustments", count: adjustments.length },
    { key: "settings", label: "Settings" },
  ];

  const filteredTxns = transactions.filter((t) => {
    if (filter === "matched") return t.matched;
    if (filter === "unmatched") return !t.matched;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{account.name}</h1>
            <Badge tone={account.status === "active" ? "grn" : "slate"}>{account.status}</Badge>
            <Badge tone="brand">{account.accountType === "credit_card" ? "Credit Card" : "Bank"}</Badge>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {account.accountType === "credit_card"
              ? account.cardLastFour ? `•••• ${account.cardLastFour}` : ""
              : [account.bankName, account.accountNo].filter(Boolean).join(" | ")}
            {account.ifsc ? ` | IFSC: ${account.ifsc}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {recon && (
            <div className="rounded-lg border border-line bg-surface px-4 py-2 text-right">
              <p className="text-[11px] uppercase tracking-wider text-ink-3">Book Balance</p>
              <p className="text-[20px] font-bold tabular-nums text-ink">{fmtr(recon.bookBalance ?? 0)}</p>
              {recon.difference !== 0 && (
                <p className="text-[11px] text-red-600">Diff: {fmtr(recon.difference)}</p>
              )}
              {recon.difference === 0 && (
                <p className="text-[11px] text-emerald-600">Reconciled ✓</p>
              )}
            </div>
          )}
          <Link href={`/bank/${account.id}/import`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-darker">+ Import Statement</Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-ink-3 hover:text-ink"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5 rounded-full bg-fill px-1.5 text-[11px] text-ink-3">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "transactions" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink-3">Filter:</span>
            {["all", "unmatched", "matched"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  filter === f ? "bg-brand text-white" : "bg-fill text-ink-3 hover:text-ink"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "unmatched" && <span className="ml-1">{transactions.filter((t) => !t.matched).length}</span>}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Ref No.</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Balance</TH>
                  <TH className="text-center">Status</TH>
                </TR>
              </THead>
              <TBody>
                {filteredTxns.length === 0 && (
                  <TR><TD colSpan={6} className="py-8 text-center text-[13px] text-ink-3">No transactions found.</TD></TR>
                )}
                {filteredTxns.map((t) => (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap text-[13px]">{t.txnDate}</TD>
                    <TD className="max-w-[300px] truncate text-[13px]" title={t.description ?? ""}>{t.description ?? "—"}</TD>
                    <TD className="text-[13px] text-ink-3">{t.refNo ?? "—"}</TD>
                    <TD className={`whitespace-nowrap text-right text-[13px] font-medium tabular-nums ${
                      t.amount >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {fmtr(t.amount)}
                    </TD>
                    <TD className="whitespace-nowrap text-right text-[13px] tabular-nums text-ink-3">
                      {t.runningBalance != null ? fmtr(t.runningBalance) : "—"}
                    </TD>
                    <TD className="text-center">
                      <Badge tone={t.matched ? "grn" : "amb"}>
                        {t.matched ? "Matched" : "Unmatched"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      {tab === "reconciliation" && recon && (
        <Panel>
          <h3 className="mb-4 text-[15px] font-semibold text-ink">Bank Reconciliation Statement</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-fill p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-3">Book Balance (GL)</p>
              <p className="text-[24px] font-bold tabular-nums text-ink">{fmtr(recon.bookBalance)}</p>
            </div>
            <div className="rounded-lg bg-fill p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-3">Statement Balance</p>
              <p className="text-[24px] font-bold tabular-nums text-ink">{fmtr(recon.statementBalance)}</p>
            </div>
            <div className="rounded-lg bg-fill p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-3">Matched Items</p>
              <p className="text-[24px] font-bold tabular-nums text-emerald-600">{recon.matchedCount}</p>
            </div>
            <div className="rounded-lg bg-fill p-4">
              <p className="text-[11px] uppercase tracking-wider text-ink-3">Unmatched Items</p>
              <p className="text-[24px] font-bold tabular-nums text-amber-600">{recon.unmatchedStmtCount}</p>
            </div>
          </div>
          <div className={`mt-4 rounded-lg p-4 ${recon.difference === 0 ? "bg-emerald-50" : "bg-red-50"}`}>
            <p className="text-[11px] uppercase tracking-wider text-ink-3">Difference</p>
            <p className={`text-[28px] font-bold tabular-nums ${recon.difference === 0 ? "text-emerald-600" : "text-red-600"}`}>
              {fmtr(recon.difference)}
            </p>
            {recon.difference === 0 && <p className="text-[13px] text-emerald-600">Account is fully reconciled ✓</p>}
            {recon.difference !== 0 && (
              <p className="text-[13px] text-red-600">
                {recon.unmatchedStmtCount} statement lines worth {fmtr(recon.unmatchedStmtValue)} need matching or adjustments
              </p>
            )}
          </div>
        </Panel>
      )}

      {tab === "imports" && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <Table>
            <THead>
              <TR>
                <TH>File</TH>
                <TH>Period</TH>
                <TH>Total</TH>
                <TH>Inserted</TH>
                <TH>Duplicates</TH>
                <TH>Closing Balance</TH>
                <TH>Imported At</TH>
              </TR>
            </THead>
            <TBody>
              {imports.length === 0 && (
                <TR><TD colSpan={7} className="py-8 text-center text-[13px] text-ink-3">No statements imported yet.</TD></TR>
              )}
              {imports.map((imp) => (
                <TR key={imp.id}>
                  <TD className="text-[13px] font-medium">{imp.fileName ?? "Manual import"}</TD>
                  <TD className="text-[13px] text-ink-3">{imp.periodStart ?? "—"} to {imp.periodEnd ?? "—"}</TD>
                  <TD className="text-[13px] tabular-nums">{imp.rowCount}</TD>
                  <TD className="text-[13px] tabular-nums text-emerald-600">{imp.insertedCount}</TD>
                  <TD className="text-[13px] tabular-nums text-ink-3">{imp.duplicateCount}</TD>
                  <TD className="text-[13px] tabular-nums">
                    {imp.closingBalance != null ? fmtr(imp.closingBalance) : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-[13px] text-ink-3">{new Date(imp.importedAt).toLocaleString()}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {tab === "adjustments" && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH className="text-right">Amount</TH>
                <TH>Narration</TH>
                <TH>JE Ref</TH>
              </TR>
            </THead>
            <TBody>
              {adjustments.length === 0 && (
                <TR><TD colSpan={5} className="py-8 text-center text-[13px] text-ink-3">No adjustments posted.</TD></TR>
              )}
              {adjustments.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-[13px]">{a.adjDate}</TD>
                  <TD className="text-[13px]">
                    <Badge tone="brand">{a.adjType.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-right text-[13px] font-medium tabular-nums">{fmtr(a.amount)}</TD>
                  <TD className="max-w-[250px] truncate text-[13px] text-ink-3">{a.narration ?? "—"}</TD>
                  <TD className="text-[13px] text-ink-3">
                    {a.journalEntryId ? (
                      <a href={`/journal/${a.journalEntryId}`} className="text-brand hover:underline">View</a>
                    ) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {tab === "settings" && (
        <Panel>
          <AccountSettingsForm account={account} />
        </Panel>
      )}
    </div>
  );
}

function AccountSettingsForm({ account }: { account: BankAccountRow }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData(e.currentTarget);
      await updateBankAccount(account.id, {
        name: data.get("name") as string,
        bankName: data.get("bankName") as string || undefined,
        accountNo: data.get("accountNo") as string || undefined,
        ifsc: data.get("ifsc") as string || undefined,
        creditLimit: data.get("creditLimit") ? Number(data.get("creditLimit")) : undefined,
        paymentDueDay: data.get("paymentDueDay") ? Number(data.get("paymentDueDay")) : undefined,
        status: data.get("status") as string || undefined,
      });
      toast.success("Account updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <h3 className="text-[15px] font-semibold text-ink">Account Settings</h3>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">Account Name</span>
        <input name="name" defaultValue={account.name} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">Bank Name</span>
        <input name="bankName" defaultValue={account.bankName ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">Account Number</span>
        <input name="accountNo" defaultValue={account.accountNo ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">IFSC</span>
        <input name="ifsc" defaultValue={account.ifsc ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
      </label>
      {account.accountType === "credit_card" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Credit Limit</span>
            <input name="creditLimit" type="number" defaultValue={account.creditLimit ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Payment Due Day</span>
            <input name="paymentDueDay" type="number" defaultValue={account.paymentDueDay ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">Status</span>
        <select name="status" defaultValue={account.status} className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
      </div>
    </form>
  );
}

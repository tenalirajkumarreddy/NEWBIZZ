"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Badge, Button, Kpi, Money, Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui";
import { updateBankAccount } from "@/lib/actions/bank";
import { useToast } from "@/components/ui/Toast";
import { count as fmtCount, money, dateIST } from "@/lib/format";
import type { BankAccountRow, BankTransactionRow, ReconReport, ImportRow, AdjRow } from "@/lib/data/bank";

interface Props {
  account: BankAccountRow;
  transactions: BankTransactionRow[];
  recon: ReconReport | null;
  imports: ImportRow[];
  adjustments: AdjRow[];
}

type Tab = "transactions" | "reconciliation" | "imports" | "adjustments" | "settings";

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
          <Panel flush>
            {filteredTxns.length === 0 ? (
              <EmptyState title="No transactions found" description="Nothing in this view yet — try a different filter." />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Description</TH>
                    <TH>Ref No.</TH>
                    <TH numeric>Amount</TH>
                    <TH numeric>Balance</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredTxns.map((t) => (
                    <TR key={t.id}>
                      <TD className="whitespace-nowrap">{t.txnDate}</TD>
                      <TD className="max-w-[300px] truncate" title={t.description ?? ""}>{t.description ?? "—"}</TD>
                      <TD className="text-ink-3">{t.refNo ?? "—"}</TD>
                      <TD numeric className={t.amount >= 0 ? "font-semibold text-grn" : "font-semibold text-red"}>
                        <Money value={t.amount} />
                      </TD>
                      <TD numeric className="text-ink-3">
                        {t.runningBalance != null ? <Money value={t.runningBalance} /> : "—"}
                      </TD>
                      <TD>
                        <Badge tone={t.matched ? "grn" : "amb"}>
                          {t.matched ? "Matched" : "Unmatched"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="flex flex-col gap-4">
          {recon ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Book Balance (GL)" value={<Money value={recon.bookBalance} />} />
                <Kpi label="Statement Balance" value={<Money value={recon.statementBalance} />} />
                <Kpi
                  label="Matched Items"
                  value={fmtCount(recon.matchedCount)}
                  sub="statement lines tied to books"
                  tone="grn"
                />
                <Kpi
                  label="Unmatched Items"
                  value={fmtCount(recon.unmatchedStmtCount)}
                  sub={recon.unmatchedStmtCount > 0 ? `${money(recon.unmatchedStmtValue)} on statement` : "fully matched"}
                  tone={recon.unmatchedStmtCount > 0 ? "amb" : "grn"}
                />
              </div>

              <Panel>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-semibold text-ink">Difference</p>
                    <p className={`font-mono text-[24px] font-bold tabular-nums ${recon.difference === 0 ? "text-grn" : "text-red"}`}>
                      <Money value={recon.difference} />
                    </p>
                  </div>
                  {recon.difference === 0 && <p className="text-[13px] text-grn">Account is fully reconciled ✓</p>}
                  {recon.difference !== 0 && (
                    <p className="text-[13px] text-ink-3">
                      {recon.unmatchedStmtCount} statement lines worth{" "}
                      <Money value={recon.unmatchedStmtValue} className="text-ink" /> need matching or adjustments
                    </p>
                  )}
                </div>
              </Panel>
            </>
          ) : (
            <Panel>
              <EmptyState
                title="No reconciliation yet"
                description="Import a statement or post adjustments to reconcile this account against the GL."
              />
            </Panel>
          )}
        </div>
      )}

      {tab === "imports" && (
        <Panel flush>
          {imports.length === 0 ? (
            <EmptyState title="No statements imported yet" description="Bank statement imports appear here once uploaded." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>File</TH>
                  <TH>Period</TH>
                  <TH numeric>Total</TH>
                  <TH numeric>Inserted</TH>
                  <TH numeric>Duplicates</TH>
                  <TH numeric>Closing Balance</TH>
                  <TH>Imported At</TH>
                </TR>
              </THead>
              <TBody>
                {imports.map((imp) => (
                  <TR key={imp.id}>
                    <TD className="font-medium text-ink">{imp.fileName ?? "Manual import"}</TD>
                    <TD className="text-ink-3">{imp.periodStart ?? "—"} to {imp.periodEnd ?? "—"}</TD>
                    <TD numeric>{fmtCount(imp.rowCount)}</TD>
                    <TD numeric className="text-grn">{imp.insertedCount}</TD>
                    <TD numeric className="text-ink-3">{fmtCount(imp.duplicateCount)}</TD>
                    <TD numeric>{imp.closingBalance != null ? <Money value={imp.closingBalance} /> : "—"}</TD>
                    <TD className="whitespace-nowrap text-ink-3">{dateIST(imp.importedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      )}

      {tab === "adjustments" && (
        <Panel flush>
          {adjustments.length === 0 ? (
            <EmptyState title="No adjustments posted" description="Reconciliation adjustments appear here once booked." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH numeric>Amount</TH>
                  <TH>Narration</TH>
                  <TH>JE Ref</TH>
                </TR>
              </THead>
              <TBody>
                {adjustments.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap">{a.adjDate}</TD>
                    <TD>
                      <Badge tone="brand">{a.adjType.replace(/_/g, " ")}</Badge>
                    </TD>
                    <TD numeric className="text-ink">
                      <Money value={a.amount} />
                    </TD>
                    <TD className="max-w-[250px] truncate text-ink-3">{a.narration ?? "—"}</TD>
                    <TD>
                      {a.journalEntryId ? (
                        <Link href={`/journal/${a.journalEntryId}`} className="text-brand hover:underline">View</Link>
                      ) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
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
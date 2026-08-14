import Link from "next/link";
import { listJournalEntries } from "@/lib/data/journal";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/Badge";
import { dateIST, count as fmtCount, money } from "@/lib/format";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Manual Vouchers register (§5.2) — hand-posted journals (payment, receipt,
// contra, journal). System-generated entries live in the Day Book; this page is
// just the manual ones plus the entry point to raise a new voucher.
export const metadata = { title: "Manual Vouchers — NEWBIZZ" };
export default async function VouchersPage() {
  const [manual, voucher, fy] = await Promise.all([
    listJournalEntries({ source: "manual", limit: 200 }),
    listJournalEntries({ source: "voucher", limit: 200 }),
    getCurrentFy(),
  ]);

  const entries = [...manual, ...voucher].sort((a, b) =>
    a.entry_date === b.entry_date ? (a.entry_no < b.entry_no ? 1 : -1) : a.entry_date < b.entry_date ? 1 : -1,
  );
  const total = entries.reduce((s, e) => s + e.debitTotal, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Manual Vouchers"
        subtitle={`${fy ? `FY ${fy.code}` : "FY —"} · ${fmtCount(entries.length)} hand-posted entries`}
        actions={
          <Link
            href="/vouchers/new"
            className="rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d"
          >
            + New voucher
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Manual entries" value={fmtCount(entries.length)} sub="This financial year" />
        <Kpi label="Total posted (Dr)" value={money(total)} sub="Sum of debits" />
        <Kpi label="Latest" value={entries[0] ? dateIST(entries[0].entry_date) : "—"} sub="Most recent voucher" />
      </div>

      <Panel flush>
        {entries.length === 0 ? (
          <EmptyState
            title="No manual vouchers yet"
            description="Raise a payment, receipt, contra, or journal voucher to post a balanced entry straight to the ledger."
            action={
              <Link href="/vouchers/new" className="rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d">
                + New voucher
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Entry No</TH>
                <TH>Date</TH>
                <TH>Narration</TH>
                <TH numeric>Amount</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((e) => (
                <TR key={e.id} interactive>
                  <TD className="p-0">
                    <Link href={`/journal/${e.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                      {e.entry_no}
                    </Link>
                  </TD>
                  <TD>{dateIST(e.entry_date)}</TD>
                  <TD className="max-w-[400px] truncate text-ink-2">{e.narration ?? "—"}</TD>
                  <TD numeric className="tnum">{money(e.debitTotal)}</TD>
                  <TD><StatusBadge status={e.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </PageContainer>
  );
}

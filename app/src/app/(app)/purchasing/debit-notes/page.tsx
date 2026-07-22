import Link from "next/link";
import { listDebitNotes } from "@/lib/data/purchases";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";

export default async function DebitNotesPage() {
  const notes = await listDebitNotes({ limit: 200 });
  const total = notes.reduce((s, n) => s + n.amount, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/purchasing" className="text-[12px] font-medium text-ink-4 hover:text-brand">← Purchasing</Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Debit Notes</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fmtCount(notes.length)} purchase returns · <span className="font-mono"><Money value={total} /></span> debited
          </p>
        </div>
        <Link href="/purchasing/debit-notes/new"><Button variant="primary" size="sm">New debit note</Button></Link>
      </div>

      <Panel flush>
        {notes.length === 0 ? (
          <EmptyState
            title="No debit notes yet"
            description="A debit note records a purchase return — it reduces the supplier payable and reverses RM inventory + input GST."
            action={<Link href="/purchasing/debit-notes/new"><Button variant="secondary" size="sm">New debit note</Button></Link>}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Debit Note</TH>
                <TH>Date</TH>
                <TH>Supplier</TH>
                <TH>Reason</TH>
                <TH numeric>Goods</TH>
                <TH numeric>Tax</TH>
                <TH numeric>Total</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {notes.map((n) => (
                <TR key={n.id} interactive>
                  <TD className="p-0">
                    <Link href={`/purchasing/debit-notes/${n.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">{n.debitNoteNo}</Link>
                  </TD>
                  <TD>{dateIST(n.createdAt)}</TD>
                  <TD className="font-medium text-ink">{n.supplierName ?? "—"}</TD>
                  <TD className="text-[12px] text-ink-3">{titleCase(n.reason)}</TD>
                  <TD numeric><Money value={n.baseAmount} /></TD>
                  <TD numeric>{n.taxAmount > 0 ? <Money value={n.taxAmount} /> : "—"}</TD>
                  <TD numeric><Money value={n.amount} /></TD>
                  <TD><StatusBadge status={n.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

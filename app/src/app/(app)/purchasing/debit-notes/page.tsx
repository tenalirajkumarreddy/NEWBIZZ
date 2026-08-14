import Link from "next/link";
import { listDebitNotes } from "@/lib/data/purchases";
import { listSupplierOptions } from "@/lib/data/suppliers";
import { listStockableItems } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { PageContainer, PageHeader } from "@/components/ui";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import { CreateDebitNoteActions } from "./CreateDebitNoteActions";

export default async function DebitNotesPage() {
  const notes = await listDebitNotes({ limit: 200 });
  const [suppliers, items] = await Promise.all([listSupplierOptions(), listStockableItems()]);
  const total = notes.reduce((s, n) => s + n.amount, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Debit Notes"
        subtitle={<>{fmtCount(notes.length)} purchase returns · <span className="font-mono"><Money value={total} /></span> debited</>}
        backHref="/purchasing"
        backLabel="Purchasing"
        actions={<CreateDebitNoteActions suppliers={suppliers} items={items} />}
      />

      <Panel flush>
        {notes.length === 0 ? (
          <EmptyState
            title="No debit notes yet"
            description="A debit note records a purchase return — it reduces the supplier payable and reverses RM inventory + input GST."
            action={<CreateDebitNoteActions suppliers={suppliers} items={items} />}
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
    </PageContainer>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getJournalEntry } from "@/lib/data/journal";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { PageContainer, PageHeader } from "@/components/ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, money } from "@/lib/format";
import { JournalEntryActions } from "./JournalEntryActions";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Journal entry detail (§5.1) — the balanced Dr/Cr lines behind one posting.
// Posted, non-reversal entries can be reversed (reverse_journal), which writes a
// mirror entry; posted journals themselves are immutable (Invariant 6).
export default async function JournalEntryPage({ params }: { params: { id: string } }) {
  const entry = await getJournalEntry(params.id);
  if (!entry) notFound();

  const isReversal = entry.reversesId != null;
  const canReverse = entry.status === "posted" && !isReversal;

  return (
    <PageContainer width="report">
      <PageHeader
        backHref="/journal"
        backLabel="Day Book"
        title={<>{entry.entry_no} <StatusBadge status={entry.status} /></>}
        mono
        subtitle={`${dateIST(entry.entry_date)} · ${titleCase(entry.source)}${entry.postedByName ? ` · ${entry.postedByName}` : ""}`}
        actions={canReverse && <JournalEntryActions entryId={entry.id} entryNo={entry.entry_no} />}
      />

      {isReversal && (
        <div className="rounded-md bg-amb-wash px-3 py-2 text-[12px] text-amb ring-1 ring-inset ring-amb/20">
          This is a reversal entry. It cannot itself be reversed.
        </div>
      )}

      {entry.narration && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Narration</div>
          <p className="mt-1 text-[13px] text-ink-2">{entry.narration}</p>
        </Card>
      )}

      <Panel title="Journal lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-24">Code</TH>
              <TH>Account</TH>
              <TH>Memo</TH>
              <TH numeric>Debit</TH>
              <TH numeric>Credit</TH>
            </TR>
          </THead>
          <TBody>
            {entry.lines.map((l) => (
              <TR key={l.id}>
                <TD className="font-mono text-[12px] text-ink-4">{l.accountCode ?? "—"}</TD>
                <TD>
                  <Link href={`/journal/ledger/${l.accountId}`} className="text-ink hover:text-brand hover:underline">
                    {l.accountName ?? "—"}
                  </Link>
                </TD>
                <TD className="text-[12px] text-ink-3">{l.memo ?? ""}</TD>
                <TD numeric className="tnum">{l.debit ? money(l.debit) : ""}</TD>
                <TD numeric className="tnum">{l.credit ? money(l.credit) : ""}</TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TR>
              <TD colSpan={3} className="text-right text-[12px] font-semibold text-ink-2">Totals</TD>
              <TD numeric className="tnum font-bold text-ink">{money(entry.debitTotal)}</TD>
              <TD numeric className="tnum font-bold text-ink">{money(entry.creditTotal)}</TD>
            </TR>
          </tfoot>
        </Table>
      </Panel>
    </PageContainer>
  );
}

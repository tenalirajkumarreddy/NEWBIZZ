import Link from "next/link";
import { listJournalEntries } from "@/lib/data/journal";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { JournalTable } from "./JournalTable";
import { TallyExportButton } from "./TallyExportButton";

// Day Book / Journal register (5.1) - every posted journal entry, newest first,
// across all sources (sales, purchases, payments, vouchers, opening.). This is
// the audit spine: click through to an entry's lines, or drill an account's
// ledger from the trial balance. Read-only; entries post from their own flows.
export const metadata = { title: "Journal — NEWBIZZ" };
export default async function JournalPage() {
  const [entries, fy] = await Promise.all([
    listJournalEntries({ limit: 300 }),
    getCurrentFy(),
  ]);

  const posted = entries.filter((e) => e.status === "posted");
  const drafts = entries.filter((e) => e.status === "draft").length;
  const totalDebits = posted.reduce((s, e) => s + e.debitTotal, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Day Book"
        subtitle={`${fy ? `FY ${fy.code}` : "FY —"} · ${fmtCount(entries.length)} entries`}
        actions={
          <>
            {fy && <TallyExportButton from={fy.start_date} to={fy.end_date} />}
            <Link
              href="/vouchers/new"
              className="rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d"
            >
              + Manual voucher
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Posted entries" value={fmtCount(posted.length)} sub="This financial year" />
        <Kpi label="Total posted (Dr)" value={money(totalDebits)} sub="Sum of debits" />
        <Kpi label="Drafts" value={fmtCount(drafts)} sub="Unposted" tone={drafts > 0 ? "amb" : "grn"} />
      </div>

      <Panel flush>
        {entries.length === 0 ? (
          <EmptyState
            title="No journal entries yet"
            description="Every posted document — invoice, bill, payment, receipt, or manual voucher — lands here as a balanced journal entry."
          />
        ) : (
          <JournalTable entries={entries} />
        )}
      </Panel>
    </PageContainer>
  );
}

import Link from "next/link";
import { listJournalEntries } from "@/lib/data/journal";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { JournalTable } from "./JournalTable";

// Day Book / Journal register (§5.1) — every posted journal entry, newest first,
// across all sources (sales, purchases, payments, vouchers, opening…). This is
// the audit spine: click through to an entry's lines, or drill an account's
// ledger from the trial balance. Read-only; entries post from their own flows.
export default async function JournalPage() {
  const [entries, fy] = await Promise.all([
    listJournalEntries({ limit: 300 }),
    getCurrentFy(),
  ]);

  const posted = entries.filter((e) => e.status === "posted");
  const drafts = entries.filter((e) => e.status === "draft").length;
  const totalDebits = posted.reduce((s, e) => s + e.debitTotal, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Day Book</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(entries.length)} entries
          </p>
        </div>
        <Link
          href="/vouchers/new"
          className="self-start rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-d"
        >
          + Manual voucher
        </Link>
      </div>

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
    </div>
  );
}

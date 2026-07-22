import Link from "next/link";
import { listCreditNotes, listSchemes } from "@/lib/data/creditnotes";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { CreditNotesTable } from "./CreditNotesTable";

// Credit Notes & Schemes — the AR-reducing register (§4.5 / §7.5). Every credit
// note (scheme rebate, complaint credit, or sales return) drops a customer's
// outstanding via a posted journal; no cash leaves. Schemes drive volume
// rebates. This page lists the credit notes; schemes live under /schemes.
export default async function CreditNotesPage() {
  const [notes, schemes, fy] = await Promise.all([
    listCreditNotes({ limit: 200 }),
    listSchemes(),
    getCurrentFy(),
  ]);

  const totalCredit = notes.reduce((s, n) => s + n.amount, 0);
  const returns = notes.filter((n) => n.reason === "sales_adjustment").length;
  const rebates = notes.filter((n) => n.reason === "scheme_rebate").length;
  const pendingRebates = schemes.reduce((s, sc) => s + sc.pendingApproval, 0);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Credit Notes &amp; Schemes</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} · {fmtCount(notes.length)} credit notes
          </p>
        </div>
        <Link
          href="/credit-notes/schemes"
          className="self-start rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand"
        >
          Volume schemes →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total credit issued" value={money(totalCredit)} sub="This financial year" />
        <Kpi label="Sales returns" value={fmtCount(returns)} sub="Invoice reversals" />
        <Kpi label="Scheme rebates" value={fmtCount(rebates)} sub="Volume credits posted" />
        <Kpi
          label="Rebates to approve"
          value={fmtCount(pendingRebates)}
          sub="Awaiting sign-off"
          tone={pendingRebates > 0 ? "amb" : "grn"}
        />
      </div>

      <Panel flush>
        {notes.length === 0 ? (
          <EmptyState
            title="No credit notes yet"
            description="Credit notes reduce a customer's outstanding — raised from a sales return, a volume-scheme rebate, or a complaint resolution. Return an invoice or post a scheme rebate to create one."
            action={
              <Link href="/invoices" className="text-[12px] font-semibold text-brand hover:underline">
                Go to Invoicing →
              </Link>
            }
          />
        ) : (
          <CreditNotesTable notes={notes} />
        )}
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { listCreditNotes, listSchemes } from "@/lib/data/creditnotes";
import { getCurrentFy } from "@/lib/data/fy";
import { Panel } from "@/components/ui/Card";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { count as fmtCount, money } from "@/lib/format";
import { CreditNotesTable } from "./CreditNotesTable";

// Credit Notes & Schemes — the AR-reducing register (§4.5 / §7.5). Every credit
// note (scheme rebate, complaint credit, or sales return) drops a customer's
// outstanding via a posted journal; no cash leaves. Schemes drive volume
// rebates. This page lists the credit notes; schemes live under /schemes.
export const metadata = { title: "Credit Notes & Schemes — NEWBIZZ" };
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
    <PageContainer width="full">
      <PageHeader
        title="Credit Notes &amp; Schemes"
        subtitle={`${fy ? `FY ${fy.code}` : "FY —"} · ${fmtCount(notes.length)} credit notes`}
        actions={
          <Link
            href="/credit-notes/schemes"
            className="rounded-md bg-fill px-3 py-2 text-[12px] font-semibold text-ink-2 ring-1 ring-inset ring-line hover:text-brand"
          >
            Volume schemes →
          </Link>
        }
      />

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
    </PageContainer>
  );
}

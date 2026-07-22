import Link from "next/link";
import { list2bImports, currentPeriod } from "@/lib/data/gst";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateTimeIST, count as fmtCount } from "@/lib/format";
import { Import2bPanel } from "./Import2bPanel";

// GSTR-2B reconciliation (§5.9) — import the portal's auto-drafted ITC statement
// and match it against recorded supplier bills. The match governs how much ITC
// is safely claimable: matched (claim), mismatch (review), missing-in-books
// (unrecorded purchase), missing-in-2B (defer).
export default async function Gstr2bPage() {
  const imports = await list2bImports();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div>
        <Link href="/gst" className="text-[12px] font-medium text-ink-4 hover:text-brand">← GST Reports</Link>
        <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">GSTR-2B Reconciliation</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">Match the portal&rsquo;s ITC statement against your recorded bills</p>
      </div>

      <Import2bPanel defaultPeriod={currentPeriod()} />

      <Panel title="Imports" flush>
        {imports.length === 0 ? (
          <EmptyState
            title="No 2B imports yet"
            description="Paste the rows from a downloaded GSTR-2B above to import a period's statement, then reconcile it against your bills."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Imported</TH>
                <TH numeric>Rows</TH>
                <TH numeric>Matched</TH>
                <TH numeric>Mismatch</TH>
                <TH numeric>Missing</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {imports.map((im) => (
                <TR key={im.id} interactive>
                  <TD className="p-0">
                    <Link href={`/gst/2b/${im.id}`} className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand">
                      {im.period}
                    </Link>
                  </TD>
                  <TD>{dateTimeIST(im.importedAt)}</TD>
                  <TD numeric>{fmtCount(im.rowCount)}</TD>
                  <TD numeric>{im.matched > 0 ? <Badge tone="grn" size="sm">{im.matched}</Badge> : "—"}</TD>
                  <TD numeric>{im.mismatch > 0 ? <Badge tone="amb" size="sm">{im.mismatch}</Badge> : "—"}</TD>
                  <TD numeric>{im.missingInBooks > 0 ? <Badge tone="red" size="sm">{im.missingInBooks}</Badge> : "—"}</TD>
                  <TD>
                    <Link href={`/gst/2b/${im.id}`} className="text-[12px] font-medium text-brand hover:underline">Open →</Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { getReconciliation } from "@/lib/data/reconciliation";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount } from "@/lib/format";

// Integrity checks — the tripwire for the failure mode this system keeps
// having: two books of the same money disagreeing silently. The RPC compares
// AR GL against the invoice + delivery subledger, the subledger against the
// customer ledger (net of advances), receipts against their allocations, and
// stock carrying value against the inventory control accounts. Read-only.
export const metadata = { title: "Integrity Checks — NEWBIZZ" };

export default async function ReconciliationPage() {
  const { checks, drift, error } = await getReconciliation();

  if (error || checks.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Integrity Checks" subtitle="Reconciliation between the ledger and the subledgers" />
        <Panel>
          <EmptyState
            title="Checks unavailable"
            description={
              error ??
              "The reconciliation functions are not deployed yet. Apply the pending migrations, then reload."
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const failing = checks.filter((c) => c.status !== "ok");
  const worst = failing.reduce((m, c) => Math.max(m, Math.abs(c.difference)), 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Integrity Checks"
        subtitle={
          <>
            {fmtCount(checks.length)} invariant{checks.length === 1 ? "" : "s"} ·{" "}
            {failing.length === 0 ? "all books agree" : `${fmtCount(failing.length)} drifting`}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Checks passing"
          value={`${fmtCount(checks.length - failing.length)} / ${fmtCount(checks.length)}`}
          sub="Ledger ↔ subledger"
          tone={failing.length === 0 ? "grn" : "amb"}
        />
        <Kpi
          label="Largest difference"
          value={<Money value={worst} />}
          sub={failing.length === 0 ? "Nothing out of balance" : "Review the rows below"}
          tone={failing.length === 0 ? "grn" : "amb"}
        />
        <Kpi
          label="Customers off AR"
          value={fmtCount(drift.length)}
          sub="GL balance ≠ invoices owed"
          tone={drift.length === 0 ? "grn" : "amb"}
        />
        <Kpi
          label="Drift exposure"
          value={<Money value={drift.reduce((s, d) => s + Math.abs(d.difference), 0)} />}
          sub="Absolute, across listed customers"
        />
      </div>

      <Panel title="Books" flush>
        <Table>
          <THead>
            <TR>
              <TH>Check</TH>
              <TH numeric>Expected</TH>
              <TH numeric>Actual</TH>
              <TH numeric>Difference</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {checks.map((c) => (
              <TR key={c.check_name}>
                <TD>
                  <div className="font-medium text-ink">{c.check_name}</div>
                  <div className="text-[11px] text-ink-4">{c.detail}</div>
                </TD>
                <TD numeric><Money value={c.expected} /></TD>
                <TD numeric><Money value={c.actual} /></TD>
                <TD numeric>
                  <span className={Math.abs(c.difference) > 0.05 ? "text-red" : "text-ink-4"}>
                    <Money value={c.difference} />
                  </span>
                </TD>
                <TD>
                  <Badge tone={c.status === "ok" ? "grn" : "red"} dot>
                    {c.status === "ok" ? "balanced" : "drifting"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>

      <Panel title="Customers whose AR does not tie" flush>
        {drift.length === 0 ? (
          <EmptyState
            title="Every customer reconciles"
            description="Each customer's AR balance equals what their live invoices — plus any delivered, not-yet-invoiced order — say they owe."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH numeric>GL balance</TH>
                <TH numeric>Invoices owed</TH>
                <TH numeric>Difference</TH>
              </TR>
            </THead>
            <TBody>
              {drift.map((d) => (
                <TR key={d.customer_id}>
                  <TD>
                    <Link
                      href={`/customers/${d.customer_id}`}
                      className="font-medium text-ink hover:text-brand hover:underline"
                    >
                      {d.customer}
                    </Link>
                  </TD>
                  <TD numeric><Money value={d.gl_balance} /></TD>
                  <TD numeric><Money value={d.subledger} /></TD>
                  <TD numeric>
                    <span className="text-red"><Money value={d.difference} /></span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Card className="p-4">
        <div className="eyebrow text-ink-4">How to repair</div>
        <p className="mt-1 text-[12px] text-ink-2">
          A drifting customer ledger is rebuilt from the documents by{" "}
          <span className="font-mono text-[11px]">rebuild_customer_ledger()</span> — it is
          service-role only and idempotent. A drifting invoice subledger usually means a receipt,
          credit note or return was posted before the allocation rules existed; correct it with a
          receipt void, an unapply, or a credit note rather than editing rows. Stock and AR GL
          differences are posting defects: fix the journal, never the read-model.
        </p>
      </Card>
    </PageContainer>
  );
}

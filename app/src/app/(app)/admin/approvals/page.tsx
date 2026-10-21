import Link from "next/link";
import { getReversalQueue, getReversalPolicy } from "@/lib/data/approvals";
import { Panel, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Kpi, PageContainer, PageHeader } from "@/components/ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, count as fmtCount, titleCase } from "@/lib/format";
import { ApprovalActions } from "./ApprovalActions";

// Maker-checker queue (M13). A void at or above the threshold is refused and
// filed here instead of executing, so one person can no longer erase a large
// receivable on their own. Approving runs the original RPC, so the reversal and
// the decision commit together.
export const metadata = { title: "Approvals — NEWBIZZ" };

const KIND_LABEL: Record<string, string> = {
  invoice_void: "Invoice void",
  receipt_void: "Receipt void",
};

export default async function ApprovalsPage() {
  const [pending, history, policy] = await Promise.all([
    getReversalQueue("pending"),
    getReversalQueue("all"),
    getReversalPolicy(),
  ]);

  const decided = history.filter((r) => r.status !== "pending").slice(0, 20);
  const exposure = pending.reduce((s, r) => s + r.amount, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Approvals"
        subtitle={
          <>
            {fmtCount(pending.length)} awaiting a second approver ·{" "}
            {pending.length === 0 ? "nothing queued" : "below is what would be reversed"}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Awaiting approval"
          value={fmtCount(pending.length)}
          sub="Voids held back"
          tone={pending.length === 0 ? "grn" : "amb"}
        />
        <Kpi
          label="Value held"
          value={<Money value={exposure} />}
          sub="Not reversed until approved"
        />
        {policy.map((p) => (
          <Kpi
            key={p.kind}
            label={`${KIND_LABEL[p.kind] ?? p.kind} threshold`}
            value={p.enabled ? <Money value={p.threshold_amount} /> : "Off"}
            sub={p.enabled ? "At or above needs approval" : "Every void goes through"}
          />
        ))}
      </div>

      <Panel title="Pending" flush>
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Voids above the threshold land here instead of posting straight away. Approving one reverses it in your name; you can never approve your own request."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Document</TH>
                <TH>Customer</TH>
                <TH>Requested by</TH>
                <TH>Reason</TH>
                <TH numeric>Amount</TH>
                <TH numeric>Requested</TH>
                <TH numeric>{}</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-mono text-[12px] font-semibold text-brand">{r.doc_no ?? "—"}</div>
                    <div className="text-[11px] text-ink-4">{KIND_LABEL[r.kind] ?? titleCase(r.kind)}</div>
                  </TD>
                  <TD>{r.customer ?? "—"}</TD>
                  <TD className="text-[12px] text-ink-2">{r.requested_by_name ?? "—"}</TD>
                  <TD className="max-w-[260px] text-[12px] text-ink-3">{r.reason ?? "—"}</TD>
                  <TD numeric><Money value={r.amount} /></TD>
                  <TD numeric className="text-[12px] text-ink-4">{dateIST(r.requested_at)}</TD>
                  <TD numeric>
                    <ApprovalActions
                      requestId={r.id}
                      docNo={r.doc_no ?? "this document"}
                      amountLabel={`₹${r.amount.toFixed(2)}`}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {decided.length > 0 && (
        <Panel title="Recent decisions" flush>
          <Table>
            <THead>
              <TR>
                <TH>Document</TH>
                <TH>Customer</TH>
                <TH numeric>Amount</TH>
                <TH>Decision</TH>
                <TH>Note</TH>
              </TR>
            </THead>
            <TBody>
              {decided.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px]">
                    {r.doc_no ? (
                      <Link
                        href={r.kind === "invoice_void" ? `/invoices/${r.target_id}` : "/receipts"}
                        className="text-brand hover:underline"
                      >
                        {r.doc_no}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>{r.customer ?? "—"}</TD>
                  <TD numeric><Money value={r.amount} /></TD>
                  <TD>
                    <Badge tone={r.status === "approved" ? "grn" : "neutral"}>{r.status}</Badge>
                  </TD>
                  <TD className="max-w-[280px] text-[12px] text-ink-3">{r.decision_note ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      <Card className="p-4">
        <div className="eyebrow text-ink-4">How this works</div>
        <p className="mt-1 text-[12px] text-ink-2">
          A void at or above a threshold is refused by the database (SQLSTATE RY001) and filed
          as a request, so nothing is lost and nothing posts. Approving runs the original void in
          the approver&apos;s transaction: the journal reversal, the reopening invoices and this
          decision commit together or not at all. Thresholds live in{" "}
          <span className="font-mono text-[11px]">reversal_policy</span>; credit notes and sales
          returns are not gated.
        </p>
      </Card>
    </PageContainer>
  );
}

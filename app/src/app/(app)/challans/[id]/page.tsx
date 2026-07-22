import Link from "next/link";
import { notFound } from "next/navigation";
import { getChallan, type ChallanLine } from "@/lib/data/challans";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, qty as fmtQty } from "@/lib/format";
import { ChallanRowActions } from "../ChallanRowActions";

// Challan detail — the delivery note. Header facts, the delivered lines, and
// the transit actions (dispatch / deliver / cancel). Delivering here rolls the
// parent order's fulfilment state; no money or stock moves on a challan.
export default async function ChallanDetailPage({ params }: { params: { id: string } }) {
  const challan = await getChallan(params.id);
  if (!challan) notFound();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/challans" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Delivery Challans
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{challan.challan_no}</h1>
            <StatusBadge status={challan.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Printed {dateIST(challan.printedAt)}
            {challan.orderNo ? (
              <>
                {" · "}
                <Link href={`/orders/${challan.orderId}`} className="font-mono hover:text-brand hover:underline">
                  {challan.orderNo}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <ChallanRowActions
          challanId={challan.id}
          challanNo={challan.challan_no}
          status={challan.status}
          orderId={challan.orderId}
        />
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Customer" value={challan.customerName ?? "—"} />
        <Fact label="Store" value={challan.storeName ?? "—"} sub={challan.storeCode ?? undefined} />
        <Fact label="Carried by" value={challan.agentName ?? "—"} />
        <Fact label="Units" value={fmtQty(challan.totalQty)} mono />
      </div>

      {(challan.ewayBillNo || challan.dispatchedAt || challan.deliveredAt) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {challan.ewayBillNo && <Fact label="E-way bill" value={challan.ewayBillNo} mono />}
          {challan.dispatchedAt && <Fact label="Dispatched" value={dateIST(challan.dispatchedAt)} />}
          {challan.deliveredAt && <Fact label="Delivered" value={dateIST(challan.deliveredAt)} />}
        </div>
      )}

      {/* Lines */}
      <Panel title="Delivered lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty delivered</TH>
            </TR>
          </THead>
          <TBody>
            {challan.lines.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
          </TBody>
        </Table>
      </Panel>

      {challan.notes && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Notes</div>
          <p className="mt-1 text-[13px] text-ink-2">{challan.notes}</p>
        </Card>
      )}
    </div>
  );
}

function LineRow({ line }: { line: ChallanLine }) {
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{fmtQty(line.qty)}</TD>
    </TR>
  );
}

function Fact({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <div className="eyebrow text-ink-4">{label}</div>
      <div className={"mt-1 text-[15px] font-semibold text-ink " + (mono ? "font-mono tnum" : "")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-ink-4">{sub}</div>}
    </Card>
  );
}

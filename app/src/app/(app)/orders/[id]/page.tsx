import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, getHomeStateCode } from "@/lib/data/sales";
import { Panel, Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { dateIST, qty, percent } from "@/lib/format";
import { OrderRowActions } from "../OrderRowActions";
import { FulfilOrderAction } from "./FulfilOrderAction";
import type { OrderLine } from "@/lib/data/sales";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, homeStateCode] = await Promise.all([
    getOrder(params.id),
    getHomeStateCode(),
  ]);
  if (!order) notFound();

  const netTotal = order.lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const canFulfil = order.status === "confirmed" || order.status === "approved";
  const canCancel = order.status === "confirmed" || order.status === "approved" || order.status === "draft";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* Breadcrumb + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/orders" className="text-[12px] font-medium text-ink-4 hover:text-brand">
            ← Order Book
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-ink">{order.order_no}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {dateIST(order.order_date)} · {order.storeName ?? "—"}
            {order.customerName ? ` · ${order.customerName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canFulfil && (
            <FulfilOrderAction
              orderId={order.id}
              orderNo={order.order_no}
              lines={order.lines}
              storeStateCode={order.storeStateCode}
              homeStateCode={homeStateCode}
            />
          )}
          {canCancel && <OrderRowActions orderId={order.id} orderNo={order.order_no} status={order.status} />}
          {order.status === "fulfilled" && (
            <OrderRowActions orderId={order.id} orderNo={order.order_no} status={order.status} />
          )}
          {order.status === "invoiced" && (
            <span className="text-[12px] font-medium text-grn">Invoiced</span>
          )}
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Store" value={order.storeName ?? "—"} sub={order.storeCode ?? undefined} />
        <Fact label="Customer" value={order.customerName ?? "—"} />
        <Fact label="Lines" value={String(order.lines.length)} />
        <Fact label="Net Value" value={<Money value={netTotal} />} mono />
      </div>

      {/* Lines */}
      <Panel title="Order lines" flush>
        <Table>
          <THead>
            <TR>
              <TH className="w-10">#</TH>
              <TH>Item</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Unit Price</TH>
              <TH numeric>GST</TH>
              <TH numeric>Line Net</TH>
            </TR>
          </THead>
          <TBody>
            {order.lines.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
          </TBody>
        </Table>
      </Panel>

      {order.notes && (
        <Card className="p-4">
          <div className="eyebrow text-ink-4">Notes</div>
          <p className="mt-1 text-[13px] text-ink-2">{order.notes}</p>
        </Card>
      )}
    </div>
  );
}

function LineRow({ line }: { line: OrderLine }) {
  const net = line.qty * line.unit_price;
  return (
    <TR>
      <TD className="text-ink-4">{line.line_no}</TD>
      <TD>
        <span className="font-medium text-ink">{line.itemName ?? "—"}</span>
        {line.sku && <span className="ml-1.5 font-mono text-[11px] text-ink-4">{line.sku}</span>}
      </TD>
      <TD numeric>{qty(line.qty)}</TD>
      <TD numeric><Money value={line.unit_price} /></TD>
      <TD numeric>{percent(line.gst_rate, { alreadyPct: true, decimals: 0 })}</TD>
      <TD numeric><Money value={net} /></TD>
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

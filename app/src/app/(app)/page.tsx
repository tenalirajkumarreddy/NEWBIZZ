import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getCurrentFy } from "@/lib/data/fy";
import { getArAging, summariseArAging } from "@/lib/data/accounting";
import { getRecentNotifications } from "@/lib/data/notifications";
import { getLicensesDue, partitionLicenses } from "@/lib/data/licenses";
import { getSalesTodayKpis, listOrders } from "@/lib/data/sales";
import { listReorderAlerts } from "@/lib/data/stock";
import { listCashHoldings, listStockHoldings, listTransfers } from "@/lib/data/holdings";
import { Panel } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { DashboardMetrics, Metric } from "@/components/dashboard/DashboardMetrics";
import { count as fmtCount, dateIST, dateTimeIST, titleCase, rupeesCompact, qty as fmtQty } from "@/lib/format";

// Dashboard — the "tactical operations console" layout (see
// docs/superpowers/specs/newbizz-tactical-dashboard.html). Structure is faithful
// to that mockup: a metric row with progress bars, an Open Orders table, and a
// right rail of Pending Actions / Reorder Alerts / Holdings / Licences / Activity.
//
// Data policy: every widget is a server-side read against the typed data layer,
// rendered under RLS as the signed-in user. Where a module's reader exists we
// show real numbers; where it doesn't yet (production) we render an honest
// "pending module" stub rather than mock data, so nothing on screen is fictional.
export default async function DashboardPage() {
  const session = await getSession();
  const branchId = session?.claims.branch_id ?? null;

  // Fetch the independent widgets concurrently.
  const [fy, aging, inbox, licenses, kpis, openOrders, reorderAlerts, cashHoldings, stockHoldings, transfers] =
    await Promise.all([
      getCurrentFy(),
      getArAging(branchId),
      getRecentNotifications(10),
      getLicensesDue(),
      getSalesTodayKpis(),
      listOrders({ status: "confirmed", limit: 8 }),
      listReorderAlerts({ limit: 8 }),
      listCashHoldings(),
      listStockHoldings(),
      listTransfers({ limit: 50 }),
    ]);

  const ar = summariseArAging(aging);
  const { expired, expiring } = partitionLicenses(licenses);
  const licenseAlerts = expired.length + expiring.length;
  const dueLicenses = [...expired, ...expiring];

  // Holdings summary — cash in custody + stock carrying value across users.
  const cashInCustody = cashHoldings.reduce((s, h) => s + h.amount, 0);
  const stockInCustody = stockHoldings.reduce((s, h) => s + h.carryingValue, 0);
  const custodians = new Set([
    ...cashHoldings.map((h) => h.userId),
    ...stockHoldings.map((h) => h.userId),
  ]).size;

  // Pending actions — handovers/deposits awaiting the recipient's response.
  const pendingTransfers = transfers.filter((t) => t.status === "pending");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {fy ? `FY ${fy.code}` : "FY —"} — Real-time operational overview
            {" · "}
            {branchId ? "your branch" : "all branches"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm">Export</Button>
          <Button variant="primary" size="sm">Refresh</Button>
        </div>
      </div>

      {/* ── Metrics ─────────────────────────────────────────────────── */}
      <DashboardMetrics>
        <Metric
          label="Sales Today"
          value={<Money value={kpis.salesTotal} compact />}
          delta={
            kpis.invoiceCount > 0
              ? `${fmtCount(kpis.invoiceCount)} invoices · ${rupeesCompact(kpis.taxTotal)} tax`
              : "No sales yet today"
          }
          tone={kpis.salesTotal > 0 ? "grn" : "muted"}
        />
        <Metric
          label="Collections Today"
          value={<Money value={kpis.collectionsTotal} compact />}
          delta={
            kpis.receiptCount > 0
              ? `${fmtCount(kpis.receiptCount)} receipts`
              : "Nothing collected yet"
          }
          tone={kpis.collectionsTotal > 0 ? "brand" : "muted"}
        />
        <Metric
          label="Open Orders"
          value={fmtCount(openOrders.length)}
          delta={
            openOrders.length > 0
              ? `${rupeesCompact(openOrders.reduce((s, o) => s + o.netValue, 0))} awaiting invoice`
              : "Nothing awaiting invoice"
          }
          tone={openOrders.length > 0 ? "amb" : "grn"}
        />
        <Metric
          label="Receivables Outstanding"
          value={<Money value={ar.totalOutstanding} compact />}
          delta={`${fmtCount(ar.partyCount)} parties · ${fmtCount(ar.invoiceCount)} invoices`}
          tone={ar.totalOutstanding > 0 ? "amb" : "grn"}
        />
      </DashboardMetrics>

      {/* ── Content: main column + right rail ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div className="flex flex-col gap-4">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                Production <span className="font-normal text-ink-4">// Stage 1 → Stage 2</span>
              </span>
            }
            actions={<Badge tone="slate" size="sm">Pending module</Badge>}
            flush
          >
            <EmptyState
              title="Production monitor not wired yet"
              description="Stage-1 blowing and Stage-2 filling throughput will stream here once the production module lands."
            />
          </Panel>

          <Panel
            title="Open Sales Orders"
            actions={
              <Link href="/orders" className="text-[12px] font-medium text-brand hover:underline">
                Order Book →
              </Link>
            }
            flush
            className="flex-1"
          >
            {openOrders.length === 0 ? (
              <EmptyState
                title="No orders awaiting invoice"
                description="Confirmed orders queue here until they're invoiced from the Order Book."
                action={
                  <Link href="/orders/new">
                    <Button variant="secondary" size="sm">Place an order</Button>
                  </Link>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Order No</TH>
                    <TH>Date</TH>
                    <TH>Store</TH>
                    <TH numeric>Net Value</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {openOrders.map((o) => (
                    <TR key={o.id} interactive>
                      <TD className="p-0">
                        <Link
                          href={`/orders/${o.id}`}
                          className="block px-3 py-2.5 font-mono text-[12px] font-semibold text-brand"
                        >
                          {o.order_no}
                        </Link>
                      </TD>
                      <TD>{dateIST(o.order_date)}</TD>
                      <TD className="font-medium text-ink">{o.storeName ?? "—"}</TD>
                      <TD numeric><Money value={o.netValue} /></TD>
                      <TD><StatusBadge status={o.status} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>

          <Panel
            title="Reorder Alerts"
            actions={
              reorderAlerts.length > 0 ? (
                <Link href="/stock" className="text-[12px] font-medium text-brand hover:underline">
                  Warehouse Stock →
                </Link>
              ) : (
                <Badge tone="grn" size="sm">OK</Badge>
              )
            }
            flush
          >
            {reorderAlerts.length === 0 ? (
              <EmptyState
                title="Nothing to reorder"
                description="Items sitting at or below their reorder level will appear here, and the operator is notified on the crossing."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Item</TH>
                    <TH>Branch</TH>
                    <TH numeric>On hand</TH>
                    <TH numeric>Reorder ≤</TH>
                  </TR>
                </THead>
                <TBody>
                  {reorderAlerts.map((r) => (
                    <TR key={`${r.itemId}-${r.branchId}`}>
                      <TD className="font-mono text-[12px] font-semibold text-ink">{r.itemSku}</TD>
                      <TD className="font-medium text-ink">{r.itemName}</TD>
                      <TD className="text-ink-3">{r.branchName}</TD>
                      <TD numeric className="font-mono text-amb tnum">
                        {fmtQty(r.qtyOnHand)}{r.baseUnitCode ? ` ${r.baseUnitCode}` : ""}
                      </TD>
                      <TD numeric className="font-mono text-ink-4 tnum">{fmtQty(r.reorderLevel)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>
        </div>

        {/* RIGHT RAIL */}
        <div className="flex flex-col gap-4">
          <Panel
            title="Pending Actions"
            actions={
              pendingTransfers.length > 0 ? (
                <Badge tone="amb" size="sm">{fmtCount(pendingTransfers.length)}</Badge>
              ) : (
                <Badge tone="grn" size="sm">Clear</Badge>
              )
            }
            flush
          >
            {pendingTransfers.length === 0 ? (
              <EmptyState
                title="No actions waiting"
                description="Cash handovers, bank deposits and stock transfers awaiting a response will surface here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {pendingTransfers.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {t.fromLabel} → {t.toLabel}
                      </p>
                      <p className="font-mono text-[11px] text-ink-4">
                        {t.transferNo} · {titleCase(t.type)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {t.amount != null ? (
                        <span className="font-mono text-[13px] font-semibold text-ink tnum">
                          <Money value={t.amount} />
                        </span>
                      ) : (
                        <span className="text-[12px] text-ink-3">
                          {fmtCount(t.lines.length)} {t.lines.length === 1 ? "item" : "items"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
                <li className="px-4 py-2.5">
                  <Link href="/holdings" className="text-[12px] font-medium text-brand hover:underline">
                    Holdings &amp; Handover →
                  </Link>
                </li>
              </ul>
            )}
          </Panel>

          <Panel
            title="Holdings in Custody"
            actions={
              custodians > 0 ? (
                <Link href="/holdings" className="text-[12px] font-medium text-brand hover:underline">
                  Details →
                </Link>
              ) : undefined
            }
            flush
          >
            {custodians === 0 ? (
              <EmptyState
                title="Nothing in custody"
                description="Cash and stock held by operators and agents (outside the warehouse) will summarise here."
              />
            ) : (
              <div className="flex flex-col gap-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-fill p-3">
                    <div className="eyebrow text-ink-4">Cash in custody</div>
                    <div className="mt-1 font-mono text-[16px] font-bold text-ink tnum">
                      <Money value={cashInCustody} />
                    </div>
                  </div>
                  <div className="rounded-lg bg-fill p-3">
                    <div className="eyebrow text-ink-4">Stock in custody</div>
                    <div className="mt-1 font-mono text-[16px] font-bold text-ink tnum">
                      <Money value={stockInCustody} />
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-ink-4">
                  Across {fmtCount(custodians)} {custodians === 1 ? "custodian" : "custodians"} ·
                  reconciles nightly against the ledger.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="Licence Alerts"
            actions={
              licenseAlerts > 0 ? (
                <Badge tone={expired.length > 0 ? "red" : "amb"} size="sm">
                  {fmtCount(licenseAlerts)}
                </Badge>
              ) : (
                <Badge tone="grn" size="sm">OK</Badge>
              )
            }
            flush
          >
            {licenseAlerts === 0 ? (
              <EmptyState
                title="All licences current"
                description="Expiries within the alert window will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {dueLicenses.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {titleCase(l.type)}
                      </p>
                      <p className="font-mono text-[11px] text-ink-4">{l.license_no}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge
                        status={l.is_expired ? "expired" : "expiring"}
                        size="sm"
                        label={l.is_expired ? "Expired" : `${l.days_to_expiry}d`}
                      />
                      <p className="mt-1 font-mono text-[11px] text-ink-4">
                        {dateIST(l.expiry_date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent Activity"
            actions={
              inbox.items.length > 0 ? (
                <Badge tone="neutral" size="sm">{fmtCount(inbox.items.length)}</Badge>
              ) : undefined
            }
            flush
            className="flex-1"
          >
            {inbox.items.length === 0 ? (
              <EmptyState
                title="Nothing yet"
                description="Order, invoice and collection events will stream here as they happen."
              />
            ) : (
              <ul className="divide-y divide-line">
                {inbox.items.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <StatusBadge status={n.severity} size="sm" label={n.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-ink-4">{n.body}</p>
                      )}
                    </div>
                    <time className="shrink-0 font-mono text-[11px] text-ink-4">
                      {dateTimeIST(n.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}


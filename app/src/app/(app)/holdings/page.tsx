import { listCashHoldings, listStockHoldings, listTransfers, listActiveUsers, getMyHoldings } from "@/lib/data/holdings";
import { listBranches, listStockableItems } from "@/lib/data/stock";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { count as fmtCount, qty as fmtQty, rupeesCompact } from "@/lib/format";
import { TransferList } from "./TransferList";
import { NewTransferPanel } from "./NewTransferPanel";

export const metadata = { title: "Holdings & Handover — NEWBIZZ" };

export default async function HoldingsPage() {
  const [cash, stock, transfers, users, branches, items, mine] = await Promise.all([
    listCashHoldings(),
    listStockHoldings(),
    listTransfers({ limit: 100 }),
    listActiveUsers(),
    listBranches(),
    listStockableItems(),
    getMyHoldings(),
  ]);

  const totalCash = cash.reduce((s, r) => s + r.amount, 0);
  const totalStockValue = stock.reduce((s, r) => s + r.carryingValue, 0);
  const pending = transfers.filter((t) => t.status === "pending");

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Holdings & Handover</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Cash and stock in staff custody · {rupeesCompact(totalCash)} cash ·{" "}
            {rupeesCompact(totalStockValue)} stock value
            {pending.length > 0 ? ` · ${fmtCount(pending.length)} pending transfer${pending.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {pending.length > 0 && (
          <Badge tone="amb" size="sm">{fmtCount(pending.length)} awaiting response</Badge>
        )}
      </div>

      <NewTransferPanel
        users={users}
        branches={branches}
        items={items}
        myUserId={mine.userId}
        myCash={mine.cash}
        myStock={mine.stock.map((s) => ({
          itemId: s.itemId,
          sku: s.itemSku,
          name: s.itemName,
          qty: s.qty,
          baseUnitCode: s.baseUnitCode,
        }))}
      />

      <TransferList transfers={transfers} myUserId={mine.userId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Cash in custody" flush>
          {cash.length === 0 ? (
            <EmptyState
              title="No cash in custody"
              description="Cash lands here when collections are deposited to a user's custody (2140). Hand it up the chain or deposit it to the bank."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Custodian</TH>
                  <TH numeric>Amount</TH>
                </TR>
              </THead>
              <TBody>
                {cash.map((r) => (
                  <TR key={r.userId}>
                    <TD className="font-medium text-ink">{r.userName}</TD>
                    <TD numeric><Money value={r.amount} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>

        <Panel title="Stock in custody" flush>
          {stock.length === 0 ? (
            <EmptyState
              title="No stock in custody"
              description="Stock lands here when a warehouse issues goods to a user via a handover. Quantity is authoritative; value stays in inventory."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Custodian</TH>
                  <TH>Item</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Value</TH>
                </TR>
              </THead>
              <TBody>
                {stock.map((r) => (
                  <TR key={`${r.userId}-${r.itemId}`}>
                    <TD className="font-medium text-ink">{r.userName}</TD>
                    <TD>
                      <span className="font-mono text-[12px] font-semibold text-ink">{r.itemSku}</span>{" "}
                      <span className="text-ink-2">{r.itemName}</span>
                    </TD>
                    <TD numeric className="font-mono text-[12px] tnum">
                      {fmtQty(r.qty)}{r.baseUnitCode ? ` ${r.baseUnitCode}` : ""}
                    </TD>
                    <TD numeric><Money value={r.carryingValue} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      </div>

      <p className="text-[12px] text-ink-4">
        Balances move only when the receiver accepts — accept is all-or-nothing in one
        transaction. Cash moves post a journal (2140 by custodian); stock moves keep value in
        inventory.
      </p>
    </div>
  );
}

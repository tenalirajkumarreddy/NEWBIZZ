"use client";

// =====================================================================
// TransferList — the handover register (§4.7). Pending transfers addressed
// to the signed-in user get Accept / Reject buttons; the sender can cancel
// their own pending transfers. Warehouse-destined transfers can be accepted
// by anyone with stock.transfer (the DB enforces it).
// =====================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { dateTimeIST, qty as fmtQty } from "@/lib/format";
import { respondTransfer, cancelTransfer } from "@/lib/actions/transfers";
import type { TransferRow } from "@/lib/data/holdings";

const STATUS_TONE: Record<TransferRow["status"], "amb" | "grn" | "red" | "slate"> = {
  pending: "amb",
  accepted: "grn",
  rejected: "red",
  cancelled: "slate",
};

export function TransferList({
  transfers,
  myUserId,
}: {
  transfers: TransferRow[];
  myUserId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function act(id: string, fn: () => Promise<{ ok: boolean } & Record<string, unknown>>, okMsg: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = (await fn()) as { ok: true } | { ok: false; error: string };
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error("Nothing changed", res.error);
      }
      setBusyId(null);
    });
  }

  return (
    <Panel title="Handover register" flush>
      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Create a cash or stock handover above. The receiver accepts or rejects it; balances move only on accept."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>No.</TH>
              <TH>Type</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH>What</TH>
              <TH>Created</TH>
              <TH>Status</TH>
              <TH className="w-[180px]" aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {transfers.map((t) => {
              const iAmReceiver = t.toUserId != null && t.toUserId === myUserId;
              const iAmSender = t.fromUserId != null && t.fromUserId === myUserId;
              const canRespond =
                t.status === "pending" && (iAmReceiver || (t.toUserId == null && !t.isDeposit));
              const canCancel = t.status === "pending" && iAmSender;
              const busy = pending && busyId === t.id;
              return (
                <TR key={t.id}>
                  <TD className="font-mono text-[12px] font-semibold text-ink">{t.transferNo}</TD>
                  <TD>
                    <Badge tone={t.type === "cash" ? "brand" : "slate"} size="sm">
                      {t.isDeposit ? "Bank deposit" : t.type === "cash" ? "Cash" : "Stock"}
                    </Badge>
                  </TD>
                  <TD className="text-ink-2">{t.fromLabel}</TD>
                  <TD className="text-ink-2">{t.toLabel}</TD>
                  <TD>
                    {t.type === "cash" ? (
                      <Money value={t.amount ?? 0} />
                    ) : (
                      <span className="text-[12px] text-ink-2">
                        {t.lines
                          .map((l) => `${l.itemSku} × ${fmtQty(l.qty)}${l.baseUnitCode ? ` ${l.baseUnitCode}` : ""}`)
                          .join(", ")}
                      </span>
                    )}
                  </TD>
                  <TD className="text-[12px] text-ink-3">{dateTimeIST(t.createdAt)}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[t.status]} size="sm">{t.status}</Badge>
                  </TD>
                  <TD>
                    {canRespond && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() =>
                            act(t.id, () => respondTransfer(t.id, true), `${t.transferNo} accepted`)
                          }
                          loading={busy}
                          disabled={pending}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            act(t.id, () => respondTransfer(t.id, false), `${t.transferNo} rejected`)
                          }
                          disabled={pending}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {!canRespond && canCancel && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            act(t.id, () => cancelTransfer(t.id), `${t.transferNo} cancelled`)
                          }
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

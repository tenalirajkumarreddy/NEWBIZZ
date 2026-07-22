"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { qty as fmtQty } from "@/lib/format";
import { calcSchemeEligibility, postSchemeCreditNote } from "@/lib/actions/creditnotes";
import type { SchemeEligibilityRow, SchemeStatus } from "@/lib/data/creditnotes";

// Eligibility surface on a scheme (§7.5). "Recalculate" runs the month-end
// volume calc (calc_scheme_eligibility); each pending row can be posted as a
// customer credit note (post_scheme_credit_note), which reverses proportional
// GST when the scheme is gst_adjusted. Posted rows link to their credit note.
export function SchemeEligibilityPanel({
  schemeId,
  schemeStatus,
  rows,
}: {
  schemeId: string;
  schemeStatus: SchemeStatus;
  rows: SchemeEligibilityRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [calcing, startCalc] = useTransition();
  const [posting, startPost] = useTransition();
  const [busyRow, setBusyRow] = useState<string | null>(null);

  function onCalc() {
    startCalc(async () => {
      const res = await calcSchemeEligibility(schemeId);
      if (res.ok) {
        toast.success("Eligibility recalculated", `${res.rows} store(s) scored.`);
        router.refresh();
      } else {
        toast.error("Could not recalculate", res.error);
      }
    });
  }

  function onPost(row: SchemeEligibilityRow) {
    setBusyRow(row.id);
    startPost(async () => {
      const res = await postSchemeCreditNote(row.id, schemeId);
      setBusyRow(null);
      if (res.ok) {
        toast.success("Rebate posted", "Credit note created for the store.");
        router.refresh();
      } else {
        toast.error("Could not post rebate", res.error);
      }
    });
  }

  return (
    <Panel
      title="Store eligibility"
      flush
      actions={
        <Button variant="secondary" size="sm" onClick={onCalc} loading={calcing} disabled={schemeStatus === "closed"}>
          Recalculate
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Not scored yet"
          description="Run Recalculate to score each store's case volume over the scheme window against the tiers."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Store</TH>
              <TH>Customer</TH>
              <TH numeric>Volume</TH>
              <TH numeric>Tier</TH>
              <TH numeric>Rebate</TH>
              <TH>Status</TH>
              <TH className="w-40">Action</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium text-ink">{r.storeName ?? "—"}</TD>
                <TD className="text-ink-3">{r.customerName ?? "—"}</TD>
                <TD numeric>{fmtQty(r.totalVolume)}</TD>
                <TD numeric>{r.tierAchieved ?? "—"}</TD>
                <TD numeric><Money value={r.rebateAmount} /></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>
                  {r.status === "posted" && r.creditNoteId ? (
                    <Link
                      href={`/credit-notes/${r.creditNoteId}`}
                      className="text-[12px] font-semibold text-brand hover:underline"
                    >
                      View credit note →
                    </Link>
                  ) : r.status === "pending_approval" ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onPost(r)}
                      loading={posting && busyRow === r.id}
                      disabled={posting || r.rebateAmount <= 0}
                    >
                      Approve &amp; post
                    </Button>
                  ) : (
                    <span className="text-[12px] text-ink-4">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

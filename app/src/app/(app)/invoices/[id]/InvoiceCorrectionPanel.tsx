"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { voidInvoice, convertInvoiceType } from "@/lib/actions/sales";

// Correction surface for a wrong-type or mistaken sale (§4.5 sibling to the
// sales return). Two audit-safe operations, both routed through SECURITY DEFINER
// RPCs that reverse the journal + COGS and restock before doing anything else:
//   • Void            — cancel the document outright (issued in error)
//   • Convert type    — void it and re-issue the SAME lines as the opposite
//                       kind (tax invoice ↔ cash memo), recomputing GST/ledger
// Both refuse a doc with receipts allocated; un-allocate first. Never renumbers.
export function InvoiceCorrectionPanel({
  invoiceId,
  invoiceNo,
  isOfficial,
  amountPaid,
}: {
  invoiceId: string;
  invoiceNo: string;
  isOfficial: boolean;
  amountPaid: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<null | "void" | "convert">(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const locked = amountPaid > 0.005;
  const oppositeLabel = isOfficial ? "cash memo" : "tax invoice";

  function reset() {
    setMode(null);
    setReason("");
  }

  function onVoid() {
    startTransition(async () => {
      const res = await voidInvoice(invoiceId, reason.trim() || undefined);
      if (res.ok) {
        toast.success("Invoice voided", `${invoiceNo} was reversed and marked void.`);
        reset();
        router.refresh();
      } else {
        toast.error("Could not void", res.error);
      }
    });
  }

  function onConvert() {
    startTransition(async () => {
      const res = await convertInvoiceType(invoiceId, reason.trim() || undefined);
      if (res.ok) {
        toast.success(
          "Re-issued",
          `${invoiceNo} was voided and re-issued as a ${oppositeLabel}.`,
        );
        reset();
        router.push(`/invoices/${res.invoiceId}`);
        router.refresh();
      } else {
        toast.error("Could not convert", res.error);
      }
    });
  }

  if (locked) {
    return (
      <Card className="p-3.5">
        <p className="text-[12px] text-ink-4">
          This {isOfficial ? "tax invoice" : "cash memo"} has payments allocated, so it
          can&apos;t be voided or converted. Un-allocate the receipts first, or record a
          sales return instead.
        </p>
      </Card>
    );
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-ink-4">
          Wrong document type or issued by mistake? Fix it here — the reversal is
          audit-safe and restocks the goods.
        </span>
        <Button variant="secondary" size="sm" onClick={() => setMode("convert")}>
          Re-issue as {oppositeLabel}
        </Button>
        <Button variant="danger" size="sm" onClick={() => setMode("void")}>
          Void
        </Button>
      </div>
    );
  }

  const isVoid = mode === "void";

  return (
    <Panel title={isVoid ? "Void this document" : `Re-issue as a ${oppositeLabel}`} flush>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] text-ink-2">
          {isVoid ? (
            <>
              Voiding <span className="font-mono font-semibold">{invoiceNo}</span> reverses
              its journal entry and COGS, returns the sold goods to stock, and reverses the
              customer ledger. The document is kept but marked <strong>void</strong> — it is
              never deleted or renumbered.
            </>
          ) : (
            <>
              This voids <span className="font-mono font-semibold">{invoiceNo}</span> (a{" "}
              {isOfficial ? "tax invoice" : "cash memo"}) and re-issues the same lines as a{" "}
              <strong>{oppositeLabel}</strong>, recomputing{" "}
              {isOfficial ? "without GST" : "with GST"} and the correct ledger postings. A new
              document number is assigned; the voided one stays for the audit trail.
            </>
          )}
        </p>

        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={
            isVoid ? "Reason for voiding (optional)" : "Reason for the correction (optional)"
          }
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
            Cancel
          </Button>
          {isVoid ? (
            <Button variant="danger" size="sm" onClick={onVoid} loading={pending}>
              Confirm void
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={onConvert} loading={pending}>
              Void &amp; re-issue as {oppositeLabel}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}

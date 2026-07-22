"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { TR, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { dateIST } from "@/lib/format";
import { payEmi } from "@/lib/actions/loans";

const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export interface Row {
  id: string;
  installmentNo: number;
  dueDate: string;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  balance: number;
  paid: boolean;
  paidOn: string | null;
  paymentJournalId: string | null;
}

// One amortization row with an inline "Pay" that posts the EMI journal. Only the
// earliest unpaid installment is payable in the UI (payable flag from the parent
// gates the whole schedule; here we let any unpaid row pay, RPC is authoritative).
export function LoanScheduleRow({ loanId, row, payable }: { loanId: string; row: Row; payable: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onPay() {
    startTransition(async () => {
      const res = await payEmi(row.id, loanId, todayIST());
      if (res.ok) {
        toast.success("EMI paid", `Installment #${row.installmentNo} posted.`);
        router.refresh();
      } else {
        toast.error("Could not pay EMI", res.error);
      }
    });
  }

  return (
    <TR>
      <TD className="text-ink-4">{row.installmentNo}</TD>
      <TD>{dateIST(row.dueDate)}</TD>
      <TD numeric><Money value={row.emiAmount} /></TD>
      <TD numeric><Money value={row.principalComponent} /></TD>
      <TD numeric><Money value={row.interestComponent} /></TD>
      <TD numeric><Money value={row.balance} /></TD>
      <TD>
        {row.paid ? (
          <span className="text-[12px] font-medium text-grn">Paid {row.paidOn ? dateIST(row.paidOn) : ""}</span>
        ) : (
          <span className="text-[12px] text-ink-4">Due</span>
        )}
      </TD>
      <TD>
        {row.paid ? (
          row.paymentJournalId ? (
            <Link href={`/journal/${row.paymentJournalId}`} className="text-[12px] font-medium text-brand hover:underline">Entry →</Link>
          ) : null
        ) : payable ? (
          <Button variant="secondary" size="sm" onClick={onPay} loading={pending}>Pay</Button>
        ) : null}
      </TD>
    </TR>
  );
}

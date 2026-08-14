"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Badge, Button, Money, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { setChequeStatus, bounceCheque, registerCheque } from "@/lib/actions/bank";
import type { ChequeRow } from "@/lib/data/bank";

interface Props {
  cheques: ChequeRow[];
}

const STATUS_ORDER = ["registered", "deposited", "cleared", "bounced", "cancelled"];

export function ChequeRegister({ cheques }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);

  const filtered = filter === "all" ? cheques : cheques.filter((c) => c.status === filter);

  async function handleStatus(chequeId: string, status: string) {
    try {
      if (status === "bounced") {
        await bounceCheque(chequeId, "Bounced");
      } else {
        await setChequeStatus(chequeId, status);
      }
      toast.success(`Cheque ${status}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-ink-3">Filter:</span>
        {["all", ...STATUS_ORDER].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
              filter === s ? "bg-brand text-white" : "bg-fill text-ink-3 hover:text-ink"
            }`}
          >
            {s}
            {s !== "all" && (
              <span className="ml-1">{cheques.filter((c) => c.status === s).length}</span>
            )}
          </button>
        ))}
        <div className="ml-auto">
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ Register Cheque"}
          </Button>
        </div>
      </div>

      {showForm && <RegisterChequeForm onDone={() => { setShowForm(false); router.refresh(); }} />}

      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <THead>
            <TR>
              <TH>Cheque No.</TH>
              <TH>Direction</TH>
              <TH>Party</TH>
              <TH numeric>Amount</TH>
              <TH>Date</TH>
              <TH>Status</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[13px] text-ink-3">No cheques found.</TD></TR>
            )}
            {filtered.map((c) => {
              const tone = c.status === "cleared" || c.status === "inbound" ? "grn"
                : c.status === "bounced" || c.status === "outbound" ? "amb"
                : c.status === "cancelled" ? "slate"
                : "brand";
              return (
                <TR key={c.id}>
                  <TD className="font-mono text-[13px] font-medium">{c.chequeNo}</TD>
                  <TD>
                    <Badge tone={c.direction === "inbound" ? "grn" : "brand"}>
                      {c.direction === "inbound" ? "Inbound (Received)" : "Outbound (Issued)"}
                    </Badge>
                  </TD>
                  <TD>{c.partyType ? `${c.partyType} ${c.partyId ? c.partyId.slice(0, 8) : ""}` : "—"}</TD>
                  <TD numeric className="font-medium text-ink">
                    <Money value={c.amount} />
                  </TD>
                  <TD className="whitespace-nowrap text-ink-3">{c.chequeDate ?? "—"}</TD>
                  <TD>
                    <Badge tone={tone}>{c.status}</Badge>
                  </TD>
                  <TD>
                    <ChequeActions cheque={c} onAction={handleStatus} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function ChequeActions({ cheque, onAction }: { cheque: ChequeRow; onAction: (id: string, status: string) => void }) {
  if (cheque.status === "bounced" || cheque.status === "cancelled") return <span className="text-[12px] text-ink-3">—</span>;

  const nextStatus =
    cheque.status === "registered" ? "deposited" :
    cheque.status === "deposited" ? "cleared" : null;

  return (
    <div className="flex items-center gap-1">
      {nextStatus && (
        <Button
          variant="ghost"
          size="sm"
          className="text-grn hover:bg-grn-wash hover:text-grn"
          onClick={() => onAction(cheque.id, nextStatus)}
        >
          {nextStatus === "deposited" ? "Deposit" : "Clear"}
        </Button>
      )}
      {cheque.status === "registered" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-red hover:bg-red-wash hover:text-red"
          onClick={() => onAction(cheque.id, "bounced")}
        >
          Bounce
        </Button>
      )}
      {(cheque.status === "registered" || cheque.status === "deposited") && (
        <Button
          variant="ghost"
          size="sm"
          className="text-ink-3 hover:bg-fill hover:text-ink"
          onClick={() => onAction(cheque.id, "cancelled")}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function RegisterChequeForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData(e.currentTarget);
      await registerCheque({
        direction: data.get("direction") as "inbound" | "outbound",
        chequeNo: data.get("chequeNo") as string,
        amount: Number(data.get("amount")),
        chequeDate: (data.get("chequeDate") as string) || undefined,
        partyType: (data.get("partyType") as string) || undefined,
        notes: (data.get("notes") as string) || undefined,
      });
      toast.success("Cheque registered");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to register");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Direction</span>
          <select name="direction" required className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
            <option value="inbound">Inbound (Received)</option>
            <option value="outbound">Outbound (Issued)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Cheque No.</span>
          <input name="chequeNo" required className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Amount (₹)</span>
          <input name="amount" type="number" step="0.01" required className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Date</span>
          <input name="chequeDate" type="date" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Party Type</span>
          <select name="partyType" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
            <option value="">—</option>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-3">Notes</span>
          <input name="notes" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink" />
        </label>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving..." : "Register"}</Button>
      </form>
    </Panel>
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

interface PendingRefill {
  id: string;
  eventType: string;
  detectedAt: string;
  prevAmount: number;
  newAmount: number;
  deltaLitres: number;
  status: string;
  fraudAlert: boolean;
}

interface Props {
  refills: PendingRefill[];
  vehicleId: string;
}

export default function PendingRefillsSection({ refills, vehicleId }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [adminAmount, setAdminAmount] = useState("");
  const [adminLitres, setAdminLitres] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingItems = refills.filter((r) => r.status === "pending");

  if (pendingItems.length === 0) return null;

  async function handleConfirm(eventId: string, estimatedL: number) {
    const amount = parseFloat(adminAmount);
    const litres = parseFloat(adminLitres);
    if (!amount || amount <= 0) {
      setMessage("Please enter a valid paid amount (₹) greater than 0.");
      return;
    }
    if (!litres || litres <= 0) {
      setMessage("Please enter valid litres.");
      return;
    }
    setPending(true);
    setMessage(null);
    const { confirmFuelRefill } = await import("@/lib/actions/fleet");
    const res = await confirmFuelRefill(eventId, vehicleId, amount, litres);
    setMessage(res.ok ? "Confirmed and linked to fuel log." : res.error ?? "Error");
    setConfirmingId(null);
    setAdminAmount("");
    setAdminLitres("");
    setPending(false);
  }

  async function handleDismiss(eventId: string) {
    setPending(true);
    const { dismissFuelRefill } = await import("@/lib/actions/fleet");
    await dismissFuelRefill(eventId);
    setConfirmingId(null);
    setPending(false);
    setMessage("Dismissed.");
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink flex items-center gap-2">
        Pending Fuel Events
        <span className="inline-flex items-center justify-center size-5 rounded-full bg-amb text-[10px] font-bold text-white">
          {pendingItems.length}
        </span>
      </h3>

      <Table>
        <THead>
          <TR>
            <TH>Time</TH>
            <TH>Type</TH>
            <TH numeric>Prev</TH>
            <TH numeric>New</TH>
            <TH numeric>Est. L</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {pendingItems.map((r) => {
            const isConfirming = confirmingId === r.id;
            return (
              <TR key={r.id} className={r.fraudAlert ? "bg-red/5" : ""}>
                <TD className="font-mono text-[12px] text-ink-3">
                  {new Date(r.detectedAt).toLocaleString("en-IN")}
                </TD>
                <TD>
                  <Badge tone={r.eventType === "leak" ? "red" : "amb"} size="sm">
                    {r.eventType === "leak" ? "Leak" : "Refill"}
                  </Badge>
                  {r.fraudAlert && <span className="ml-1 text-red text-[11px]">⚠ Fraud</span>}
                </TD>
                <TD numeric className="font-mono tnum">{r.prevAmount.toFixed(1)}</TD>
                <TD numeric className="font-mono tnum">{r.newAmount.toFixed(1)}</TD>
                <TD numeric className="font-mono tnum">+{r.deltaLitres.toFixed(1)}</TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="primary" onClick={() => {
                      setConfirmingId(r.id);
                      setAdminLitres(r.deltaLitres.toFixed(1));
                      setAdminAmount("");
                    }}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDismiss(r.id)} disabled={pending}>
                      Dismiss
                    </Button>
                  </div>
                  {isConfirming && (
                    <div className="mt-2 flex flex-col gap-2 border border-line rounded-lg p-2 bg-surface">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Paid (₹)">
                          <Input
                            type="number"
                            step="any"
                            mono
                            value={adminAmount}
                            onChange={(e) => setAdminAmount(e.target.value)}
                          />
                        </Field>
                        <Field label="Litres">
                          <Input
                            type="number"
                            step="any"
                            mono
                            value={adminLitres}
                            onChange={(e) => setAdminLitres(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleConfirm(r.id, r.deltaLitres)} disabled={pending}>
                          {pending ? "Saving…" : "Save & Link"}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {message && (
        <p className="text-[12px] text-ink-3">{message}</p>
      )}
    </div>
  );
}

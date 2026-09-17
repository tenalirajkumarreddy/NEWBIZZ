"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { rupeesCompact } from "@/lib/format";
import { addWorker, adjustBalance } from "@/lib/actions/payroll";
import { WorkerDrawer } from "./WorkerDrawer";
import { PayModal } from "./PayModal";
import { EditProfileDrawer } from "./EditProfileDrawer";
import type { WorkerBalance, WorkerRow } from "@/lib/data/payroll";

type PayTarget = { worker: WorkerBalance; kind: "payment" | "advance" };

export function WorkerList({
  workers,
  manualWorkers,
  canManage,
}: {
  workers: WorkerBalance[];
  manualWorkers: WorkerRow[];
  canManage: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [selectedWorker, setSelectedWorker] = useState<WorkerBalance | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<WorkerBalance | null>(null);
  const [editWorker, setEditWorker] = useState<WorkerBalance | null>(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAadhar, setNewAadhar] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Merge balances with manual workers that have no balance yet
  const balanceMap = new Map(workers.map((w) => [w.userId, w]));
  const manualIds = new Set(manualWorkers.map((mw) => mw.id));
  const allWorkers: WorkerBalance[] = [
    ...workers,
    ...manualWorkers
      .filter((mw) => !balanceMap.has(mw.id))
      .map((mw) => ({
        userId: mw.id,
        fullName: mw.fullName,
        balance: 0,
        photoUrl: mw.photoUrl,
        entityType: "worker" as const,
      })),
  ];

  function entityTypeOf(w: WorkerBalance): "user" | "worker" {
    return w.entityType ?? (manualIds.has(w.userId) ? "worker" : "user");
  }

  const totalOutstanding = allWorkers.reduce((s, w) => s + Math.max(0, w.balance), 0);
  const totalAdvances = allWorkers.reduce((s, w) => s + Math.max(0, -w.balance), 0);

  async function handleAddWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    const result = await addWorker(newName.trim(), newPhone || null, newAadhar || null, newAddress || null);
    if (!result.ok) {
      toast.error("Failed to add worker", result.error);
    } else {
      toast.success("Worker added");
      setShowAddWorker(false);
      setNewName("");
      setNewPhone("");
      setNewAadhar("");
      setNewAddress("");
      router.refresh();
    }
    setAdding(false);
  }

  function openAdjust(w: WorkerBalance) {
    setAdjustTarget(w);
    setAdjustAmount("");
    setAdjustReason("");
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Amount must be a non-zero number (use − to reduce)");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setAdjusting(true);
    // Ledger-only correction — adjustBalance posts no journal.
    const result = await adjustBalance(
      adjustTarget.userId,
      amount,
      adjustReason.trim(),
      entityTypeOf(adjustTarget),
    );
    if (!result.ok) {
      toast.error("Adjustment failed", result.error);
    } else {
      toast.success("Adjustment recorded");
      setAdjustTarget(null);
      router.refresh();
    }
    setAdjusting(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Total Workers</p>
            <p className="mt-1 text-[22px] font-bold text-ink">{allWorkers.length}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Outstanding Pay</p>
            <p className="mt-1 text-[22px] font-bold text-green-600 dark:text-emerald-400">{rupeesCompact(totalOutstanding)}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Advances</p>
            <p className="mt-1 text-[22px] font-bold text-red-500 dark:text-red-400">{rupeesCompact(totalAdvances)}</p>
          </div>
        </div>
        {canManage && (
          <Button variant="primary" size="sm" onClick={() => setShowAddWorker(true)}>
            + Add Worker
          </Button>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        Green: warehouse owes the worker · Red: worker owes the warehouse (advance)
      </p>

      <Panel flush className="mt-4">
        {allWorkers.length === 0 ? (
          <EmptyState title="No workers" description="No workers found. Add one manually or set up payroll for app users." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Worker</TH>
                <TH numeric>Balance</TH>
                {canManage && <TH className="w-64" />}
              </TR>
            </THead>
            <TBody>
              {allWorkers.map((w) => (
                <TR
                  key={w.userId}
                  className="cursor-pointer transition-colors hover:bg-fill/50"
                  onClick={() => setSelectedWorker(w)}
                >
                  <TD>
                    <div className="flex items-center gap-2.5">
                      {w.photoUrl ? (
                        <img src={w.photoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-[11px] font-bold text-ink-3">
                          {w.fullName.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-ink">{w.fullName}</span>
                    </div>
                  </TD>
                  <TD>
                    <span
                      className={`font-mono text-[13px] font-semibold ${
                        w.balance < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-emerald-400"
                      }`}
                    >
                      <Money value={w.balance} />
                    </span>
                  </TD>
                  {canManage && (
                    <TD>
                      <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="primary" size="sm" onClick={() => setPayTarget({ worker: w, kind: "payment" })}>
                          Pay
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPayTarget({ worker: w, kind: "advance" })}>
                          Advance
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAdjust(w)}>
                          Adjust
                        </Button>
                        <Button variant="subtle" size="sm" onClick={() => setEditWorker(w)}>
                          Edit
                        </Button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {selectedWorker && (
        <WorkerDrawer
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          canManage={canManage}
        />
      )}

      {payTarget && (
        <PayModal
          worker={payTarget.worker}
          entityType={entityTypeOf(payTarget.worker)}
          defaultKind={payTarget.kind}
          onClose={() => setPayTarget(null)}
        />
      )}

      {adjustTarget && (
        <Dialog open onClose={() => setAdjustTarget(null)} title={`Adjust — ${adjustTarget.fullName}`}>
          <form onSubmit={handleAdjust} className="flex flex-col gap-4">
            <Field label="Amount (₹, signed)" hint="Positive adds to what the warehouse owes · Negative claws back (advance)">
              <Input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                step={1}
                required
                placeholder="e.g., 500 or -500"
              />
            </Field>
            <Field label="Reason" required>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
                placeholder="e.g., Missed attendance credit for 12 Sep"
              />
            </Field>
            <p className="text-[11px] text-ink-4">
              Ledger-only correction — no journal is posted.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="subtle" type="button" onClick={() => setAdjustTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={adjusting}>
                Record Adjustment
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {editWorker && (
        <EditProfileDrawer
          userId={editWorker.userId}
          userName={editWorker.fullName}
          onClose={() => setEditWorker(null)}
        />
      )}

      <Dialog open={showAddWorker} onClose={() => setShowAddWorker(false)} title="Add Worker">
        <form onSubmit={handleAddWorker} className="flex flex-col gap-4">
          <Field label="Full Name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Worker name" />
          </Field>
          <Field label="Phone">
            <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91..." />
          </Field>
          <Field label="Aadhar Number">
            <Input value={newAadhar} onChange={(e) => setNewAadhar(e.target.value)} placeholder="XXXXXXXXXXXX" />
          </Field>
          <Field label="Address">
            <Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Full address" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="subtle" type="button" onClick={() => setShowAddWorker(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={adding}>
              Add Worker
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

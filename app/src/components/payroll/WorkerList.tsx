"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Field, Input } from "@/components/ui/Field";
import { Dialog } from "@/components/ui/Dialog";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { rupeesCompact } from "@/lib/format";
import { addWorker } from "@/lib/actions/payroll";
import { WorkerDrawer } from "./WorkerDrawer";
import { PayModal } from "./PayModal";
import { EditProfileDrawer } from "./EditProfileDrawer";
import type { WorkerBalance, WorkerRow } from "@/lib/data/payroll";

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
  const [selectedWorker, setSelectedWorker] = useState<WorkerBalance | null>(null);
  const [payWorker, setPayWorker] = useState<WorkerBalance | null>(null);
  const [editWorker, setEditWorker] = useState<WorkerBalance | null>(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAadhar, setNewAadhar] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);

  // Merge balances with manual workers that have no balance yet
  const balanceMap = new Map(workers.map((w) => [w.userId, w]));
  const allWorkers: WorkerBalance[] = [
    ...workers,
    ...manualWorkers
      .filter((mw) => !balanceMap.has(mw.id))
      .map((mw) => ({
        userId: mw.id,
        fullName: mw.fullName,
        balance: 0,
        photoUrl: mw.photoUrl,
      })),
  ];

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
    }
    setAdding(false);
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
            <p className="mt-1 text-[22px] font-bold text-green-600">{rupeesCompact(totalOutstanding)}</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3.5 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Advances</p>
            <p className="mt-1 text-[22px] font-bold text-red-500">{rupeesCompact(totalAdvances)}</p>
          </div>
        </div>
        {canManage && (
          <Button variant="primary" size="sm" onClick={() => setShowAddWorker(true)}>
            + Add Worker
          </Button>
        )}
      </div>

      <Panel flush className="mt-4">
        {allWorkers.length === 0 ? (
          <EmptyState title="No workers" description="No workers found. Add one manually or set up payroll for app users." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Worker</TH>
                <TH numeric>Balance</TH>
                {canManage && <TH className="w-44" />}
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
                        w.balance < 0 ? "text-red-500" : "text-green-600"
                      }`}
                    >
                      <Money value={w.balance} />
                    </span>
                  </TD>
                  {canManage && (
                    <TD>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="primary" size="sm" onClick={() => setPayWorker(w)}>
                          Pay
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

      {payWorker && (
        <PayModal
          worker={payWorker}
          onClose={() => setPayWorker(null)}
        />
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

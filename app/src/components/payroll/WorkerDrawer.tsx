"use client";

import { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Money } from "@/components/ui/Money";
import { Badge } from "@/components/ui/Badge";
import { fetchWorkerLedger, fetchEmployeeProfile, fetchWorkers } from "@/lib/actions/payroll";
import type { WorkerBalance, WorkerLedgerEntry, EmployeeProfile } from "@/lib/data/payroll";

const TYPE_LABEL: Record<string, string> = {
  attendance_pay: "Attendance",
  payment: "Payment",
  advance: "Advance",
  adjustment: "Adjustment",
};

const TYPE_TONE: Record<string, "brand" | "grn" | "amb" | "red"> = {
  attendance_pay: "brand",
  payment: "grn",
  advance: "red",
  adjustment: "amb",
};

export function WorkerDrawer({
  worker,
  onClose,
  canManage,
}: {
  worker: WorkerBalance;
  onClose: () => void;
  canManage: boolean;
}) {
  const [ledger, setLedger] = useState<WorkerLedgerEntry[]>([]);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchWorkerLedger(worker.userId),
      fetchEmployeeProfile(worker.userId).then(async (p) => {
        if (p) return p;
        const workers = await fetchWorkers();
        const w = workers.find((x) => x.id === worker.userId);
        if (w) {
          return {
            id: w.id,
            userId: w.id,
            photoUrl: w.photoUrl,
            aadharNumber: w.aadharNumber,
            phone: w.phone,
            address: w.address,
          };
        }
        return null;
      }),
    ]).then(([l, p]) => {
      setLedger(l);
      setProfile(p);
      setLoading(false);
    });
  }, [worker.userId]);

  return (
    <Drawer
      open
      onClose={onClose}
      title={worker.fullName}
      description={`Balance: ${worker.balance < 0 ? "Owes " : "Owed "} ₹${Math.abs(worker.balance).toLocaleString("en-IN")}`}
      size="lg"
    >
      {loading ? (
        <p className="py-8 text-center text-[13px] text-ink-4">Loading...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Profile */}
          <div className="flex items-start gap-4">
            {profile?.photoUrl ? (
              <img src={profile.photoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-fill text-[24px] font-bold text-ink-3">
                {worker.fullName.charAt(0)}
              </div>
            )}
            <div className="flex flex-col gap-1 pt-1">
              {profile?.phone && <p className="text-[13px] text-ink">📞 {profile.phone}</p>}
              {profile?.aadharNumber && (
                <p className="text-[13px] text-ink-3">Aadhar: {profile.aadharNumber}</p>
              )}
              {profile?.address && <p className="text-[12px] text-ink-3">{profile.address}</p>}
              {!profile && <p className="text-[12px] text-ink-4">No profile details</p>}
            </div>
          </div>

          {/* Ledger */}
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">Ledger</h3>
            {ledger.length === 0 ? (
              <p className="text-[13px] text-ink-4">No transactions yet.</p>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Type</TH>
                      <TH numeric>Amount</TH>
                      <TH numeric>Balance</TH>
                      <TH>Note</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ledger.map((l) => (
                      <TR key={l.id}>
                        <TD className="font-mono text-[12px] text-ink-3">{l.transactionDate}</TD>
                        <TD>
                          <Badge tone={TYPE_TONE[l.type] ?? "amb"} size="sm">
                            {TYPE_LABEL[l.type] ?? l.type}
                          </Badge>
                        </TD>
                        <TD>
                          <span
                            className={`font-mono text-[12px] font-semibold ${
                              l.amount >= 0 ? "text-green-600" : "text-red-500"
                            }`}
                          >
                            {l.amount >= 0 ? "+" : ""}
                            <Money value={l.amount} />
                          </span>
                        </TD>
                        <TD>
                          <span
                            className={`font-mono text-[12px] ${
                              l.runningBalance >= 0 ? "text-green-600" : "text-red-500"
                            }`}
                          >
                            <Money value={l.runningBalance} />
                          </span>
                        </TD>
                        <TD className="max-w-[160px] truncate text-[12px] text-ink-3">
                          {l.note ?? "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

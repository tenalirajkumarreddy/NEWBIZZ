"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { upsertOverheadPool, deleteOverheadPool } from "@/lib/actions/costing";
import { money } from "@/lib/format";
import type { OverheadPoolRow } from "@/lib/data/costing";

export function OverheadPoolSection({ pools }: { pools: OverheadPoolRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState("shared");
  const [periodMonth, setPeriodMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("estimated");
  const [driver, setDriver] = useState("cases");
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setStage("shared");
    setPeriodMonth("");
    setAmount("");
    setSource("estimated");
    setDriver("cases");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(pool: OverheadPoolRow) {
    setName(pool.name);
    setStage(pool.stage);
    setPeriodMonth(pool.periodMonth);
    setAmount(String(pool.amount));
    setSource(pool.source);
    setDriver(pool.allocationDriver);
    setEditingId(pool.id);
    setShowForm(true);
  }

  function submit() {
    if (!name.trim() || !periodMonth || !amount) return;
    startTransition(async () => {
      const res = await upsertOverheadPool({
        id: editingId ?? undefined,
        name: name.trim(),
        stage,
        periodMonth,
        amount: Number(amount),
        source,
        allocationDriver: driver,
      });
      if (res.ok) {
        toast.success(editingId ? "Pool updated" : "Pool created");
        resetForm();
        router.refresh();
      } else {
        toast.error("Could not save pool", res.error);
      }
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete pool "${name}"?`)) return;
    startTransition(async () => {
      const res = await deleteOverheadPool(id);
      if (res.ok) {
        toast.success("Pool deleted");
        router.refresh();
      } else {
        toast.error("Could not delete pool", res.error);
      }
    });
  }

  return (
    <Panel
      title={`Overhead Pools (${pools.length})`}
      actions={
        <Button variant="subtle" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          + New Pool
        </Button>
      }
      flush
    >
      {pools.length === 0 && !showForm ? (
        <div className="p-4 text-center text-[13px] text-ink-4">
          No overhead pools defined yet.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Stage</TH>
              <TH>Month</TH>
              <TH numeric>Amount</TH>
              <TH>Source</TH>
              <TH>Driver</TH>
              <TH className="w-[100px]" />
            </TR>
          </THead>
          <TBody>
            {pools.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium text-ink">{p.name}</TD>
                <TD><span className="text-[12px] text-ink-3">{p.stage}</span></TD>
                <TD className="font-mono text-[12px]">{p.periodMonth}</TD>
                <TD numeric className="font-mono tnum">{money(p.amount)}</TD>
                <TD><span className="text-[12px] text-ink-3">{p.source}</span></TD>
                <TD><span className="text-[12px] text-ink-3">{p.allocationDriver}</span></TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id, p.name)}>Del</Button>
                  </div>
                </TD>
              </TR>
            ))}
            {showForm && (
              <TR>
                <TD>
                  <input
                    className="h-7 w-full rounded border border-line bg-white px-2 text-[12px] text-ink focus:border-brand focus:outline-none"
                    placeholder="Pool name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TD>
                <TD>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="h-7 rounded border border-line bg-white px-1 text-[12px] text-ink"
                  >
                    <option value="shared">Shared</option>
                    <option value="blowing">Blowing</option>
                    <option value="filling">Filling</option>
                  </select>
                </TD>
                <TD>
                  <input
                    type="month"
                    value={periodMonth ? periodMonth.slice(0, 7) : ""}
                    onChange={(e) => setPeriodMonth(e.target.value ? `${e.target.value}-01` : "")}
                    className="h-7 w-28 rounded border border-line bg-white px-1 text-[12px] font-mono text-ink"
                  />
                </TD>
                <TD>
                  <input
                    className="h-7 w-20 rounded border border-line bg-white px-1 text-[12px] font-mono text-ink text-right"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </TD>
                <TD>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="h-7 rounded border border-line bg-white px-1 text-[12px] text-ink"
                  >
                    <option value="estimated">Estimated</option>
                    <option value="actual">Actual</option>
                  </select>
                </TD>
                <TD>
                  <select
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    className="h-7 rounded border border-line bg-white px-1 text-[12px] text-ink"
                  >
                    <option value="cases">Cases</option>
                    <option value="machine_hours">Machine Hours</option>
                    <option value="labour_hours">Labour Hours</option>
                  </select>
                </TD>
                <TD>
                  <div className="flex items-center gap-1">
                    <Button variant="subtle" size="sm" loading={pending} onClick={submit}>
                      {editingId ? "Save" : "Add"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => resetForm()}>
                      Cancel
                    </Button>
                  </div>
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

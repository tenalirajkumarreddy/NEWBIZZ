"use client";

import { useState } from "react";
import { Panel, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  saveShiftTemplate,
  deleteShiftTemplate,
  savePayMapping,
  deletePayMapping,
} from "@/lib/actions/payroll";
import { PayConfigSection } from "./PayConfigSection";
import type { ShiftTemplate, PayMapping, UserOption, PayConfigRow } from "@/lib/data/payroll";

function ShiftTemplatesSection({
  templates,
  canManage,
}: {
  templates: ShiftTemplate[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(templates);
  const [newRow, setNewRow] = useState({ name: "", startTime: "09:00", endTime: "18:00", totalHours: 9 });

  async function handleDelete(id: string) {
    const result = await deleteShiftTemplate(id);
    if (!result.ok) {
      toast.error("Failed to delete", result.error);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Deleted");
    }
  }

  async function handleAdd() {
    if (!newRow.name.trim()) return;
    const result = await saveShiftTemplate(null, newRow.name, newRow.startTime, newRow.endTime, newRow.totalHours);
    if (!result.ok) {
      toast.error("Failed to add", result.error);
    } else {
      setRows((prev) => [
        ...prev,
        { id: "new", name: newRow.name, startTime: newRow.startTime, endTime: newRow.endTime, totalHours: newRow.totalHours },
      ]);
      setNewRow({ name: "", startTime: "09:00", endTime: "18:00", totalHours: 9 });
      toast.success("Shift template added");
    }
  }

  return (
    <Panel
      title={<SectionHeading>Shift Templates</SectionHeading>}
    >
      {rows.length === 0 ? (
        <EmptyState title="No shift templates" description="Add a shift template below." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Start</TH>
              <TH>End</TH>
              <TH numeric>Hours</TH>
              {canManage && <TH className="w-16" />}
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-ink">{s.name}</TD>
                <TD className="font-mono text-[12px]">{s.startTime}</TD>
                <TD className="font-mono text-[12px]">{s.endTime}</TD>
                <TD numeric className="font-mono text-[12px]">{s.totalHours}</TD>
                {canManage && (
                  <TD>
                    <Button variant="subtle" size="sm" onClick={() => handleDelete(s.id)}>
                      Delete
                    </Button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Input
            placeholder="Shift name"
            value={newRow.name}
            onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
            className="h-8 w-44"
          />
          <Input
            type="time"
            value={newRow.startTime}
            onChange={(e) => setNewRow((p) => ({ ...p, startTime: e.target.value }))}
            className="h-8 w-28"
          />
          <Input
            type="time"
            value={newRow.endTime}
            onChange={(e) => setNewRow((p) => ({ ...p, endTime: e.target.value }))}
            className="h-8 w-28"
          />
          <Input
            type="number"
            value={newRow.totalHours}
            onChange={(e) => setNewRow((p) => ({ ...p, totalHours: Number(e.target.value) }))}
            className="h-8 w-20"
            step={0.5}
          />
          <Button variant="secondary" size="sm" onClick={handleAdd}>
            Add
          </Button>
        </div>
      )}
    </Panel>
  );
}

function PayMappingsSection({
  mappings,
  canManage,
}: {
  mappings: PayMapping[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState(mappings);
  const [newRow, setNewRow] = useState({ hoursMin: 0, hoursMax: 4, amount: 300 });

  async function handleDelete(id: string) {
    const result = await deletePayMapping(id);
    if (!result.ok) {
      toast.error("Failed to delete", result.error);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Deleted");
    }
  }

  async function handleAdd() {
    const result = await savePayMapping(null, newRow.hoursMin, newRow.hoursMax, newRow.amount);
    if (!result.ok) {
      toast.error("Failed to add", result.error);
    } else {
      setRows((prev) => [
        ...prev,
        { id: "new", hoursMin: newRow.hoursMin, hoursMax: newRow.hoursMax, amount: newRow.amount },
      ]);
      setNewRow({ hoursMin: 0, hoursMax: 4, amount: 300 });
      toast.success("Pay mapping added");
    }
  }

  return (
    <Panel
      title={<SectionHeading>Pay Mappings</SectionHeading>}
    >
      {rows.length === 0 ? (
        <EmptyState title="No pay mappings" description="Add pay brackets below." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH numeric>Min Hours</TH>
              <TH numeric>Max Hours</TH>
              <TH numeric>Amount (₹)</TH>
              {canManage && <TH className="w-16" />}
            </TR>
          </THead>
          <TBody>
            {rows.map((m) => (
              <TR key={m.id}>
                <TD numeric className="font-mono text-[12px]">{m.hoursMin}</TD>
                <TD numeric className="font-mono text-[12px]">{m.hoursMax}</TD>
                <TD numeric className="font-mono text-[12px] font-semibold text-ink">{m.amount.toLocaleString("en-IN")}</TD>
                {canManage && (
                  <TD>
                    <Button variant="subtle" size="sm" onClick={() => handleDelete(m.id)}>
                      Delete
                    </Button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <Input
            type="number"
            placeholder="Min hrs"
            value={newRow.hoursMin}
            onChange={(e) => setNewRow((p) => ({ ...p, hoursMin: Number(e.target.value) }))}
            className="h-8 w-20"
            step={0.5}
          />
          <Input
            type="number"
            placeholder="Max hrs"
            value={newRow.hoursMax}
            onChange={(e) => setNewRow((p) => ({ ...p, hoursMax: Number(e.target.value) }))}
            className="h-8 w-20"
            step={0.5}
          />
          <Input
            type="number"
            placeholder="Amount"
            value={newRow.amount}
            onChange={(e) => setNewRow((p) => ({ ...p, amount: Number(e.target.value) }))}
            className="h-8 w-28"
          />
          <Button variant="secondary" size="sm" onClick={handleAdd}>
            Add
          </Button>
        </div>
      )}
    </Panel>
  );
}

export function SettingsPanel({
  shiftTemplates,
  payMappings,
  payConfigs,
  users,
  canManage,
}: {
  shiftTemplates: ShiftTemplate[];
  payMappings: PayMapping[];
  payConfigs: PayConfigRow[];
  users: UserOption[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PayMappingsSection mappings={payMappings} canManage={canManage} />
      <ShiftTemplatesSection templates={shiftTemplates} canManage={canManage} />
      <PayConfigSection configs={payConfigs} users={users} canManage={canManage} />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Panel, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, Input } from "@/components/ui/Field";
import { savePayConfig } from "@/lib/actions/payroll";
import type { PayConfigRow, UserOption } from "@/lib/data/payroll";

export function PayConfigSection({
  configs,
  users,
  canManage,
}: {
  configs: PayConfigRow[];
  users: { id: string; fullName: string }[];
  canManage: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, PayConfigRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const map: Record<string, PayConfigRow> = {};
    for (const c of configs) {
      map[c.userId] = { ...c };
    }
    for (const u of users) {
      if (!map[u.id]) {
        map[u.id] = {
          userId: u.id,
          userName: u.fullName,
          payType: "monthly",
          monthlySalary: 0,
          dailyRate: 0,
          otHourlyRate: 0,
          standardShiftHrs: 8,
          paidLeaves: 2,
        };
      }
    }
    setEdits(map);
  }, [configs, users]);

  function update(userId: string, field: keyof PayConfigRow, value: string | number) {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    const entries = Object.values(edits).map((e) => ({
      userId: e.userId,
      payType: e.payType,
      monthlySalary: e.monthlySalary,
      dailyRate: e.dailyRate,
      otHourlyRate: e.otHourlyRate,
      standardShiftHrs: e.standardShiftHrs,
      paidLeaves: e.paidLeaves,
    }));
    await savePayConfig(entries);
    setSaving(false);
  }

  const entries = Object.values(edits);

  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-2 transition-colors hover:bg-fill">
        <SectionHeading
          trailing={
            canManage ? (
              <Button variant="primary" size="sm" loading={saving} onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                Save all
              </Button>
            ) : undefined
          }
        >
          <span className="flex items-center gap-2">
            Employee Pay Settings
            <Badge tone="brand" size="sm">{entries.length}</Badge>
          </span>
        </SectionHeading>
      </summary>
      <div className="pt-1">
        <Panel flush>
          {entries.length === 0 ? (
            <EmptyState title="No employees" description="Add active users to configure pay settings." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Type</TH>
                    <TH numeric>Salary / Rate</TH>
                    <TH numeric>OT Rate/hr</TH>
                    <TH numeric>Std Shift</TH>
                    <TH numeric>Paid Leaves</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((e) => (
                    <TR key={e.userId}>
                      <TD className="font-medium text-ink">{e.userName}</TD>
                      <TD>
                        {canManage ? (
                          <Select
                            value={e.payType}
                            onChange={(ev) => update(e.userId, "payType", ev.target.value)}
                            className="h-7 text-[11px]"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="daily">Daily</option>
                          </Select>
                        ) : (
                          <Badge tone={e.payType === "monthly" ? "brand" : "grn"} size="sm">
                            {e.payType === "monthly" ? "Monthly" : "Daily"}
                          </Badge>
                        )}
                      </TD>
                      <TD numeric>
                        <Input
                          type="number"
                          mono
                          className="h-7 w-28 text-right text-[12px]"
                          value={e.payType === "monthly" ? String(e.monthlySalary) : String(e.dailyRate)}
                          onChange={(ev) =>
                            update(
                              e.userId,
                              e.payType === "monthly" ? "monthlySalary" : "dailyRate",
                              Number(ev.target.value),
                            )
                          }
                          disabled={!canManage}
                        />
                      </TD>
                      <TD numeric>
                        <Input
                          type="number"
                          mono
                          className="h-7 w-20 text-right text-[12px]"
                          value={String(e.otHourlyRate)}
                          onChange={(ev) => update(e.userId, "otHourlyRate", Number(ev.target.value))}
                          disabled={!canManage}
                        />
                      </TD>
                      <TD numeric>
                        <Input
                          type="number"
                          mono
                          className="h-7 w-16 text-right text-[12px]"
                          value={String(e.standardShiftHrs)}
                          onChange={(ev) => update(e.userId, "standardShiftHrs", Number(ev.target.value))}
                          disabled={!canManage}
                        />
                      </TD>
                      <TD numeric>
                        {e.payType === "monthly" ? (
                          <Input
                            type="number"
                            mono
                            className="h-7 w-12 text-right text-[12px]"
                            value={String(e.paidLeaves)}
                            onChange={(ev) => update(e.userId, "paidLeaves", Number(ev.target.value))}
                            disabled={!canManage}
                          />
                        ) : (
                          <span className="text-[12px] text-ink-4">—</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </details>
  );
}

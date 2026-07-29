"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Panel, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Input } from "@/components/ui/Field";
import { saveTargets } from "@/lib/actions/commissions";
import type { SalesTargetRow, UserOption } from "@/lib/data/commissions";

export function TargetEditorSection({
  targets,
  users,
  canManage,
}: {
  targets: SalesTargetRow[];
  users: UserOption[];
  canManage: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const month = searchParams.get("month") || currentMonth();

  const [edits, setEdits] = useState<Record<string, { amount: string; cases: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const map: Record<string, { amount: string; cases: string }> = {};
    for (const t of targets) {
      map[t.userId] = { amount: String(t.targetAmount), cases: String(t.targetCases) };
    }
    for (const u of users) {
      if (!map[u.id]) {
        map[u.id] = { amount: "0", cases: "0" };
      }
    }
    setEdits(map);
  }, [targets, users]);

  function setTarget(userId: string, field: "amount" | "cases", value: string) {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  }

  function nextMonth() {
    const d = new Date(month + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", `${yr}-${mo}-01`);
    router.replace(`/commissions?${params.toString()}`);
  }

  async function handleSave() {
    setSaving(true);
    const entries = Object.entries(edits).map(([userId, vals]) => ({
      userId,
      targetAmount: Number(vals.amount) || 0,
      targetCases: Number(vals.cases) || 0,
    }));
    await saveTargets(month, entries);
    setSaving(false);
  }

  const entries = Object.entries(edits);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-2 transition-colors hover:bg-fill">
        <SectionHeading trailing={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); nextMonth(); }}>
                Next month
              </Button>
              <Button variant="primary" size="sm" loading={saving} onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                Save all
              </Button>
            </div>
          ) : undefined
        }>
          <span className="flex items-center gap-2">
            Set Monthly Targets
            <Badge tone="brand" size="sm">{users.length} users</Badge>
          </span>
        </SectionHeading>
      </summary>
      <div className="pt-1">
        <Panel flush>
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH numeric>Target Amount (₹)</TH>
                <TH numeric>Target Cases</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map(([userId, vals]) => {
                const user = users.find((u) => u.id === userId);
                return (
                  <TR key={userId}>
                    <TD className="font-medium text-ink">{user?.fullName ?? "—"}</TD>
                    <TD numeric>
                      <Input
                        type="number"
                        mono
                        className="h-8 w-36 text-right"
                        value={vals.amount}
                        onChange={(e) => setTarget(userId, "amount", e.target.value)}
                        disabled={!canManage}
                      />
                    </TD>
                    <TD numeric>
                      <Input
                        type="number"
                        mono
                        className="h-8 w-36 text-right"
                        value={vals.cases}
                        onChange={(e) => setTarget(userId, "cases", e.target.value)}
                        disabled={!canManage}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Panel>
      </div>
    </details>
  );
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

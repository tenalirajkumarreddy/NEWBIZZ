"use client";

import { useState } from "react";
import { Panel, SectionHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Money } from "@/components/ui/Money";
import { titleCase } from "@/lib/format";
import { deactivateRule } from "@/lib/actions/commissions";
import { RuleDrawer } from "./RuleDrawer";
import type { CommissionRuleRow, UserOption, RoleOption } from "@/lib/data/commissions";

export function RulesSection({
  rules,
  users,
  roles,
  canManage,
}: {
  rules: CommissionRuleRow[];
  users: UserOption[];
  roles: RoleOption[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CommissionRuleRow | null>(null);
  const openRules = rules.filter((r) => r.status === "active");

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(rule: CommissionRuleRow) {
    setEditing(rule);
    setOpen(true);
  }

  async function handleDeactivate(id: string) {
    await deactivateRule(id);
  }

  const sorted = [...rules].sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return 0;
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <SectionHeading>
          <span className="flex items-center gap-2">
            Commission Rules
            <Badge tone="brand" size="sm">{openRules.length}</Badge>
          </span>
        </SectionHeading>
        {canManage && (
          <Button variant="primary" size="sm" onClick={openAdd}>
            Add rule
          </Button>
        )}
      </div>
      <Panel flush>
        {rules.length === 0 ? (
          <EmptyState
            title="No rules defined"
            description="Add rules to enable commission computation. Rules can apply to a role or a specific user."
            action={
              canManage ? <Button variant="secondary" size="sm" onClick={openAdd}>Add a rule</Button> : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Entity</TH>
                <TH>Basis</TH>
                <TH numeric>Rate</TH>
                <TH numeric>Threshold</TH>
                <TH numeric>Tiers</TH>
                <TH>Status</TH>
                {canManage && <TH className="w-20" />}
              </TR>
            </THead>
            <TBody>
              {sorted.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Badge tone={r.userId ? "brand" : "slate"} size="sm">
                      {r.userId ? "User" : "Role"}
                    </Badge>
                  </TD>
                  <TD className="font-medium text-ink">
                    {r.userId ? r.userName : r.roleCode}
                  </TD>
                  <TD className="text-ink-3">{titleCase(r.basis)}</TD>
                  <TD numeric className="font-mono text-[12px]">{r.rate}%</TD>
                  <TD numeric><Money value={r.threshold} /></TD>
                  <TD numeric className="font-mono text-[12px]">
                    {r.tiers.length > 0 ? r.tiers.length : "—"}
                  </TD>
                  <TD>
                    <Badge tone={r.status === "active" ? "grn" : "slate"} size="sm">
                      {titleCase(r.status)}
                    </Badge>
                  </TD>
                  {canManage && (
                    <TD>
                      <div className="flex gap-1">
                        <Button variant="subtle" size="sm" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        {r.status === "active" && (
                          <Button variant="subtle" size="sm" onClick={() => handleDeactivate(r.id)}>
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <RuleDrawer
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        rule={editing}
        users={users}
        roles={roles}
      />
    </>
  );
}

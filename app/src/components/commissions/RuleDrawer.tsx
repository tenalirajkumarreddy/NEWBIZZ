"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { saveRule, type CommissionRuleInput } from "@/lib/actions/commissions";
import type { CommissionRuleRow, UserOption, RoleOption } from "@/lib/data/commissions";

export function RuleDrawer({
  open,
  onClose,
  rule,
  users,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommissionRuleRow | null;
  users: UserOption[];
  roles: RoleOption[];
}) {
  const [ruleType, setRuleType] = useState<"user" | "role">(
    rule?.userId ? "user" : "role",
  );
  const [userId, setUserId] = useState(rule?.userId ?? "");
  const [roleCode, setRoleCode] = useState(rule?.roleCode ?? "");
  const [basis, setBasis] = useState<string>(rule?.basis ?? "revenue");
  const [rate, setRate] = useState(String(rule?.rate ?? ""));
  const [threshold, setThreshold] = useState(String(rule?.threshold ?? ""));
  const [tiers, setTiers] = useState<{ min: string; rate: string }[]>(
    rule?.tiers?.map((t) => ({ min: String(t.min), rate: String(t.rate) })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");

    const input: CommissionRuleInput = {
      id: rule?.id ?? undefined,
      roleCode: ruleType === "role" ? roleCode : null,
      userId: ruleType === "user" ? userId : null,
      basis,
      rate: Number(rate),
      threshold: Number(threshold) || 0,
      tiers: tiers
        .filter((t) => t.min !== "" && t.rate !== "")
        .map((t) => ({ min: Number(t.min), rate: Number(t.rate) })),
    };

    if (!input.basis || !input.rate) {
      setError("Basis and rate are required.");
      setSaving(false);
      return;
    }

    const result = await saveRule(input);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title={rule ? "Edit rule" : "Add rule"} size="md">
      <div className="flex flex-col gap-4">
        {/* Rule type */}
        <Field label="Rule type">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRuleType("role")}
              className={
                "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (ruleType === "role"
                  ? "border-brand bg-brand-wash text-brand"
                  : "border-line text-ink-3 hover:bg-fill")
              }
            >
              By Role
            </button>
            <button
              type="button"
              onClick={() => setRuleType("user")}
              className={
                "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (ruleType === "user"
                  ? "border-brand bg-brand-wash text-brand"
                  : "border-line text-ink-3 hover:bg-fill")
              }
            >
              By User
            </button>
          </div>
        </Field>

        {/* Entity selector */}
        {ruleType === "role" ? (
          <Field label="Role" required htmlFor="role">
            <Select id="role" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              <option value="">Select a role</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="User" required htmlFor="user">
            <Select id="user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select a user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* Basis */}
        <Field label="Basis" required htmlFor="basis">
          <Select id="basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="revenue">Revenue</option>
            <option value="cases">Cases</option>
            <option value="collection">Collection</option>
          </Select>
        </Field>

        {/* Rate & Threshold */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate (%)" required htmlFor="rate">
            <Input id="rate" type="number" step="0.1" placeholder="2.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Threshold (₹)" htmlFor="threshold">
            <Input id="threshold" type="number" placeholder="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
        </div>

        {/* Tiers */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ink-2">Tiers (optional)</span>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setTiers([...tiers, { min: "", rate: "" }])}
            >
              + Add tier
            </Button>
          </div>
          {tiers.length === 0 ? (
            <p className="text-[11px] text-ink-4">Flat rate only</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Min (₹)"
                    className="flex-1"
                    value={t.min}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[i] = { ...next[i], min: e.target.value };
                      setTiers(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Rate %"
                    className="flex-1"
                    value={t.rate}
                    onChange={(e) => {
                      const next = [...tiers];
                      next[i] = { ...next[i], rate: e.target.value };
                      setTiers(next);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-md p-1.5 text-ink-4 hover:text-red"
                    aria-label="Remove tier"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-[12px] font-medium text-red">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {rule ? "Save changes" : "Add rule"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Panel, Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createBom } from "@/lib/actions/bom";
import type { ItemListRow } from "@/lib/data/catalog";
import type { BomDetail, AlternateGroupRow } from "@/lib/data/bom";

interface LineEntry {
  key: number;
  kind: "item" | "group";
  itemId: string;
  groupId: string;
  qty: string;
  scrap: string;
}

let keySeq = 1;

export function CloneBomForm({
  bom,
  items,
  altGroups,
}: {
  bom: BomDetail;
  items: ItemListRow[];
  altGroups: AlternateGroupRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [parentId] = useState(bom.parentItemId);
  const [parentName] = useState(`${bom.parentSku} — ${bom.parentName}`);
  const [stage, setStage] = useState(String(bom.stage));
  const [outputQty, setOutputQty] = useState(String(bom.outputQty));
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [effectiveTo, setEffectiveTo] = useState("");
  const [notes, setNotes] = useState(bom.notes ?? "");
  const [lines, setLines] = useState<LineEntry[]>(
    bom.lines.map((l) => ({
      key: keySeq++,
      kind: l.childItemId ? "item" : "group",
      itemId: l.childItemId ?? "",
      groupId: l.alternateGroupId ?? "",
      qty: String(l.quantityPer),
      scrap: l.scrapPercent != null ? String(l.scrapPercent) : "",
    })),
  );

  const lineItemOptions = items;

  const updateLine = useCallback((key: number, patch: Partial<LineEntry>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((key: number) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { key: keySeq++, kind: "item", itemId: "", groupId: "", qty: "1", scrap: "" }]);
  }, []);

  function submit() {
    startTransition(async () => {
      const res = await createBom({
        parentItemId: parentId,
        stage: Number(stage) || 1,
        outputQty: Number(outputQty) || 1,
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.qty && Number(l.qty) > 0)
          .map((l) => ({
            ...(l.kind === "item" && l.itemId ? { childItemId: l.itemId } : {}),
            ...(l.kind === "group" && l.groupId ? { alternateGroupId: l.groupId } : {}),
            quantityPer: Number(l.qty),
            ...(l.scrap ? { scrapPercent: Number(l.scrap) } : {}),
          })),
      });
      if (res.ok) {
        toast.success("BOM cloned", "The new recipe is ready.");
        router.push(`/bom/${res.bomId}`);
        router.refresh();
      } else {
        toast.error("Could not clone BOM", res.error);
      }
    });
  }

  const canSubmit = lines.some((l) => Number(l.qty) > 0);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Header">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent item" required>
            <Input value={parentName} disabled />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Stage" required htmlFor="stage">
              <Select id="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                {[1, 2, 3, 4, 5].map((s) => (<option key={s} value={s}>Stage {s}</option>))}
              </Select>
            </Field>
            <Field label="Output qty" required htmlFor="output_qty">
              <Input id="output_qty" mono value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
            </Field>
          </div>
          <Field label="Effective from" required htmlFor="effective_from">
            <Input id="effective_from" type="date" mono value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Effective to" htmlFor="effective_to" hint="Leave blank for open-ended">
            <Input id="effective_to" type="date" mono value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" htmlFor="notes">
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        title="Components"
        actions={<Button variant="subtle" size="sm" onClick={addLine}>+ Add line</Button>}
      >
        <div className="flex flex-col gap-3">
          {lines.map((line, idx) => (
            <LineRow
              key={line.key}
              line={line}
              idx={idx}
              items={lineItemOptions}
              altGroups={altGroups}
              onChange={updateLine}
              onRemove={removeLine}
            />
          ))}
        </div>
      </Panel>

      <Card className="flex items-center justify-end gap-2 p-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/bom/${bom.id}`)}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submit} loading={pending} disabled={!canSubmit}>
          Clone BOM
        </Button>
      </Card>
    </div>
  );
}

function LineRow({
  line,
  idx,
  items,
  altGroups,
  onChange,
  onRemove,
}: {
  line: LineEntry;
  idx: number;
  items: ItemListRow[];
  altGroups: AlternateGroupRow[];
  onChange: (key: number, p: Partial<LineEntry>) => void;
  onRemove: (key: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-fill/50 p-3">
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold text-ink-4">
          <input type="radio" name={`kind_${line.key}`} checked={line.kind === "item"} onChange={() => onChange(line.key, { kind: "item" })} className="mr-1 accent-brand" />
          Item
        </label>
        <label className="text-[11px] font-semibold text-ink-4">
          <input type="radio" name={`kind_${line.key}`} checked={line.kind === "group"} onChange={() => onChange(line.key, { kind: "group" })} className="mr-1 accent-brand" />
          Alt group
        </label>
      </div>
      {line.kind === "item" ? (
        <Select className="min-w-[220px]" value={line.itemId} onChange={(e) => onChange(line.key, { itemId: e.target.value })}>
          <option value="">Select an item…</option>
          {items.map((i) => (<option key={i.id} value={i.id}>{i.sku} — {i.name}</option>))}
        </Select>
      ) : (
        <Select className="min-w-[220px]" value={line.groupId} onChange={(e) => onChange(line.key, { groupId: e.target.value })}>
          <option value="">Select a group…</option>
          {altGroups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
        </Select>
      )}
      <Input className="w-20" placeholder="Qty" mono value={line.qty} onChange={(e) => onChange(line.key, { qty: e.target.value })} />
      <Input className="w-20" placeholder="Scrap %" mono value={line.scrap} onChange={(e) => onChange(line.key, { scrap: e.target.value })} />
      <Button variant="ghost" size="sm" onClick={() => onRemove(line.key)}>Remove</Button>
    </div>
  );
}

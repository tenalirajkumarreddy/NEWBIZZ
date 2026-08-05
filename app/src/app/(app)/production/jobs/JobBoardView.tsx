"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { qty, dateIST } from "@/lib/format";
import type { JobCardRow, JobCardStatus } from "@/lib/data/production";
import type { ItemType } from "@/lib/data/catalog";
import {
  saveJobCard,
  setJobCardStatus,
  postRunForJobCard,
  previewJobBom,
} from "@/lib/actions/production";
import type { BomPreviewLine } from "@/lib/actions/production";

type DeviceOption = { id: string; deviceId: string; itemId: string };
type ItemOption = { id: string; sku: string; name: string; type: ItemType };
type UserOption = { id: string; fullName: string };

type CardAction = { type: "start" } | { type: "cancel" };

interface Props {
  cards: JobCardRow[];
  devices: DeviceOption[];
  items: ItemOption[];
  users: UserOption[];
  today: string;
}

const STAGE_LABELS: Record<number, string> = {
  1: "Blowing",
  2: "Filling",
};

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Stage 1 — Blowing" },
  { value: "2", label: "Stage 2 — Filling" },
];

export function JobBoardView({ cards, devices, items, users, today }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<JobCardStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<JobCardRow | null>(null);
  const [posting, setPosting] = useState<JobCardRow | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.status === filter)),
    [cards, filter],
  );

  const days = useMemo(() => {
    const map = new Map<string, JobCardRow[]>();
    for (const c of visible) {
      if (!map.has(c.cardDate)) map.set(c.cardDate, []);
      map.get(c.cardDate)!.push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as JobCardStatus | "all")}
          className="w-40"
        >
          <option value="all">All statuses</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button variant="primary" size="md" onClick={() => { setEditing(null); setCreating(true); }}>
          + New job
        </Button>
      </Card>

      {/* Board — day-grouped */}
      {days.length === 0 ? (
        <Card>
          <EmptyState
            title="No job cards"
            description="Plan a production job — pick a stage, output item and target quantity."
            action={
              <Button variant="primary" size="md" onClick={() => setCreating(true)}>
                + New job
              </Button>
            }
          />
        </Card>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}
        >
          {days.map(([date, dayCards]) => (
            <div key={date} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 className={`text-[13px] font-bold ${date === today ? "text-brand" : "text-ink"}`}>
                  {date === today ? "Today" : dateIST(date)}
                </h2>
                <span className="text-[11px] font-medium text-ink-4">{dayCards.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {dayCards.map((card) => (
                  <CardItem
                    key={card.id}
                    card={card}
                    onEdit={() => { setEditing(card); setCreating(true); }}
                    onStart={() => runAction({ type: "start" }, card.id)}
                    onComplete={() => setPosting(card)}
                    onCancel={() => runAction({ type: "cancel" }, card.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <JobCardModal
          card={editing}
          devices={devices}
          items={items}
          users={users}
          today={today}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
      {posting && <PostRunDialog card={posting} onClose={() => setPosting(null)} />}
    </div>
  );

  async function runAction(action: CardAction, id: string) {
    const status = action.type === "start" ? "in_progress" : "cancelled";
    const res = await setJobCardStatus(id, status);
    if (res.ok) {
      toast.success(action.type === "start" ? "Job started" : "Job cancelled");
      router.refresh();
    } else {
      toast.error("Could not update job", res.error);
    }
  }
}

// ------------------------------------------------------------------
// Single card
// ------------------------------------------------------------------
function CardItem({
  card,
  onEdit,
  onStart,
  onComplete,
  onCancel,
}: {
  card: JobCardRow;
  onEdit: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  return (
    <Card className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">
            <span className="font-mono text-[12px] text-brand">{card.outputSku}</span>{" "}
            {card.outputName}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-4">
            {card.jobNo} · {qty(card.targetQty)} units · Stage {card.stage} {STAGE_LABELS[card.stage]}
          </p>
        </div>
        <StatusBadge status={card.status} size="sm" />
      </div>

      {(card.deviceLabel || card.assignedToName) && (
        <div className="flex flex-wrap gap-2 text-[11px] text-ink-3">
          {card.deviceLabel && (
            <span className="rounded bg-fill px-1.5 py-0.5 font-mono">{card.deviceLabel}</span>
          )}
          {card.assignedToName && <span className="rounded bg-fill px-1.5 py-0.5">{card.assignedToName}</span>}
        </div>
      )}

      {(card.plannedStartAt || card.plannedEndAt) && (
        <p className="text-[11px] text-ink-4">
          {card.plannedStartAt ? dateIST(card.plannedStartAt) : "—"}
          {card.plannedEndAt ? ` → ${dateIST(card.plannedEndAt)}` : ""}
        </p>
      )}
      {card.instructions && (
        <p className="line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-ink-3">
          {card.instructions}
        </p>
      )}
      {card.runNo && <p className="text-[11px] font-medium text-grn">Run: {card.runNo}</p>}

      <div className="flex items-center gap-2 border-t border-line pt-2">
        {card.status === "planned" && (
          <Button variant="ghost" size="sm" onClick={onStart}>Start</Button>
        )}
        {card.status !== "completed" && card.status !== "cancelled" && (
          <Button variant="primary" size="sm" onClick={onComplete}>Complete → run</Button>
        )}
        {card.status === "planned" && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel job</Button>
          </>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------
// New / edit modal
// ------------------------------------------------------------------
function JobCardModal({
  card,
  devices,
  items,
  users,
  today,
  onClose,
}: {
  card: JobCardRow | null;
  devices: DeviceOption[];
  items: ItemOption[];
  users: UserOption[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState(card ? String(card.stage) : "1");
  const [outputItemId, setOutputItemId] = useState(card?.outputItemId ?? "");
  const [targetQty, setTargetQty] = useState(card ? String(card.targetQty) : "");
  const [cardDate, setCardDate] = useState(card?.cardDate ?? today);
  const [deviceId, setDeviceId] = useState(card?.deviceId ?? "");
  const [assignedTo, setAssignedTo] = useState(card?.assignedToId ?? "");
  const [startAt, setStartAt] = useState(card?.plannedStartAt ?? "");
  const [endAt, setEndAt] = useState(card?.plannedEndAt ?? "");
  const [instructions, setInstructions] = useState(card?.instructions ?? "");

  const stageNum = Number(stage);
  const itemOptions = useMemo(
    () =>
      items.filter((i) =>
        stageNum === 1 ? i.type === "wip" : stageNum === 2 ? i.type === "finished_good" : false,
      ),
    [items, stageNum],
  );

  const canSubmit = !!outputItemId && !!cardDate && Number(targetQty) > 0 && !pending;

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await saveJobCard({
        id: card?.id,
        cardDate,
        stage: stageNum,
        outputItemId,
        targetQty: Number(targetQty),
        deviceId: deviceId || undefined,
        assignedTo: assignedTo || undefined,
        plannedStartAt: startAt || undefined,
        plannedEndAt: endAt || undefined,
        instructions: instructions.trim() || undefined,
      });
      if (res.ok) {
        toast.success(card ? "Job updated" : "Job created");
        onClose();
        router.refresh();
      } else {
        toast.error("Could not save job", res.error);
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={card ? `Edit ${card.jobNo}` : "New job card"}
      description="Plan the work — completing it later posts a production run."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={!canSubmit}>
            {card ? "Save changes" : "Create job"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Stage" required htmlFor="jc-stage">
          <Select
            id="jc-stage"
            value={stage}
            onChange={(e) => { setStage(e.target.value); setOutputItemId(""); }}
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required htmlFor="jc-date">
          <Input id="jc-date" type="date" value={cardDate} onChange={(e) => setCardDate(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Output item" required htmlFor="jc-item">
            <Select id="jc-item" value={outputItemId} onChange={(e) => setOutputItemId(e.target.value)}>
              <option value="">Select {stageNum === 1 ? "a WIP item…" : "a finished good…"}</option>
              {itemOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Target quantity" required htmlFor="jc-qty">
          <Input id="jc-qty" mono value={targetQty} onChange={(e) => setTargetQty(e.target.value)} placeholder="1" />
        </Field>
        <Field label="Device" htmlFor="jc-dev">
          <Select id="jc-dev" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">No device</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.deviceId}</option>
            ))}
          </Select>
        </Field>
        <Field label="Operator" htmlFor="jc-op">
          <Select id="jc-op" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="jc-start">
            <Input id="jc-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="End" htmlFor="jc-end">
            <Input id="jc-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Instructions" htmlFor="jc-inst">
            <Textarea
              id="jc-inst"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Work instructions, notes for the operator…"
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Post-run dialog (complete a card)
// ------------------------------------------------------------------
function PostRunDialog({ card, onClose }: { card: JobCardRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [outputQty, setOutputQty] = useState(String(card.targetQty));
  const [runDate, setRunDate] = useState(card.cardDate);
  const [abnormalWastage, setAbnormalWastage] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<BomPreviewLine[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function submit() {
    const qtyNum = Number(outputQty);
    if (!outputQty || qtyNum <= 0) {
      toast.error("Check quantity", "Output quantity must be greater than 0.");
      return;
    }
    startTransition(async () => {
      const pv = await previewJobBom(card.outputItemId, qtyNum, runDate);
      if (!pv.ok) {
        setPreviewError(pv.error);
        toast.error("No BOM", pv.error);
        return;
      }
      setPreviewError(null);
      setPreview(pv.lines);
      const res = await postRunForJobCard(card.id, {
        outputItemId: card.outputItemId,
        outputQty: qtyNum,
        stage: card.stage,
        runDate,
        abnormalWastage: abnormalWastage ? Number(abnormalWastage) : undefined,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        toast.success("Run posted", `${card.outputSku} produced — job completed.`);
        router.push(`/production/${res.runId}`);
        router.refresh();
        onClose();
      } else {
        toast.error("Could not post run", res.error);
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Complete ${card.jobNo} → post run`}
      description="Posting records stock + journal for this job and marks it completed."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={pending}>
            Post run & complete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className="font-mono text-brand">{card.outputSku}</span>
          <span className="font-semibold">{card.outputName}</span>
          <StatusBadge status={card.status} size="sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Output quantity" required htmlFor="pr-qty">
            <Input id="pr-qty" mono value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
          </Field>
          <Field label="Run date" htmlFor="pr-date">
            <Input id="pr-date" type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
          </Field>
          <Field label="Abnormal wastage (₹)" htmlFor="pr-abn" hint="Optional">
            <Input id="pr-abn" mono value={abnormalWastage} onChange={(e) => setAbnormalWastage(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="pr-notes">
          <Textarea
            id="pr-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
          />
        </Field>
        {previewError && <p className="rounded-lg border border-red/20 bg-red-wash p-3 text-[12px] text-red">{previewError}</p>}
        {preview && (
          <div className="rounded-lg border border-line bg-fill/50 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Resolved inputs (BOM)
            </p>
            <ul className="space-y-1">
              {preview.map((l, i) => (
                <li key={i} className="flex items-center justify-between text-[12px] text-ink-2">
                  <span><span className="font-mono">{l.childSku}</span> {l.childName}</span>
                  <span className="font-mono tnum">{qty(l.grossQty)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
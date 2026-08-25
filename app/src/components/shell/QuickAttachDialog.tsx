"use client";

import { useMemo, useState } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import { can } from "@/lib/auth/claims";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { StagedFile } from "./QuickAttachProvider";
import { visibleTypesForClaims, type QuickType } from "@/lib/quick-attach/registry";
import type { QuickTypeKey } from "@/lib/actions/quick-attach";
import { LinkPanel } from "./panels/LinkPanel";
import { CreatePanel } from "./panels/CreatePanel";

// ---------------------------------------------------------------------
// QuickAttachDialog — the "what is this file?" step machine.
//
//   stage → per-file chips (rejects flagged, unsavable)
//   type  → permission-filtered tiles; multi-file shows "apply to all"
//   decide→ Link (search + pick) | Create (module form) | plain (no-op)
//
// Nothing uploads from here directly: Task 6 wires the save engine that
// runs module creates then uploadDocument() per file.
// ---------------------------------------------------------------------

export type Decision =
  | { kind: "link"; typeKey: QuickTypeKey; targetId: string; targetLabel: string }
  | { kind: "create"; typeKey: QuickTypeKey; entityType: string; entityId: string }
  | { kind: "plain"; typeKey: "plain" };

export function QuickAttachDialog({
  claims,
  staged,
  onClose,
}: {
  claims: AppClaims;
  staged: StagedFile[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [activeIdx, setActiveIdx] = useState(0);
  const [step, setStep] = useState<"type" | "decide">("type");
  const [chosenType, setChosenType] = useState<QuickType | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [applyAll, setApplyAll] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const types = useMemo(() => visibleTypesForClaims((p) => can(claims, p)), [claims]);
  const active = staged[activeIdx];
  const doneCount = Object.keys(decisions).length;
  const allDecided = doneCount === staged.length;

  function record(d: Decision) {
    setDecisions((prev) => ({ ...prev, [activeIdx]: d }));
  }

  function applyToRemaining(d: Decision) {
    setDecisions((prev) => {
      const next = { ...prev };
      for (let i = 0; i < staged.length; i++) if (!next[i]) next[i] = d;
      return next;
    });
    setActiveIdx(staged.length - 1);
  }

  function advance() {
    const nextUndecided = staged.findIndex((_, i) => !decisions[i] && i !== activeIdx);
    if (nextUndecided >= 0) {
      setActiveIdx(nextUndecided);
      setChosenType(null);
      setStep("type");
    } else {
      setActiveIdx(staged.length); // review position
    }
  }

  // Commit a decision for the active file — or, with "apply to all" checked,
  // stamp it onto every still-undecided file at once. A created record is
  // bound to the one file it was made for, so apply-to-all never clones an
  // entity: it switches itself off and the rest are decided per file.
  const commit = (d: Decision) => {
    if (applyAll && d.kind === "create") {
      setApplyAll(false);
      toast.info("Create applies per file");
      record(d);
      advance();
      return;
    }
    record(d);
    if (applyAll) applyToRemaining(d); else advance();
  };

  function chooseType(t: QuickType) {
    setChosenType(t);
    if (t.key === "plain") {
      // Plain documents skip the decide step entirely.
      commit({ kind: "plain", typeKey: "plain" });
      return;
    }
    setStep("decide");
  }

  function finish() {
    // Task 6 replaces this with the real save engine.
    toast.success("Save engine lands in the next task");
    onClose();
  }

  const reviewing = activeIdx >= staged.length;

  return (
    <>
      <Dialog open onClose={() => setConfirmCancel(true)} title="Attach files" size="lg">
        <div className="flex flex-col gap-4">
          {/* Stage chips */}
          <div className="flex flex-wrap gap-2">
            {staged.map((s, i) => (
              <button
                key={`${s.file.name}-${i}`}
                type="button"
                onClick={() => { setActiveIdx(i); setChosenType(null); setStep("type"); }}
                className={`max-w-[240px] rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  i === activeIdx ? "border-brand bg-fill" : "border-line bg-white hover:border-line-strong"
                }`}
              >
                <span className="block truncate text-[12px] font-semibold text-ink">{s.file.name}</span>
                <span className="block text-[10px] text-ink-4">
                  {(s.file.size / 1024).toFixed(0)} KB
                  {decisions[i] ? " · decided" : s.rejection ? " · rejected" : ""}
                </span>
              </button>
            ))}
          </div>

          {/* Active file body */}
          {active && active.rejection && (
            <div className="rounded-lg border border-line bg-red-wash px-3 py-2 text-[12px] font-medium text-red">
              {active.rejection}
            </div>
          )}

          {!reviewing && active && !active.rejection && step === "type" && (
            <div>
              <p className="text-[13px] font-semibold text-ink">What is “{active.title}”?</p>
              {staged.length > 1 && (
                <label className="mt-2 flex w-fit items-center gap-2 text-[12px] text-ink-2">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)]"
                    checked={applyAll}
                    onChange={(e) => setApplyAll(e.target.checked)}
                  />
                  Apply the same choice to all files
                </label>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {types.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => chooseType(t)}
                    className="flex items-start gap-2.5 rounded-lg border border-line bg-white p-3 text-left transition-colors hover:border-brand"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fill text-[10px] font-bold text-ink-3">
                      {t.glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{t.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-4">{t.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!reviewing && active && !active.rejection && step === "decide" && chosenType && (
            <div>
              <div className="flex items-center gap-2">
                <Badge size="sm" tone="brand">{chosenType.label}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setStep("type")}>← change type</Button>
              </div>
              <DecidePanel
                typeKey={chosenType.key}
                canLink={chosenType.canLink}
                canCreate={chosenType.canCreate}
                onLinked={(targetId, targetLabel) => {
                  commit({ kind: "link", typeKey: chosenType.key, targetId, targetLabel });
                }}
                onCreate={(entityType, entityId) => {
                  commit({ kind: "create", typeKey: chosenType.key, entityType, entityId });
                }}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[11px] text-ink-4">{doneCount}/{staged.length} decided</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel</Button>
              <Button variant="primary" disabled={!allDecided} onClick={finish}>Attach</Button>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={onClose}
        title="Discard these files?"
        description="Nothing has been uploaded yet."
        confirmLabel="Discard"
        danger
      />
    </>
  );
}

// DecidePanel — link/create choice, hosting the real LinkPanel search and
// the per-type CreatePanel forms.
function DecidePanel({
  typeKey, canLink, canCreate, onLinked, onCreate,
}: {
  typeKey: QuickTypeKey;
  canLink: boolean;
  canCreate: boolean;
  onLinked: (targetId: string, targetLabel: string) => void;
  onCreate: (entityType: string, entityId: string) => void;
}) {
  const [mode, setMode] = useState<"link" | "create" | null>(null);
  if (!canLink && !canCreate) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2">
        {canLink && (
          <Button variant={mode === "link" ? "primary" : "secondary"} size="sm" onClick={() => setMode("link")}>
            Link to existing
          </Button>
        )}
        {canCreate && (
          <Button variant={mode === "create" ? "primary" : "secondary"} size="sm" onClick={() => setMode("create")}>
            Create new
          </Button>
        )}
      </div>
      {mode === "link" && <LinkPanel typeKey={typeKey} onPicked={onLinked} />}
      {mode === "create" && <CreatePanel typeKey={typeKey} onCreated={onCreate} />}
    </div>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import { can } from "@/lib/auth/claims";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { StagedFile } from "./QuickAttachProvider";
import { visibleTypesForClaims, type QuickType } from "@/lib/quick-attach/registry";
import { uploadDocument } from "@/lib/actions/documents";
import type { LinkHit, QuickTypeKey } from "@/lib/actions/quick-attach";
import { LinkPanel } from "./panels/LinkPanel";
import { CreatePanel } from "./panels/CreatePanel";

// ---------------------------------------------------------------------
// QuickAttachDialog — the "what is this file?" step machine.
//
//   stage → per-file chips (rejects flagged, unsavable)
//   type  → permission-filtered tiles; multi-file shows "apply to all"
//   decide→ Link (search + pick) | Create (module form) | plain (no-op)
//
// Attach runs the save engine: each decided file is uploaded sequentially
// via uploadDocument(), bound to its linked or created record (plain
// files land in the vault unbound). Per-file status chips track
// queued → working → done/error, with Retry for failures; the dialog
// closes only when every savable file succeeded.
// ---------------------------------------------------------------------

type SaveStatus = "queued" | "working" | "done" | "error";

export type Decision =
  | { kind: "link"; typeKey: QuickTypeKey; targetEntity: string; targetId: string; targetLabel: string }
  | { kind: "create"; typeKey: QuickTypeKey; entityType: string; entityId: string }
  | { kind: "plain"; typeKey: "plain" };

export function QuickAttachDialog({
  claims,
  staged,
  updateStaged,
  onClose,
}: {
  claims: AppClaims;
  staged: StagedFile[];
  updateStaged: (index: number, patch: Partial<Pick<StagedFile, "title" | "tags" | "visibility">>) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [activeIdx, setActiveIdx] = useState(0);
  const [step, setStep] = useState<"type" | "decide">("type");
  const [chosenType, setChosenType] = useState<QuickType | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [applyAll, setApplyAll] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<Record<number, SaveStatus>>({});
  const [saveError, setSaveError] = useState<Record<number, string>>({});

  const types = useMemo(() => visibleTypesForClaims((p) => can(claims, p)), [claims]);
  const active = staged[activeIdx];
  // Rejected files are unsavable — they neither need nor receive decisions,
  // and success is measured against the savable files only.
  const savableIdx = staged.flatMap((s, i) => (s.rejection ? [] : [i]));
  const doneCount = savableIdx.filter((i) => decisions[i]).length;
  const allDecided = savableIdx.length > 0 && doneCount === savableIdx.length;

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

  function chipStatus(i: number, s: StagedFile): string {
    switch (saveState[i]) {
      case "queued": return " · queued";
      case "working": return " · working…";
      case "done": return " · done ✓";
      case "error": return " · error !";
    }
    return decisions[i] ? " · decided" : s.rejection ? " · rejected" : "";
  }

  // Save one file: build its FormData (entity binding per decision kind) and
  // call uploadDocument. Returns whether it succeeded; failures — both typed
  // {ok:false} results and thrown server-action errors (network failure
  // rejects rather than returning) — are recorded as this file's error so
  // the remaining files still attempt.
  async function saveOne(i: number): Promise<boolean> {
    const s = staged[i];
    const d = decisions[i];
    if (!s || !d || s.rejection) return false;
    setSaveState((p) => ({ ...p, [i]: "working" }));
    const fd = new FormData();
    fd.set("file", s.file);
    fd.set("title", s.title.trim());
    fd.set("tags", s.tags);
    fd.set("visibility", s.visibility);
    if (d.kind === "link") { fd.set("entityType", d.targetEntity); fd.set("entityId", d.targetId); }
    if (d.kind === "create") { fd.set("entityType", d.entityType); fd.set("entityId", d.entityId); }
    try {
      const res = await uploadDocument(fd);
      if (!res.ok) {
        setSaveState((p) => ({ ...p, [i]: "error" }));
        setSaveError((p) => ({ ...p, [i]: res.errors.map((e) => e.message).join(" ") }));
        return false;
      }
      setSaveState((p) => ({ ...p, [i]: "done" }));
      return true;
    } catch (e: any) {
      setSaveState((p) => ({ ...p, [i]: "error" }));
      setSaveError((p) => ({ ...p, [i]: e?.message ?? "Upload failed." }));
      return false;
    }
  }

  // One upload in flight across Retry and Attach: a synchronous ref mutex is
  // checked-and-set before either entry point proceeds, and `saving` mirrors
  // it for the UI (Cancel/Attach disabled). A second click during a slow
  // retry or save is refused instead of queueing a duplicate upload.
  const busyRef = useRef(false);

  async function retryOne(i: number): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await saveOne(i);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  // Sequential save loop over the savable files. Already-done files are
  // skipped so a post-retry Attach never re-uploads them. Close only when
  // every savable file succeeded — otherwise stay open with the errors.
  // finally guarantees saving clears even if something above throws.
  async function finish() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const already = savableIdx.filter((i) => saveState[i] === "done");
      const todo = savableIdx.filter((i) => saveState[i] !== "done");
      setSaveState({
        ...Object.fromEntries(already.map((i) => [i, "done" as const])),
        ...Object.fromEntries(todo.map((i) => [i, "queued" as const])),
      });
      let okCount = already.length;
      for (const i of todo) {
        if (await saveOne(i)) okCount++;
      }
      if (okCount === savableIdx.length) {
        toast.success(`Attached ${okCount} file${okCount === 1 ? "" : "s"}`);
        onClose();
      } else {
        toast.error(`${savableIdx.length - okCount} file(s) failed — retry below.`);
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
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
                  {chipStatus(i, s)}
                </span>
              </button>
            ))}
          </div>

          {/* Save failures — message + Retry re-running just that upload */}
          {staged.map((s, i) =>
            saveState[i] === "error" && saveError[i] ? (
              <div
                key={`save-err-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-red-wash px-3 py-2"
              >
                <span className="min-w-0 text-[12px] font-medium text-red">
                  <span className="font-semibold">{s.file.name}</span> — {saveError[i]}
                </span>
                <Button variant="secondary" size="sm" disabled={saving} onClick={() => void retryOne(i)}>Retry</Button>
              </div>
            ) : null,
          )}

          {/* Active file body */}
          {active && active.rejection && (
            <div className="rounded-lg border border-line bg-red-wash px-3 py-2 text-[12px] font-medium text-red">
              {active.rejection}
            </div>
          )}

          {!reviewing && active && !active.rejection && !saving && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Title</span>
                <input
                  value={active.title}
                  onChange={(e) => updateStaged(activeIdx, { title: e.target.value })}
                  className="h-8 rounded-lg border border-line bg-white px-2.5 text-[12px] text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Tags</span>
                <input
                  value={active.tags}
                  placeholder="tags, comma, separated"
                  onChange={(e) => updateStaged(activeIdx, { tags: e.target.value })}
                  className="h-8 rounded-lg border border-line bg-white px-2.5 text-[12px] text-ink outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Visibility</span>
                <select
                  value={active.visibility}
                  onChange={(e) =>
                    updateStaged(activeIdx, { visibility: e.target.value as StagedFile["visibility"] })
                  }
                  className="h-8 rounded-lg border border-line bg-white px-2 text-[12px] text-ink outline-none focus:border-brand"
                >
                  <option value="internal">Internal</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
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
                onLinked={(hit) => {
                  commit({
                    kind: "link",
                    typeKey: chosenType.key,
                    targetEntity: hit.entity,
                    targetId: hit.id,
                    targetLabel: hit.title,
                  });
                }}
                onCreate={(entityType, entityId) => {
                  commit({ kind: "create", typeKey: chosenType.key, entityType, entityId });
                }}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-[11px] text-ink-4">{doneCount}/{savableIdx.length} decided</span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={saving} onClick={() => setConfirmCancel(true)}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!allDecided || saving} onClick={finish}>Attach</Button>
            </div>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={onClose}
        title="Discard these files?"
        description={
          Object.values(saveState).some((st) => st === "done")
            ? "Files already uploaded stay in the vault; anything else is discarded."
            : "Nothing has been uploaded yet."
        }
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
  onLinked: (hit: LinkHit) => void;
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

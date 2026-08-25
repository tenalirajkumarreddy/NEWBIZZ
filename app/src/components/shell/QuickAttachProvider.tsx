"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppClaims } from "@/lib/auth/claims";
import { fileRejectionReason } from "@/lib/documents-limits";
import { QuickAttachDialog } from "./QuickAttachDialog";

// ---------------------------------------------------------------------
// QuickAttachProvider — window-level "drop a file anywhere" plumbing.
//
// Owns: global drag detection (counter-based, Files-only), the full-
// screen drop overlay, the hidden multi-file picker behind the topbar ＋,
// and the staged-file queue handed to QuickAttachDialog. Purely client
// state — nothing uploads until the dialog's save step runs.
// ---------------------------------------------------------------------

interface QuickAttachContextValue {
  openPicker: () => void;
  openWithFiles: (files: File[]) => void;
}

const QuickAttachContext = createContext<QuickAttachContextValue | null>(null);

export function useQuickAttach(): QuickAttachContextValue {
  const ctx = useContext(QuickAttachContext);
  if (!ctx) throw new Error("useQuickAttach must be used inside <QuickAttachProvider>");
  return ctx;
}

export interface StagedFile {
  file: File;
  rejection: string | null;
  title: string;
  tags: string;
  visibility: "internal" | "restricted";
}

export function QuickAttachProvider({ claims, children }: { claims: AppClaims; children: ReactNode }) {
  const [dragDepth, setDragDepth] = useState(0);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Claims are held for the dialog's tile filtering (Task 4 consumes via prop drilling).
  const claimsRef = useRef(claims);
  claimsRef.current = claims;

  const openWithFiles = useCallback((files: File[]) => {
    const usable = Array.from(files).filter((f) => f.size > 0 || f.type);
    if (usable.length === 0) return;
    setStaged(
      usable.map((file) => ({
        file,
        rejection: fileRejectionReason(file),
        title: file.name.replace(/\.[^.]+$/, ""),
        tags: "",
        visibility: "internal" as const,
      })),
    );
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const updateStaged = useCallback(
    (index: number, patch: Partial<Pick<StagedFile, "title" | "tags" | "visibility">>) => {
      setStaged((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    },
    [],
  );

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => { if (!hasFiles(e)) return; depth += 1; setDragDepth(depth); };
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onLeave = () => { depth = Math.max(0, depth - 1); setDragDepth(depth); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragDepth(0);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) openWithFiles(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openWithFiles]);

  const ctx = useMemo(() => ({ openPicker, openWithFiles }), [openPicker, openWithFiles]);

  return (
    <QuickAttachContext.Provider value={ctx}>
      {children}

      {/* Hidden multi-file picker behind the topbar ＋ */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) openWithFiles(files);
          e.target.value = "";
        }}
      />

      {/* Full-screen drop overlay */}
      {dragDepth > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-brand/10 backdrop-blur-[2px]">
          <div className="rounded-xl border-2 border-dashed border-brand bg-surface px-8 py-6 shadow-pop">
            <p className="text-[15px] font-bold text-ink">Drop to attach</p>
            <p className="mt-1 text-[12px] text-ink-3">
              PDF, images or Office files · up to 10 MB each
            </p>
          </div>
        </div>
      )}

      {staged.length > 0 && (
        <QuickAttachDialog
          claims={claims}
          staged={staged}
          updateStaged={updateStaged}
          onClose={() => setStaged([])}
        />
      )}
    </QuickAttachContext.Provider>
  );
}

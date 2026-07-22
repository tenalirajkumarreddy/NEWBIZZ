"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Toast — transient notifications, bottom-right. Wrap the app (or a subtree) in
// <ToastProvider> and call const { toast } = useToast() anywhere below.
//
//   toast.success("Invoice posted", "INV-2026-0142");
//   toast.error("Could not post", err.message);
//
// Tones reuse notification_severity semantics (info/success/warning/critical).

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  show: (tone: ToastTone, title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  success: (title: string, detail?: string) => void;
  warning: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({
  children,
  duration = 4500,
}: {
  children: React.ReactNode;
  duration?: number;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      const id = ++seq.current;
      setItems((xs) => [...xs, { id, tone, title, detail }]);
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    },
    [dismiss, duration],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      info: (t, d) => show("info", t, d),
      success: (t, d) => show("success", t, d),
      warning: (t, d) => show("warning", t, d),
      error: (t, d) => show("error", t, d),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {items.map((it) => (
          <ToastCard key={it.id} item={it} onClose={() => dismiss(it.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { bar: string; icon: string; glyph: React.ReactNode }> = {
  info: { bar: "bg-brand", icon: "text-brand", glyph: <InfoGlyph /> },
  success: { bar: "bg-grn", icon: "text-grn", glyph: <CheckGlyph /> },
  warning: { bar: "bg-amb", icon: "text-amb", glyph: <WarnGlyph /> },
  error: { bar: "bg-red", icon: "text-red", glyph: <WarnGlyph /> },
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const s = TONE_STYLE[item.tone];
  return (
    <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-line bg-surface shadow-pop animate-in-pop">
      <div className={cn("w-1 shrink-0", s.bar)} />
      <div className="flex flex-1 items-start gap-2.5 px-3.5 py-3">
        <span className={cn("mt-0.5 shrink-0", s.icon)}>{s.glyph}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">{item.title}</p>
          {item.detail && <p className="mt-0.5 text-[12px] leading-snug text-ink-4">{item.detail}</p>}
        </div>
        <button
          onClick={onClose}
          className="-mr-1 shrink-0 rounded p-1 text-ink-4 transition-colors hover:bg-fill hover:text-ink"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function InfoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5m0-8h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function WarnGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 9v4m0 3h.01M10.3 4.9 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// Drawer — a right-side slide-in panel over a dim backdrop. Controlled via
// `open`/`onClose`. Closes on Escape and backdrop click; locks body scroll while
// open; restores focus on close. Rendered through a portal onto <body> so it
// sits above the app shell regardless of where it's mounted. Use for create/
// record surfaces that used to be their own /new page — the form stays put and
// the user never leaves the list they were on.

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Panel width. Forms with line tables want "lg"/"xl". */
  size?: "sm" | "md" | "lg" | "xl";
  children?: React.ReactNode;
}

const WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

export function Drawer({ open, onClose, title, description, size = "lg", children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Delay unmount by one frame so the exit transition can play.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame → flip to shown so the CSS transition runs from off-screen.
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [mounted, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      {/* backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-ink/40 backdrop-blur-[1px] transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      {/* panel — pinned right, slides in from the edge */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-pop outline-none",
          "border-l border-line transition-transform duration-200 ease-out",
          WIDTHS[size],
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[16px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[12px] leading-relaxed text-ink-4">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-ink-4 transition-colors hover:bg-fill hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

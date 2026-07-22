"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

// Dialog — a centered modal over a dim backdrop. Controlled via `open`/`onClose`.
// Closes on Escape and backdrop click; locks body scroll while open; restores
// focus to the previously-focused element on close. Keep it small and focused —
// forms, confirms, quick detail. Not for full pages.

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer content, typically buttons; right-aligned. */
  footer?: React.ReactNode;
  /** Max width class. Defaults to a comfortable form width. */
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}

const WIDTHS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" } as const;

export function Dialog({ open, onClose, title, description, footer, size = "md", children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] animate-in-fade"
        onClick={onClose}
        aria-hidden
      />
      {/* panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-xl border border-line bg-surface shadow-pop outline-none animate-in-pop",
          WIDTHS[size],
        )}
      >
        {(title || description) && (
          <div className="border-b border-line px-5 py-4">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-[12px] leading-relaxed text-ink-4">{description}</p>}
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ConfirmDialog — the common "are you sure?" case built on Dialog.
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

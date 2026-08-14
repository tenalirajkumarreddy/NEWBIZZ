import { cn } from "@/lib/cn";

// Tooltip — a bare ⓘ hint that reveals a short explanation on hover/focus.
// Used in the permission rows to explain what a permission does and where it
// comes from (role vs override). Native `title` is kept as a keyboard/AT
// fallback; the floating label is pure CSS (no portal, no JS) so it stays cheap
// in long lists.
//
//   <Tooltip text="Who can create invoices and cash memos." />

export interface TooltipProps {
  /** The explanation shown on hover/focus. */
  text: string;
  className?: string;
}

export function Tooltip({ text, className }: TooltipProps) {
  return (
    <span
      className={cn("group/tip relative inline-flex", className)}
      title={text}
      aria-label={text}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-line-soft text-[10px] font-bold leading-none text-ink-3 ring-1 ring-inset ring-line transition-colors group-hover/tip:bg-brand-wash group-hover/tip:text-brand">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-ink-2 opacity-0 shadow-lg transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100">
        {text}
      </span>
    </span>
  );
}
